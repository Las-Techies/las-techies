import type { NextFunction, Request, Response } from "express";
import {
  createDocument,
  deleteDocumentForUser,
  findDocumentsForUser,
  findDocumentsForTeam,
  findDocumentByIdForTeam,
} from "../models/document.model";
import { findUsersByIds } from "../models/user.model";
import {
  extractGoogleDocLinks,
  extractTextFromGoogleDriveFile,
  extractTextFromDocument,
  isSupportedGoogleDriveFile,
  listGoogleDriveFolderFiles,
  extractTextFromGithubFile,
  isSupportedGithubFile,
  listGithubRepoFiles,
  parseGithubRepoUrl,
  extractTextFromGoogleDriveUrl,
} from "../services/documentProcessor";
import { embedDocument, embedDocumentsWithConcurrency } from "../services/documentEmbedder";
import { getSignedFileUrl, uploadOriginalFile } from "../services/documentStorage";
import { findQuizzesReferencingDocument } from "../models/quiz.model";

type AuthUser = {
  id: number;
  teamId: number;
};

type ImportGoogleDriveBody = {
  url?: string;
  googleAccessToken?: string;
};

type ImportGoogleDriveFolderBody = {
  folderId?: string;
  folderUrl?: string;
  googleAccessToken?: string;
  maxFiles?: number;
};

type ImportGithubRepoBody = {
  repoUrl?: string;
  branch?: string;
  githubAccessToken?: string;
  maxFiles?: number;
};

type LinkedImportItem = {
  documentId: number | null;
  sourceUrl: string;
  title: string;
  status: "ready" | "failed";
  createdAt: Date | null;
  error?: string;
};

async function importLinkedGoogleDocs(
  teamId: number,
  uploadedByUserId: number,
  links: string[]
): Promise<{
  imported: number;
  failed: number;
  items: LinkedImportItem[];
}> {
  const items: LinkedImportItem[] = [];
  let imported = 0;
  let failed = 0;

  for (const link of links) {
    try {
      const linkedDoc = await extractTextFromGoogleDriveUrl(link);

      // Best-effort: if the PDF export failed or Storage is unreachable,
      // we still keep the extracted text so the document is usable (just
      // falls back to the text-only viewer instead of showing the real doc).
      const stored = linkedDoc.originalFile
        ? await uploadOriginalFile(teamId, linkedDoc.originalFile)
        : null;

      const linkedDocument = await createDocument({
        teamId,
        uploadedByUserId,
        title: linkedDoc.title,
        sourceType: "google_drive",
        sourceUrl: link,
        rawText: linkedDoc.rawText,
        status: "ready",
        storagePath: stored?.storagePath ?? null,
        mimeType: stored?.mimeType ?? null,
      });

      // Best-effort: the chatbot's retrieval index shouldn't block the
      // import response, and a document is still useful for quiz
      // generation even if embedding fails (e.g. model download hiccup).
      embedDocument({
        id: linkedDocument.id,
        teamId,
        title: linkedDocument.title,
        rawText: linkedDoc.rawText,
      }).catch((error) => {
        console.error(`Failed to embed document ${linkedDocument.id} for chat retrieval:`, error);
      });

      imported += 1;
      items.push({
        documentId: linkedDocument.id,
        sourceUrl: link,
        title: linkedDocument.title,
        status: "ready",
        createdAt: linkedDocument.createdAt,
      });
    } catch (error) {
      const failedLinkedDocument = await createDocument({
        teamId,
        uploadedByUserId,
        title: "Linked Google Doc Import",
        sourceType: "google_drive",
        sourceUrl: link,
        rawText: null,
        status: "failed",
      });

      failed += 1;
      items.push({
        documentId: failedLinkedDocument.id,
        sourceUrl: link,
        title: failedLinkedDocument.title,
        status: "failed",
        createdAt: failedLinkedDocument.createdAt,
        error: (error as Error).message,
      });
    }
  }

  return { imported, failed, items };
}

export async function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: { message: "No file uploaded" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    try {
      const rawText = await extractTextFromDocument(file);
      const linkedGoogleDocUrls = extractGoogleDocLinks(rawText, 5);

      // Best-effort: if Storage is unreachable, we still keep the extracted
      // text so the document is usable (just falls back to the text-only
      // viewer instead of showing the original file).
      const stored = await uploadOriginalFile(user.teamId, file);

      const document = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title: file.originalname,
        sourceType: "upload",
        rawText,
        status: "ready",
        storagePath: stored?.storagePath ?? null,
        mimeType: stored?.mimeType ?? null,
      });

      const linkedImport = await importLinkedGoogleDocs(
        user.teamId,
        user.id,
        linkedGoogleDocUrls
      );

      // Best-effort: the chatbot's retrieval index shouldn't block the
      // upload response, and a document is still useful for quiz
      // generation even if embedding fails (e.g. model download hiccup).
      embedDocument({
        id: document.id,
        teamId: document.teamId,
        title: document.title,
        rawText,
      }).catch((error) => {
        console.error(`Failed to embed document ${document.id} for chat retrieval:`, error);
      });

      return res.status(201).json({
        data: {
          id: document.id,
          title: document.title,
          status: document.status,
          createdAt: document.createdAt,
          linkedImportSummary: {
            totalFound: linkedGoogleDocUrls.length,
            imported: linkedImport.imported,
            failed: linkedImport.failed,
            items: linkedImport.items,
          },
        },
      });
    } catch (error) {
      const failedDocument = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title: file.originalname,
        sourceType: "upload",
        rawText: null,
        status: "failed",
      });

      return res.status(422).json({
        error: { message: (error as Error).message },
        data: {
          id: failedDocument.id,
          status: failedDocument.status,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getDocumentById(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res
        .status(400)
        .json({ error: { message: "Invalid documentId" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const document = await findDocumentByIdForTeam(documentId, user.teamId);

    if (!document) {
      return res.status(404).json({ error: { message: "Document not found" } });
    }

    return res.json({ data: document });
  } catch (error) {
    next(error);
  }
}

// Returns a fresh, short-lived signed URL for the original file so the
// frontend can embed the real document instead of the extracted-text
// fallback. Documents uploaded before this feature (or imported from
// Google Drive/GitHub) have no storagePath, so `url` comes back null and
// the caller should fall back to the rawText viewer.
export async function getDocumentFileUrl(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res
        .status(400)
        .json({ error: { message: "Invalid documentId" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const document = await findDocumentByIdForTeam(documentId, user.teamId);
    if (!document) {
      return res.status(404).json({ error: { message: "Document not found" } });
    }

    if (!document.storagePath) {
      return res.json({ data: { url: null, mimeType: null } });
    }

    const url = await getSignedFileUrl(document.storagePath);
    return res.json({ data: { url, mimeType: document.mimeType } });
  } catch (error) {
    next(error);
  }
}

export async function deleteDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res
        .status(400)
        .json({ error: { message: "Invalid documentId" } });
    }

    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const referencingQuizzes = await findQuizzesReferencingDocument(documentId, user.teamId);
    if (referencingQuizzes.length > 0) {
      const quizTitles = referencingQuizzes.map((quiz) => quiz.title).join(", ");
      return res.status(409).json({
        error: {
          message: `This document is used in an existing quiz (${quizTitles}) and can't be deleted. Delete the quiz first, or leave the document as-is.`,
        },
      });
    }

    const result = await deleteDocumentForUser(documentId, user.id, user.teamId);
    if (result.count === 0) {
      return res.status(404).json({ error: { message: "Document not found" } });
    }

    return res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getMyDocuments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const documents = await findDocumentsForUser(user.id, user.teamId);
    return res.json({ data: documents });
  } catch (error) {
    next(error);
  }
}

// Team-wide document list with uploader attribution, so a manager can pick
// a teammate's upload for their own quiz and see who added it and when.
export async function getTeamDocuments(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const documents = await findDocumentsForTeam(user.teamId);
    const uploaderIds = [...new Set(documents.map((doc) => doc.uploadedByUserId))];
    const uploaders = await findUsersByIds(uploaderIds);
    const uploaderById = new Map(uploaders.map((uploader) => [uploader.id, uploader]));

    return res.json({
      data: documents.map((doc) => {
        const uploader = uploaderById.get(doc.uploadedByUserId);
        return {
          id: doc.id,
          title: doc.title,
          status: doc.status,
          createdAt: doc.createdAt,
          uploadedByUserId: doc.uploadedByUserId,
          uploadedByName: uploader ? `${uploader.firstName} ${uploader.lastName}`.trim() : "Unknown",
          isMine: doc.uploadedByUserId === user.id,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function importGoogleDriveDocument(//import from google drive url
  req: Request<unknown, unknown, ImportGoogleDriveBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const url = req.body?.url?.trim();
    if (!url) {
      return res
        .status(400)
        .json({ error: { message: "Google Docs URL is required" } });
    }

    try {
      const { title, rawText, originalFile } = await extractTextFromGoogleDriveUrl(url);
      const linkedGoogleDocUrls = extractGoogleDocLinks(rawText, 5);

      // Best-effort: if the PDF export failed or Storage is unreachable,
      // we still keep the extracted text so the document is usable (just
      // falls back to the text-only viewer instead of showing the real doc).
      const stored = originalFile ? await uploadOriginalFile(user.teamId, originalFile) : null;

      const document = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title,
        sourceType: "google_drive",
        sourceUrl: url,
        rawText,
        status: "ready",
        storagePath: stored?.storagePath ?? null,
        mimeType: stored?.mimeType ?? null,
      });

      // Best-effort: the chatbot's retrieval index shouldn't block the
      // import response, and a document is still useful for quiz
      // generation even if embedding fails (e.g. model download hiccup).
      embedDocument({
        id: document.id,
        teamId: document.teamId,
        title: document.title,
        rawText,
      }).catch((error) => {
        console.error(`Failed to embed document ${document.id} for chat retrieval:`, error);
      });

      const linkedImport = await importLinkedGoogleDocs(
        user.teamId,
        user.id,
        linkedGoogleDocUrls
      );

      return res.status(201).json({
        data: {
          id: document.id,
          title: document.title,
          status: document.status,
          createdAt: document.createdAt,
          linkedImportSummary: {
            totalFound: linkedGoogleDocUrls.length,
            imported: linkedImport.imported,
            failed: linkedImport.failed,
            items: linkedImport.items,
          },
        },
      });
    } catch (error) {
      const failedDocument = await createDocument({
        teamId: user.teamId,
        uploadedByUserId: user.id,
        title: "Google Drive Import",
        sourceType: "google_drive",
        sourceUrl: url,
        rawText: null,
        status: "failed",
      });

      return res.status(422).json({
        error: { message: (error as Error).message },
        data: {
          id: failedDocument.id,
          status: failedDocument.status,
        },
      });
    }
  } catch (error) {
    next(error);
  }
}

function extractFolderId(input: string): string | null {
  const trimmed = input.trim();
  const directIdPattern = /^[A-Za-z0-9_-]{10,}$/;
  if (directIdPattern.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/folders\/([^/]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function importGoogleDriveFolder(//import from google drive folder url
  req: Request<unknown, unknown, ImportGoogleDriveFolderBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const folderInput = req.body?.folderId?.trim() || req.body?.folderUrl?.trim();
    const googleAccessToken = req.body?.googleAccessToken?.trim();
    const maxFiles = Math.min(Math.max(Number(req.body?.maxFiles ?? 25), 1), 100);

    if (!folderInput) {
      return res
        .status(400)
        .json({ error: { message: "Google Drive folder ID or URL is required" } });
    }
    if (!googleAccessToken) {
      return res
        .status(400)
        .json({ error: { message: "Google access token is required" } });
    }

    const folderId = extractFolderId(folderInput);
    if (!folderId) {
      return res
        .status(400)
        .json({ error: { message: "Invalid Google Drive folder URL or ID" } });
    }

    const files = await listGoogleDriveFolderFiles(folderId, googleAccessToken, maxFiles);
    const supportedFiles = files.filter(isSupportedGoogleDriveFile);
    const skipped = files.length - supportedFiles.length;

    const items: Array<{
      documentId: number | null;
      title: string;
      status: "ready" | "failed";
      createdAt: Date | null;
      sourceUrl: string | null;
      error?: string;
    }> = [];

    let imported = 0;
    let failed = 0;
    const documentsToEmbed: Array<{
      id: number;
      teamId: number;
      title: string;
      rawText: string;
    }> = [];

    for (const file of supportedFiles) {
      try {
        const extracted = await extractTextFromGoogleDriveFile(file, googleAccessToken);

        // Best-effort: if the export/download failed or Storage is
        // unreachable, we still keep the extracted text so the document is
        // usable (just falls back to the text-only viewer).
        const stored = extracted.originalFile
          ? await uploadOriginalFile(user.teamId, extracted.originalFile)
          : null;

        const document = await createDocument({
          teamId: user.teamId,
          uploadedByUserId: user.id,
          title: extracted.title,
          sourceType: "google_drive",
          sourceUrl: extracted.sourceUrl,
          rawText: extracted.rawText,
          status: "ready",
          storagePath: stored?.storagePath ?? null,
          mimeType: stored?.mimeType ?? null,
        });
        imported += 1;
        items.push({
          documentId: document.id,
          title: document.title,
          status: "ready",
          createdAt: document.createdAt,
          sourceUrl: extracted.sourceUrl,
        });
        documentsToEmbed.push({
          id: document.id,
          teamId: document.teamId,
          title: document.title,
          rawText: extracted.rawText,
        });
      } catch (error) {
        const sourceUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
        const failedDocument = await createDocument({
          teamId: user.teamId,
          uploadedByUserId: user.id,
          title: file.name,
          sourceType: "google_drive",
          sourceUrl,
          rawText: null,
          status: "failed",
        });
        failed += 1;
        items.push({
          documentId: failedDocument.id,
          title: failedDocument.title,
          status: "failed",
          createdAt: failedDocument.createdAt,
          sourceUrl,
          error: (error as Error).message,
        });
      }
    }

    // Best-effort and not awaited: the chatbot's retrieval index shouldn't
    // block the import response, and documents are still usable for quiz
    // generation even if embedding fails. Runs with a small concurrency cap
    // (see embedDocumentsWithConcurrency) instead of firing all of them at
    // once, since a folder import can produce up to 100 documents.
    embedDocumentsWithConcurrency(documentsToEmbed).catch((error) => {
      console.error("Failed to embed one or more imported Google Drive documents:", error);
    });

    return res.status(200).json({
      data: {
        folderId,
        totalFound: files.length,
        imported,
        failed,
        skipped,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function importGithubRepo(
  req: Request<unknown, unknown, ImportGithubRepoBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const repoUrl = req.body?.repoUrl?.trim();
    if (!repoUrl) {
      return res
        .status(400)
        .json({ error: { message: "GitHub repository URL is required" } });
    }

    const maxFiles = Math.min(Math.max(Number(req.body?.maxFiles ?? 25), 1), 100);
    const githubAccessToken = req.body?.githubAccessToken?.trim() || undefined;
    const { owner, repo } = parseGithubRepoUrl(repoUrl);
    const { branch, files } = await listGithubRepoFiles(
      owner,
      repo,
      req.body?.branch,
      githubAccessToken,
      maxFiles
    );

    const supportedFiles = files.filter((file) => isSupportedGithubFile(file.path));
    const skipped = files.length - supportedFiles.length;

    const items: Array<{
      documentId: number | null;
      title: string;
      status: "ready" | "failed";
      createdAt: Date | null;
      sourceUrl: string | null;
      error?: string;
    }> = [];

    let imported = 0;
    let failed = 0;
    const documentsToEmbed: Array<{
      id: number;
      teamId: number;
      title: string;
      rawText: string;
    }> = [];

    for (const file of supportedFiles) {
      try {
        const extracted = await extractTextFromGithubFile(
          owner,
          repo,
          branch,
          file.path,
          githubAccessToken
        );

        const document = await createDocument({
          teamId: user.teamId,
          uploadedByUserId: user.id,
          title: extracted.title,
          sourceType: "github",
          sourceUrl: extracted.sourceUrl,
          rawText: extracted.rawText,
          status: "ready",
        });
        imported += 1;
        items.push({
          documentId: document.id,
          title: document.title,
          status: "ready",
          createdAt: document.createdAt,
          sourceUrl: extracted.sourceUrl,
        });
        documentsToEmbed.push({
          id: document.id,
          teamId: document.teamId,
          title: document.title,
          rawText: extracted.rawText,
        });
      } catch (error) {
        const sourceUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${file.path}`;
        const failedDocument = await createDocument({
          teamId: user.teamId,
          uploadedByUserId: user.id,
          title: file.path,
          sourceType: "github",
          sourceUrl,
          rawText: null,
          status: "failed",
        });
        failed += 1;
        items.push({
          documentId: failedDocument.id,
          title: failedDocument.title,
          status: "failed",
          createdAt: failedDocument.createdAt,
          sourceUrl,
          error: (error as Error).message,
        });
      }
    }

    // Best-effort and not awaited: the chatbot's retrieval index shouldn't
    // block the import response, and documents are still usable for quiz
    // generation even if embedding fails. Runs with a small concurrency cap
    // (see embedDocumentsWithConcurrency) instead of firing all of them at
    // once, since a repo import can produce up to 100 documents.
    embedDocumentsWithConcurrency(documentsToEmbed).catch((error) => {
      console.error("Failed to embed one or more imported GitHub documents:", error);
    });

    return res.status(200).json({
      data: {
        owner,
        repo,
        branch,
        totalFound: files.length,
        imported,
        failed,
        skipped,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}