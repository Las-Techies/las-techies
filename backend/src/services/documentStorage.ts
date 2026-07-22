import { supabaseAdmin } from "../db/supabaseAdmin";
import { env } from "../config/env";

const BUCKET = env.documentsStorageBucket;
const TEN_MB = 10 * 1024 * 1024; // matches the multer limit in middleware/upload.ts

type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
};

// Storage paths can't contain most punctuation/whitespace safely, so we
// strip everything but alphanumerics, dots, dashes and underscores.
function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Idempotent: safe to call on every server startup. Creates the private
// bucket that holds original document bytes if it doesn't exist yet, so
// there's no manual Supabase dashboard step required to enable this feature.
export async function ensureDocumentsBucket(): Promise<void> {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    console.warn(
      "Skipping Supabase Storage bucket setup: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Document viewing will fall back to extracted text only."
    );
    return;
  }

  try {
    const { data: existing, error: getError } = await supabaseAdmin.storage.getBucket(BUCKET);
    if (existing) return;

    // getBucket errors on "not found" too, so only treat truly unexpected
    // errors as fatal — otherwise fall through to (idempotently) create it.
    if (getError && !/not.*found/i.test(getError.message)) {
      console.error("Failed to look up Supabase Storage bucket:", getError.message);
    }

    const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: TEN_MB,
    });
    if (createError && !/already exists/i.test(createError.message)) {
      console.error("Failed to create Supabase Storage bucket:", createError.message);
    }
  } catch (error) {
    console.error("Unexpected error ensuring Supabase Storage bucket exists:", error);
  }
}

// Uploads the original file bytes so the viewer can later show the real
// document. Returns null (rather than throwing) on failure so callers can
// degrade gracefully to the text-only viewer, the same way a failed text
// extraction still leaves a usable (if degraded) document record.
export async function uploadOriginalFile(
  teamId: number,
  file: UploadableFile
): Promise<{ storagePath: string; mimeType: string } | null> {
  try {
    const path = `team-${teamId}/${Date.now()}-${sanitizeFilename(file.originalname)}`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, file.buffer, {
      contentType: file.mimetype || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      console.error(`Failed to upload original file to Supabase Storage (${path}):`, error.message);
      return null;
    }
    return { storagePath: path, mimeType: file.mimetype || "application/octet-stream" };
  } catch (error) {
    console.error("Unexpected error uploading original file to Supabase Storage:", error);
    return null;
  }
}

// Short-lived signed URL for viewing/downloading the original file. Storage
// is private, so every view request needs a fresh signed URL rather than a
// long-lived public link.
export async function getSignedFileUrl(
  storagePath: string,
  expiresInSeconds = 300
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      console.error(`Failed to create signed URL for ${storagePath}:`, error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error("Unexpected error creating signed URL:", error);
    return null;
  }
}
