import { prisma } from "../db/client";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

export function findQuizById(id: number) {
  return prisma.quiz.findUnique({ where: { id } });
}

export function createQuiz(input: {
  teamId: number;
  createdByUserId: number;
  title: string;
  description?: string;
  sourceDocumentIds: number[];
  generationConfig: GenerationConfig;
  questionsPayload: QuizQuestion[];
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
    },
  });
}
