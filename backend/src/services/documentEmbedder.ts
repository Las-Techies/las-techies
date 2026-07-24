import { chunkText } from "./chunker";
import { embedBatch } from "./embeddings";
import { replaceChunksForDocument } from "../models/documentChunk.model";

// Prefixes the text we actually embed (never the stored/displayed content)
// with the document title and, if known, the section heading in effect for
// that chunk. A bare chunk like "Salesforce Edge is a content delivery
// network..." shares little vocabulary with a vague/meta question like
// "give me an overview of my team" — folding in "Edge Onboarding Document —
// OVERVIEW" gives the embedding model more surface area to match against,
// without polluting the chunk's citable content shown to users/the LLM.
function buildEmbeddingText(title: string, chunk: { content: string; heading?: string }): string {
  const context = chunk.heading ? `${title} — ${chunk.heading}` : title;
  return `${context}\n\n${chunk.content}`;
}

// Chunks a document's extracted text, embeds every chunk locally via
// Transformers.js, and stores the result for retrieval. Used right after
// upload and by the backfill script for documents that predate this
// feature. Callers are expected to treat failures as best-effort (a
// document is still usable for quiz generation even if chat retrieval
// isn't available for it yet).
export async function embedDocument(document: {
  id: number;
  teamId: number;
  title: string;
  rawText: string;
}): Promise<{ chunkCount: number }> {
  const chunks = chunkText(document.rawText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const embeddings = await embedBatch(
    chunks.map((chunk) => buildEmbeddingText(document.title, chunk))
  );
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count (${embeddings.length}) did not match chunk count (${chunks.length})`
    );
  }

  await replaceChunksForDocument(
    document.id,
    document.teamId,
    chunks.map((chunk, i) => {
      const embedding = embeddings[i];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk ${i}`);
      }
      return { content: chunk.content, embedding };
    })
  );

  return { chunkCount: chunks.length };
}

// Caps how many documents embed at once during a bulk import (a Google
// Drive folder or GitHub repo import can create up to 100 documents in one
// request). Each embedDocument call runs the shared, in-process embedding
// model and ends in a DB transaction against Supabase's pgbouncer pooler —
// firing all of them at once would compete with every other request the
// server is handling and risks exhausting the connection pool. A small
// worker-pool keeps a few in flight at a time instead of either serializing
// everything or firing it all unbounded.
const BULK_EMBED_CONCURRENCY = 3;

// Best-effort like embedDocument itself: one document's embedding failure
// is logged and skipped, never thrown, so it can't take down the rest of
// the batch or the caller.
export async function embedDocumentsWithConcurrency(
  documents: Array<{ id: number; teamId: number; title: string; rawText: string }>
): Promise<void> {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < documents.length) {
      const document = documents[nextIndex++];
      if (!document) continue;
      try {
        await embedDocument(document);
      } catch (error) {
        console.error(`Failed to embed document ${document.id} for chat retrieval:`, error);
      }
    }
  }

  const workerCount = Math.min(BULK_EMBED_CONCURRENCY, documents.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}
