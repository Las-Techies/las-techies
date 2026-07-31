-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "managerId" INTEGER;

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");
