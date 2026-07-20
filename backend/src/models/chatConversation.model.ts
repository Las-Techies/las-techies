import { prisma } from "../db/client";

export function createConversation(input: { teamId: number; userId: number }) {
  return prisma.chatConversation.create({
    data: { teamId: input.teamId, userId: input.userId },
  });
}

// Scoped to the requesting user (not just the team), since each user's
// chat threads are their own — matches the "multiple named threads per
// user" conversation model.
export function listConversationsForUser(userId: number, teamId: number) {
  return prisma.chatConversation.findMany({
    where: { userId, teamId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
}

export function findConversationForUser(id: number, userId: number, teamId: number) {
  return prisma.chatConversation.findFirst({ where: { id, userId, teamId } });
}

const MAX_TITLE_LENGTH = 60;

// Bumps updatedAt on every new message so the sidebar can sort threads by
// most-recently-active.
export function touchConversation(id: number) {
  return prisma.chatConversation.update({
    where: { id },
    data: { updatedAt: new Date() },
  });
}

// Sets the thread's title from the opening question, but only if it's
// still unset — later messages shouldn't overwrite it. Called once, right
// after the first user message of a new conversation.
export function setConversationTitleIfUnset(id: number, title: string) {
  return prisma.chatConversation.updateMany({
    where: { id, title: null },
    data: { title: title.slice(0, MAX_TITLE_LENGTH) },
  });
}

export function deleteConversation(id: number, userId: number, teamId: number) {
  return prisma.chatConversation.deleteMany({ where: { id, userId, teamId } });
}
