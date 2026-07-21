import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";

export type ChunkWithEmbedding = {
  content: string;
  embedding: number[];
};

export type SimilarChunk = {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  content: string;
  distance: number;
};

// pgvector's Node client ships as an ESM-only package; this backend runs as
// CommonJS, so it's loaded via dynamic import rather than a static one.
async function vectorToSql(embedding: number[]): Promise<string> {
  const { toSql } = await import("pgvector");
  const sql = toSql(embedding);
  if (sql === null) {
    throw new Error("Failed to serialize embedding for pgvector");
  }
  return sql;
}

export function deleteChunksForDocument(documentId: number) {
  return prisma.documentChunk.deleteMany({ where: { documentId } });
}

export function countChunksForDocument(documentId: number) {
  return prisma.documentChunk.count({ where: { documentId } });
}

// Replaces all chunks for a document (delete + insert) so re-processing a
// document (e.g. via the backfill script) never leaves stale/duplicate
// chunks behind. Prisma Client can't create rows with an Unsupported vector
// column, so the insert goes through $executeRaw with each value cast to
// `vector` on the Postgres side.
//
// Deliberately a single multi-row INSERT (not one $executeRaw per chunk
// inside an interactive $transaction callback): this project's DATABASE_URL
// goes through Supabase's transaction-mode pgbouncer pooler, which can drop
// a long-lived interactive transaction that holds a connection open across
// many sequential round-trips (observed in practice on documents with 20+
// chunks). Batching into one INSERT plus the array form of $transaction
// keeps this to two statements total.
export async function replaceChunksForDocument(
  documentId: number,
  teamId: number,
  chunks: ChunkWithEmbedding[]
): Promise<void> {
  const deleteExisting = prisma.documentChunk.deleteMany({ where: { documentId } });

  if (chunks.length === 0) {
    await deleteExisting;
    return;
  }

  const rows = await Promise.all(
    chunks.map(async (chunk, i) => {
      const vectorSql = await vectorToSql(chunk.embedding);
      return Prisma.sql`(${documentId}, ${teamId}, ${i}, ${chunk.content}, ${vectorSql}::vector)`;
    })
  );

  const insertChunks = prisma.$executeRaw(Prisma.sql`
    INSERT INTO "DocumentChunk" ("documentId", "teamId", "chunkIndex", "content", "embedding")
    VALUES ${Prisma.join(rows)}
  `);

  await prisma.$transaction([deleteExisting, insertChunks]);
}

// Cosine-distance nearest-neighbor search via pgvector's `<=>` operator,
// scoped to the requesting team (and optionally a manager-selected document
// subset). Prisma Client can't filter/order on the Unsupported `vector`
// column, so this goes through $queryRaw instead of the normal query builder.
export async function findSimilarChunks(
  teamId: number,
  queryEmbedding: number[],
  options?: { documentIds?: number[]; limit?: number }
): Promise<SimilarChunk[]> {
  const vectorSql = await vectorToSql(queryEmbedding);
  const limit = options?.limit ?? 6;

  const documentIdFilter =
    options?.documentIds && options.documentIds.length > 0
      ? Prisma.sql`AND dc."documentId" IN (${Prisma.join(options.documentIds)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<
    { id: number; documentId: number; documentTitle: string; content: string; distance: number }[]
  >(Prisma.sql`
    SELECT dc.id, dc."documentId", d.title AS "documentTitle", dc.content,
           (dc.embedding <=> ${vectorSql}::vector) AS distance
    FROM "DocumentChunk" dc
    JOIN "Document" d ON d.id = dc."documentId"
    WHERE dc."teamId" = ${teamId}
    ${documentIdFilter}
    ORDER BY distance ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    chunkId: row.id,
    documentId: row.documentId,
    documentTitle: row.documentTitle,
    content: row.content,
    distance: Number(row.distance),
  }));
}
