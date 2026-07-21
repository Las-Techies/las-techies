-- DropIndex
DROP INDEX "DocumentChunk_embedding_hnsw_idx";

-- CreateTable
CREATE TABLE "Invite" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "createdByUserId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invite_token_key" ON "Invite"("token");
