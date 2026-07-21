-- CreateTable
CREATE TABLE "QuizAssignment" (
    "id" SERIAL NOT NULL,
    "quizId" INTEGER NOT NULL,
    "assignedToUserId" INTEGER NOT NULL,
    "assignedByUserId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "score" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuizAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuizAssignment_assignedToUserId_idx" ON "QuizAssignment"("assignedToUserId");

-- CreateIndex
CREATE UNIQUE INDEX "QuizAssignment_quizId_assignedToUserId_key" ON "QuizAssignment"("quizId", "assignedToUserId");
