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
