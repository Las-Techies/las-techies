import { prisma } from "../db/client";

export function findTeamById(id: number) {
  return prisma.team.findUnique({ where: { id } });
}

export function createTeam(input: { name: string; description?: string | null }) {
  return prisma.team.create({
    data: { name: input.name, description: input.description ?? null },
  });
}
