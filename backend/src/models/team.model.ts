import { prisma } from "../db/client";

export function findTeamById(id: number) {
  return prisma.team.findUnique({ where: { id } });
}
