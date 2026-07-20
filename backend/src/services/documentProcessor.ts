import { PDFParse } from "pdf-parse";
import mammoth from 'mammoth';


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

export async function extractTextFromGoogleDriveUrl(url: string): Promise<{
  title: string;
  rawText: string;
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

  return {
    title: `GoogleDoc-${docId}`,
    rawText,
  };
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
): Promise<{ title: string; rawText: string; sourceUrl: string }> {
  let rawText = "";

  if (file.mimeType === "application/vnd.google-apps.document") {
    const params = new URLSearchParams({ mimeType: "text/plain" });
    const response = await googleDriveRequest(
      `files/${file.id}/export?${params.toString()}`,
      googleAccessToken
    );
    rawText = (await response.text()).trim();
  } else {
    const response = await googleDriveRequest(
      `files/${file.id}?alt=media&supportsAllDrives=true`,
      googleAccessToken
    );
    const bytes = await response.arrayBuffer();
    rawText = await extractTextFromDocument({
      buffer: Buffer.from(bytes),
      mimetype: file.mimeType,
      originalname: file.name,
    });
  }

  if (!rawText) {
    throw new Error("No readable text found in Google Drive file.");
  }

  return {
    title: file.name,
    rawText,
    sourceUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`,
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

