-- Add optional quizId to Invite so accepting an invite can auto-create a
-- QuizAssignment for the quiz the manager sent it for.
ALTER TABLE "Invite" ADD COLUMN IF NOT EXISTS "quizId" INTEGER;
