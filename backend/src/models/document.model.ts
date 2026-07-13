import { prisma } from "../db/client";

export function createDocument(input: {
  teamId: number;
  uploadedByUserId: number;
  title: string;
  sourceType: string;
  rawText: string | null;
  status: string;
}) {
  return prisma.document.create({
    data: {
      teamId: input.teamId,
      uploadedByUserId: input.uploadedByUserId,
      title: input.title,
      sourceType: input.sourceType,
      rawText: input.rawText,
      status: input.status,
    },
  });
}

export function findDocumentByIdForTeam(id: number, teamId: number) {
  return prisma.document.findFirst({ where: { id, teamId } });
}
