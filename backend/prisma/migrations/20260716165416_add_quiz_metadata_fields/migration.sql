-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "passingScore" INTEGER,
ADD COLUMN     "timeLimitMinutes" INTEGER;
