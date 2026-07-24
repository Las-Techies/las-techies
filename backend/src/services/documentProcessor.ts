import { PDFParse } from "pdf-parse";
import mammoth from 'mammoth';
import { env } from "../config/env";


type UploadedFile = {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
};

type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
};

type GithubTreeEntry = {
  path: string;
  type: "blob" | "tree";
  size?: number;
  url: string;
};

function getExtension(filename: string): string {//will get the .pdf, .docx, .doc, .txt, .csv, .xls, .xlsx, .ppt, .pptx
    const parts = filename.toLowerCase().split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
}

//core text extractor function; checking the type, uses the right parser for that type, extracts the text, cleans it
//for unsupported types, throws an error and returns usable text for saving it to documents.raw_text

export async function extractTextFromDocument(file: UploadedFile): Promise<string> {
    const extension = getExtension(file.originalname);
    let text = "";

   if (extension === ".txt" || extension === ".md" || file.mimetype.startsWith("text/")) {
    //treat as text file
    text = file.buffer.toString("utf-8");
} else if (extension === ".pdf" || file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    text = pdfData.text ?? "";
   } else if (extension === ".docx" || 
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result.value ?? "";
  } else { 
   throw new Error("Unsupported file type. Use .txt, .md, .pdf, or .docx");
  }

  //final text cleaning: removing extra whitespace, newlines, and formatting characters
  const cleaned = text.trim();
  if (!cleaned){
    throw new Error("No readable text found in document");
  }

  return cleaned;
}

function getGoogleDocIdFromUrl(url: URL): string | null {
  const match = url.pathname.match(/\/document\/d\/([^/]+)/);
  return match?.[1] ?? null;
}

export type OriginalFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

// Best-effort export of a Google Doc as a PDF, purely so the viewer can show
// the real formatted document instead of always falling back to plain
// extracted text. This is separate from (and never blocks) the text export
// above — a failure here just means the document won't have a stored
// original file, the same degraded-but-usable state a direct upload gets
// into if Supabase Storage is unreachable.
async function tryExportGoogleDocAsPdf(docId: string, originalname: string): Promise<OriginalFile | undefined> {
  try {
    const response = await fetch(`https://docs.google.com/document/d/${docId}/export?format=pdf`);
    if (!response.ok) return undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return undefined;
    return { buffer, mimetype: "application/pdf", originalname };
  } catch {
    return undefined;
  }
}

export async function extractTextFromGoogleDriveUrl(url: string): Promise<{
  title: string;
  rawText: string;
  originalFile?: OriginalFile | undefined;
}> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid URL. Please paste a valid Google Docs link.");
  }

  if (parsedUrl.hostname !== "docs.google.com") {
    throw new Error("Only Google Docs links are supported for MVP.");
  }

  const docId = getGoogleDocIdFromUrl(parsedUrl);
  if (!docId) {
    throw new Error("Invalid Google Docs URL.");
  }

  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const response = await fetch(exportUrl);

  if (!response.ok) {
    throw new Error(
      "Unable to access Google Doc. Check sharing permissions and try again."
    );
  }

  const rawText = (await response.text()).trim();
  if (!rawText) {
    throw new Error("No readable text found in Google Doc.");
  }

  const title = `GoogleDoc-${docId}`;
  const originalFile = await tryExportGoogleDocAsPdf(docId, `${title}.pdf`);

  return {
    title,
    rawText,
    originalFile,
  };
}

export function extractGoogleDocLinks(rawText: string, maxLinks = 5): string[] {
  if (!rawText?.trim() || maxLinks <= 0) {
    return [];
  }

  const candidates = rawText.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const uniqueLinks = new Set<string>();
  const links: string[] = [];

  for (const candidate of candidates) {
    const trimmedCandidate = candidate.replace(/[),.;!?]+$/, "");

    try {
      const parsed = new URL(trimmedCandidate);
      if (parsed.hostname !== "docs.google.com") {
        continue;
      }

      const docIdMatch = parsed.pathname.match(/\/document\/d\/([^/]+)/);
      const docId = docIdMatch?.[1];
      if (!docId) {
        continue;
      }

      const normalized = `https://docs.google.com/document/d/${docId}`;
      if (uniqueLinks.has(normalized)) {
        continue;
      }

      uniqueLinks.add(normalized);
      links.push(normalized);
      if (links.length >= maxLinks) {
        break;
      }
    } catch {
      // Ignore invalid URLs and continue parsing.
    }
  }

  return links;
}

function ensureGoogleAccessToken(token: string) {
  if (!token?.trim()) {
    throw new Error("Google access token is required.");
  }
}

async function googleDriveRequest(
  endpoint: string,
  googleAccessToken: string,
  init?: RequestInit
) {
  ensureGoogleAccessToken(googleAccessToken);
  const response = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${googleAccessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(
      `Google Drive API request failed (${response.status}). ${payload || "Try reconnecting Google sign-in."}`
    );
  }

  return response;
}

export async function listGoogleDriveFolderFiles(
  folderId: string,
  googleAccessToken: string,
  maxFiles = 25
): Promise<GoogleDriveFile[]> {
  const query = `'${folderId}' in parents and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,mimeType,webViewLink)",
    pageSize: String(maxFiles),
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const response = await googleDriveRequest(
    `files?${params.toString()}`,
    googleAccessToken
  );
  const payload = (await response.json()) as { files?: GoogleDriveFile[] };
  return payload.files ?? [];
}

export async function extractTextFromGoogleDriveFile(
  file: GoogleDriveFile,
  googleAccessToken: string
): Promise<{ title: string; rawText: string; sourceUrl: string; originalFile?: OriginalFile | undefined }> {
  let rawText = "";
  let originalFile: OriginalFile | undefined;

  if (file.mimeType === "application/vnd.google-apps.document") {
    const params = new URLSearchParams({ mimeType: "text/plain" });
    const response = await googleDriveRequest(
      `files/${file.id}/export?${params.toString()}`,
      googleAccessToken
    );
    rawText = (await response.text()).trim();

    // Best-effort: also export a real PDF so the viewer can show the
    // formatted document instead of falling back to plain extracted text.
    // A failure here doesn't affect the text extraction above.
    try {
      const pdfParams = new URLSearchParams({ mimeType: "application/pdf" });
      const pdfResponse = await googleDriveRequest(
        `files/${file.id}/export?${pdfParams.toString()}`,
        googleAccessToken
      );
      const buffer = Buffer.from(await pdfResponse.arrayBuffer());
      if (buffer.length > 0) {
        originalFile = { buffer, mimetype: "application/pdf", originalname: `${file.name}.pdf` };
      }
    } catch {
      // Non-fatal — text extraction above already succeeded.
    }
  } else {
    const response = await googleDriveRequest(
      `files/${file.id}?alt=media&supportsAllDrives=true`,
      googleAccessToken
    );
    const bytes = await response.arrayBuffer();
    const buffer = Buffer.from(bytes);
    rawText = await extractTextFromDocument({
      buffer,
      mimetype: file.mimeType,
      originalname: file.name,
    });
    // This file (PDF/DOCX/etc.) already exists as a real file in Drive —
    // the bytes we just downloaded to extract text from ARE the original,
    // so no extra export call is needed to get a storable copy.
    originalFile = { buffer, mimetype: file.mimeType, originalname: file.name };
  }

  if (!rawText) {
    throw new Error("No readable text found in Google Drive file.");
  }

  return {
    title: file.name,
    rawText,
    sourceUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
    originalFile,
  };
}

export function isSupportedGoogleDriveFile(file: GoogleDriveFile): boolean {
  const supportedMimeTypes = new Set([
    "application/vnd.google-apps.document",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
  ]);
  return supportedMimeTypes.has(file.mimeType) || file.name.toLowerCase().endsWith(".md");
}

type ParsedGithubRepo = {
  owner: string;
  repo: string;
};

export function parseGithubRepoUrl(repoUrl: string): ParsedGithubRepo {
  let parsed: URL;
  try {
    parsed = new URL(repoUrl.trim());
  } catch {
    throw new Error("Invalid GitHub repository URL.");
  }

  if (parsed.hostname !== "github.com") {
    throw new Error("Only github.com repository links are supported.");
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  const owner = parts.at(0);
  const repoPart = parts.at(1);
  if (!owner || !repoPart) {
    throw new Error("GitHub repository URL must include owner and repo name.");
  }

  return {
    owner,
    repo: repoPart.replace(/\.git$/i, ""),
  };
}

async function githubApiRequest(
  endpoint: string,
  githubAccessToken?: string
): Promise<Response> {
  const resolvedToken = githubAccessToken?.trim() || env.githubToken.trim();
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "las-techies-onboarding-quiz",
      ...(resolvedToken
        ? { Authorization: `Bearer ${resolvedToken}` }
        : {}),
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(
      `GitHub API request failed (${response.status}). ${payload || "Make sure the repo is public and exists."}`
    );
  }

  return response;
}

async function fetchDefaultBranch(
  owner: string,
  repo: string,
  githubAccessToken?: string
): Promise<string> {
  const response = await githubApiRequest(
    `/repos/${owner}/${repo}`,
    githubAccessToken
  );
  const payload = (await response.json()) as { default_branch?: string };
  if (!payload.default_branch) {
    throw new Error("Could not determine repository default branch.");
  }
  return payload.default_branch;
}

export async function listGithubRepoFiles(
  owner: string,
  repo: string,
  branch: string | undefined,
  githubAccessToken: string | undefined,
  maxFiles = 25
): Promise<{ branch: string; files: GithubTreeEntry[] }> {
  const resolvedBranch =
    branch?.trim() || (await fetchDefaultBranch(owner, repo, githubAccessToken));
  const response = await githubApiRequest(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(resolvedBranch)}?recursive=1`,
    githubAccessToken
  );
  const payload = (await response.json()) as { tree?: GithubTreeEntry[] };

  const files = (payload.tree ?? [])
    .filter((entry) => entry.type === "blob")
    .slice(0, maxFiles);

  return { branch: resolvedBranch, files };
}

export function isSupportedGithubFile(path: string): boolean {
  const normalized = path.toLowerCase();
  if (
    normalized.includes("node_modules/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/build/")
  ) {
    return false;
  }
  return normalized.endsWith(".md");
}

export async function extractTextFromGithubFile(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  githubAccessToken?: string
): Promise<{ title: string; rawText: string; sourceUrl: string }> {
  const response = await githubApiRequest(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
    githubAccessToken
  );
  const payload = (await response.json()) as { content?: string; encoding?: string };
  if (!payload.content || payload.encoding !== "base64") {
    throw new Error("Unsupported repository file payload.");
  }

  const rawText = Buffer.from(payload.content, "base64").toString("utf-8").trim();
  if (!rawText) {
    throw new Error("No readable text found in repository file.");
  }

  return {
    title: path,
    rawText,
    sourceUrl: `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(branch)}/${path}`,
  };
}

