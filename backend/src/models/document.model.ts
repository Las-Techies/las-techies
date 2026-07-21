import { prisma } from "../db/client";

export function createDocument(input: {
  teamId: number;
  uploadedByUserId: number;
  title: string;
  sourceType: string;
  sourceUrl?: string | null;
  rawText: string | null;
  status: string;
}) {
  const data = {
    teamId: input.teamId,
    uploadedByUserId: input.uploadedByUserId,
    title: input.title,
    sourceType: input.sourceType,
    rawText: input.rawText,
    status: input.status,
  } as any;

  if (typeof input.sourceUrl !== "undefined") {
    data.source_url = input.sourceUrl ?? null;
  }

  return prisma.document.create({
    data,
  });
}

export function findDocumentByIdForTeam(id: number, teamId: number) {
  return prisma.document.findFirst({ where: { id, teamId } });
}

export function findDocumentsForUser(userId: number, teamId: number) {
  return prisma.document.findMany({
    where: { uploadedByUserId: userId, teamId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
    },
  });
}

// Scoped to the uploader (not just the team) so a manager can only delete
// documents they personally uploaded, not a teammate's.
export function deleteDocumentForUser(id: number, userId: number, teamId: number) {
  return prisma.document.deleteMany({
    where: { id, uploadedByUserId: userId, teamId },
  });
}

