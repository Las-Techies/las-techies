import { prisma } from "../db/client";

export function findTeamById(id: number) {
  return prisma.team.findUnique({ where: { id } });
}

export function createTeam(input: {
  name: string;
  description?: string | null;
  managerId?: number | null;
}) {
  return prisma.team.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      managerId: input.managerId ?? null,
    },
  });
}

// Every team owned by a given manager, for the dashboard team switcher.
// Newest first so a freshly created team surfaces at the top.
export function findTeamsByManager(managerId: number) {
  return prisma.team.findMany({
    where: { managerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });
}

// Used to authorize a team switch: confirms the caller actually owns the team
// they're trying to activate before we write it into their JWT/DB row.
export function findTeamByIdForManager(id: number, managerId: number) {
  return prisma.team.findFirst({
    where: { id, managerId },
    select: { id: true, name: true },
  });
}

// Backfills ownership for teams that predate the managerId column: claims the
// team for `managerId` only if it currently has no owner. `updateMany` with the
// `managerId: null` guard makes this a safe no-op when the team is already
// owned (by this or another manager), so it can't steal a claimed team.
export function claimTeamIfUnowned(id: number, managerId: number) {
  return prisma.team.updateMany({
    where: { id, managerId: null },
    data: { managerId },
  });
}
