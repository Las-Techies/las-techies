import { prisma } from "../db/client";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

export function findQuizById(id: number) {
  return prisma.quiz.findUnique({ where: { id } });
}

export function findQuizByIdForTeam(id: number, teamId: number) {
  return prisma.quiz.findFirst({ where: { id, teamId } });
}

// Backs a manager "resume my most recent quiz" so the frontend can follow the
// account across devices instead of relying on a quizId cached in localStorage.
export function findLatestQuizForUser(userId: number, teamId: number) {
  return prisma.quiz.findFirst({
    where: { createdByUserId: userId, teamId },
    orderBy: { createdAt: "desc" },
  });
}

// Backs the new-hire dashboard: the latest *published* quiz on their team.
// New hires don't author quizzes, so scoping by creator (as above) would never
// match — they see whatever their manager has published to the team.
export function findLatestPublishedQuizForTeam(teamId: number) {
  return prisma.quiz.findFirst({
    where: { teamId, status: "published" },
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

// Persists a full replacement of questionsPayload — used after editing or
// regenerating a single question in place.
export function updateQuizQuestions(
  id: number,
  teamId: number,
  questionsPayload: QuizQuestion[]
) {
  return prisma.quiz.updateMany({
    where: { id, teamId },
    data: { questionsPayload: questionsPayload as unknown as object },
  });
}

// Skips rows that already exist for a (quiz, user) pair rather than
// erroring, so re-publishing/re-assigning the same quiz to an already
// assigned learner is a harmless no-op.
export function createQuizAssignments(
  quizId: number,
  assignedToUserIds: number[],
  assignedByUserId: number
) {
  return prisma.quizAssignment.createMany({
    data: assignedToUserIds.map((assignedToUserId) => ({
      quizId,
      assignedToUserId,
      assignedByUserId,
    })),
    skipDuplicates: true,
  });
}

// No Prisma relations between QuizAssignment and Quiz (same convention as
// the rest of this schema), so the join happens here in application code.
// Only published quizzes are returned — a new hire shouldn't see a quiz
// while it's still a manager's draft. Sorted so the most urgent, not-yet-
// completed work floats to the top: soonest due date first, then quizzes
// with no due date, then completed ones last.
export async function findAssignedQuizzesForUser(userId: number) {
  const assignments = await prisma.quizAssignment.findMany({
    where: { assignedToUserId: userId },
  });
  if (assignments.length === 0) return [];

  const quizIds = assignments.map((assignment) => assignment.quizId);
  const quizzes = await prisma.quiz.findMany({
    where: { id: { in: quizIds }, status: "published" },
  });
  const quizById = new Map(quizzes.map((quiz) => [quiz.id, quiz]));

  return assignments
    .map((assignment) => ({ assignment, quiz: quizById.get(assignment.quizId) }))
    .filter(
      (entry): entry is { assignment: (typeof assignments)[number]; quiz: (typeof quizzes)[number] } =>
        Boolean(entry.quiz)
    )
    .sort((a, b) => {
      const aCompleted = a.assignment.status === "completed";
      const bCompleted = b.assignment.status === "completed";
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;

      const aDue = a.quiz.dueDate ? a.quiz.dueDate.getTime() : Infinity;
      const bDue = b.quiz.dueDate ? b.quiz.dueDate.getTime() : Infinity;
      return aDue - bDue;
    });
}

// Scoped to the caller's own assignment row so a new hire can only mark
// their own progress complete, never someone else's.
export function markAssignmentComplete(quizId: number, userId: number, score?: number) {
  return prisma.quizAssignment.updateMany({
    where: { quizId, assignedToUserId: userId },
    data: {
      status: "completed",
      completedAt: new Date(),
      ...(typeof score === "number" ? { score } : {}),
    },
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
