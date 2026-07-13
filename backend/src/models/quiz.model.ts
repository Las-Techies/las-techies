import { prisma } from "../db/client";

export function findQuizById(id: number) {
  return prisma.quiz.findUnique({ where: { id } });
}
