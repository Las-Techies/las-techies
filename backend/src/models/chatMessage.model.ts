import { prisma } from "../db/client";

export type ChatRole = "user" | "assistant";

export type ChatSource = {
  documentId: number;
  documentTitle: string;
  snippet: string;
};

export function createMessage(input: {
  conversationId: number;
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
}) {
  return prisma.chatMessage.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      ...(input.sources ? { sources: input.sources as unknown as object } : {}),
    },
  });
}

// Returns the most recent `limit` messages, oldest-first — the shape a
// prompt builder or a "load this thread" API response wants, without
// making every caller re-sort a DESC page.
export async function listMessagesForConversation(conversationId: number, limit = 20) {
  const messages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return messages.reverse();
}
