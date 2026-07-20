import { chunkText } from "./chunker";
import { embedBatch } from "./embeddings";
import { replaceChunksForDocument } from "../models/documentChunk.model";

// Chunks a document's extracted text, embeds every chunk locally via
// Transformers.js, and stores the result for retrieval. Used right after
// upload and by the backfill script for documents that predate this
// feature. Callers are expected to treat failures as best-effort (a
// document is still usable for quiz generation even if chat retrieval
// isn't available for it yet).
export async function embedDocument(document: {
  id: number;
  teamId: number;
  rawText: string;
}): Promise<{ chunkCount: number }> {
  const chunks = chunkText(document.rawText);
  if (chunks.length === 0) {
    return { chunkCount: 0 };
  }

  const embeddings = await embedBatch(chunks.map((chunk) => chunk.content));
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
