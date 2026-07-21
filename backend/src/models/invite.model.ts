import { prisma } from "../db/client";

export function createInvite(input: {
  token: string;
  teamId: number;
  email: string;
  createdByUserId: number;
  expiresAt: Date;
}) {
  return prisma.invite.create({
    data: {
      token: input.token,
      teamId: input.teamId,
      email: input.email,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt,
    },
  });
}

export function findInviteByToken(token: string) {
  return prisma.invite.findUnique({ where: { token } });
}

// Marks an invite consumed. Scoped by id so the caller can't accidentally
// mark the wrong row, and only ever sets usedAt (never clears it).
export function markInviteUsed(id: number) {
  return prisma.invite.update({
    where: { id },
    data: { usedAt: new Date() },
  });
}
