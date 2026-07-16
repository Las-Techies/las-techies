import { prisma } from "../db/client";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

export function findQuizById(id: number) {
  return prisma.quiz.findUnique({ where: { id } });
}

export function findQuizByIdForTeam(id: number, teamId: number) {
  return prisma.quiz.findFirst({ where: { id, teamId } });
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
