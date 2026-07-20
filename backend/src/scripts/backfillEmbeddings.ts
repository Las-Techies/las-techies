// One-off script to embed documents that were created before the chat
// retrieval feature existed (including the seeded demo docs), so they show
// up in `POST /api/library/chat` search results without needing a re-upload.
//
// Usage: `npx tsx src/scripts/backfillEmbeddings.ts`

import { prisma } from "../db/client";
import { embedDocument } from "../services/documentEmbedder";
import { countChunksForDocument } from "../models/documentChunk.model";

async function main() {
  const documents = await prisma.document.findMany({
    where: { status: "ready", rawText: { not: null } },
    select: { id: true, teamId: true, title: true, rawText: true },
  });

  console.log(`Found ${documents.length} ready document(s).`);

  for (const document of documents) {
    const existingChunks = await countChunksForDocument(document.id);
    if (existingChunks > 0) {
      console.log(`SKIP (already embedded): [${document.id}] ${document.title}`);
      continue;
    }

    try {
      const { chunkCount } = await embedDocument({
        id: document.id,
        teamId: document.teamId,
        rawText: document.rawText as string,
      });
      console.log(`OK: [${document.id}] ${document.title} -> ${chunkCount} chunk(s)`);
    } catch (error) {
      console.log(`FAIL: [${document.id}] ${document.title}`);
      console.log((error as Error).message);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
