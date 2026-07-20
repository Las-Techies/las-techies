import { prisma } from "../db/client";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

export function findQuizById(id: number) {
  return prisma.quiz.findUnique({ where: { id } });
}

export function findQuizByIdForTeam(id: number, teamId: number) {
  return prisma.quiz.findFirst({ where: { id, teamId } });
}

// Backs "resume my most recent quiz" so the frontend can follow the account
// across devices instead of relying on a quizId cached in localStorage.
export function findLatestQuizForUser(userId: number, teamId: number) {
  return prisma.quiz.findFirst({
    where: { createdByUserId: userId, teamId },
    orderBy: { createdAt: "desc" },
  });
}

export function createQuiz(input: {
  teamId: number;
  createdByUserId: number;
  title: string;
  description?: string;
  sourceDocumentIds: number[];
  generationConfig: GenerationConfig;
  questionsPayload: QuizQuestion[];
  passingScore?: number | undefined;
  timeLimitMinutes?: number | undefined;
  dueDate?: Date | undefined;
}) {
  return prisma.quiz.create({
    data: {
      teamId: input.teamId,
      createdByUserId: input.createdByUserId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
      sourceDocumentIds: input.sourceDocumentIds,
      generationConfig: input.generationConfig as unknown as object,
      questionsPayload: input.questionsPayload as unknown as object,
      passingScore: input.passingScore ?? null,
      timeLimitMinutes: input.timeLimitMinutes ?? null,
      dueDate: input.dueDate ?? null,
    },
  });
}

const ALLOWED_STATUSES = ["draft", "published"] as const;
export type QuizStatus = (typeof ALLOWED_STATUSES)[number];

export function isValidQuizStatus(value: unknown): value is QuizStatus {
  return typeof value === "string" && ALLOWED_STATUSES.includes(value as QuizStatus);
}

export function updateQuizStatus(id: number, teamId: number, status: QuizStatus) {
  return prisma.quiz.updateMany({
    where: { id, teamId },
    data: { status },
  });
}

// sourceDocumentIds is a plain JSON array, not a real foreign key, so this
// checks in application code rather than relying on a DB-level JSON query
// (keeps it correct regardless of the Postgres/Prisma JSON operator used).
// Scoped to the whole team, not just the requesting user, since a document
// can be referenced by a quiz any manager on the team generated.
export async function findQuizzesReferencingDocument(
  documentId: number,
  teamId: number
): Promise<{ id: number; title: string }[]> {
  const quizzes = await prisma.quiz.findMany({
    where: { teamId },
    select: { id: true, title: true, sourceDocumentIds: true },
  });

  return quizzes
    .filter((quiz) => {
      const ids = quiz.sourceDocumentIds;
      return Array.isArray(ids) && ids.includes(documentId);
    })
    .map((quiz) => ({ id: quiz.id, title: quiz.title }));
}
