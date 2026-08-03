import type { NextFunction, Request, Response } from "express";
import {
  createConversation,
  deleteConversation as deleteConversationForUser,
  findConversationForUser,
  listConversationsForUser,
  setConversationTitleIfUnset,
  touchConversation,
} from "../models/chatConversation.model";
import { createMessage, listMessagesForConversation } from "../models/chatMessage.model";
import { findSimilarChunks } from "../models/documentChunk.model";
import { findTeamById } from "../models/team.model";
import { embedBatch, embedText } from "../services/embeddings";
import { computeConfidence, generateChatAnswer } from "../services/chatGenerator";

type AuthUser = {
  id: number;
  teamId: number;
};

// How many past turns to feed back into the prompt as conversational
// memory, and how many chunks to retrieve per question.
const HISTORY_LIMIT = 10;
const RETRIEVAL_TOP_K = 6;

function getAuthUser(req: Request): AuthUser | null {
  const user = (req as any).user as AuthUser | undefined;
  if (!user?.id || !user?.teamId) return null;
  return user;
}

function parseSelectedDocumentIds(raw: unknown): number[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const ids = raw.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0);
  return ids.length > 0 ? ids : undefined;
}

// Matches "my team"/"our team"/"this team" (case-insensitive) so a vague,
// meta-phrased question can be embedded with the team's actual name instead
// — e.g. "give me an overview of my team" becomes "give me an overview of
// Salesforce Edge", which shares far more vocabulary with that team's
// uploaded docs than the word "team" ever would. Only affects the text used
// for retrieval; the original wording is still what's stored in chat
// history and what's shown to the LLM as the user's question.
const TEAM_REFERENCE_PATTERN = /\b(my|our|this)\s+team\b/gi;

function buildRetrievalQuery(message: string, teamName?: string | null): string {
  if (!teamName?.trim()) return message;
  return message.replace(TEAM_REFERENCE_PATTERN, teamName.trim());
}

// The LLM proposes follow-up questions grounded in the excerpts it just saw,
// but clicking one triggers a FRESH retrieval over the whole corpus — which
// can miss and drop the user into the low-confidence fallback ("I couldn't
// find an answer…"). That makes Sage suggest questions it then can't answer.
//
// This pre-flights each proposed follow-up through the exact same retrieval a
// real click would run, and keeps only the ones that would clear the
// confidence bar. Cheap: embeddings run locally (embedBatch is one batched
// call, no API/LLM cost) and each retrieval is a single top-1 vector lookup.
// Runs the lookups in parallel and preserves the LLM's original ordering.
async function filterAnswerableFollowUps(
  followUps: string[],
  teamId: number,
  teamName: string | null | undefined,
  selectedDocumentIds: number[] | undefined
): Promise<string[]> {
  if (followUps.length === 0) return [];

  const embeddings = await embedBatch(
    followUps.map((f) => buildRetrievalQuery(f, teamName))
  );

  const answerable = await Promise.all(
    followUps.map(async (_followUp, i) => {
      const embedding = embeddings[i];
      if (!embedding) return false;
      // limit: 1 — computeConfidence only inspects the single closest chunk,
      // so retrieving more would be wasted work here.
      const chunks = await findSimilarChunks(teamId, embedding, {
        ...(selectedDocumentIds ? { documentIds: selectedDocumentIds } : {}),
        limit: 1,
      });
      return computeConfidence(chunks) !== "low";
    })
  );

  return followUps.filter((_followUp, i) => answerable[i]);
}

// Sends a message in a conversation (creating the conversation on first
// message if `conversationId` is omitted), retrieves relevant document
// chunks via pgvector, generates a cited answer, and persists both sides
// of the exchange so the thread has durable memory across requests.
export async function postChatMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: { message: "Unauthorized" } });

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      return res.status(400).json({ error: { message: "message must be a non-empty string" } });
    }

    const selectedDocumentIds = parseSelectedDocumentIds(req.body?.selectedDocumentIds);

    let conversationId: number;
    let isNewConversation = false;
    if (req.body?.conversationId !== undefined) {
      const requestedId = Number(req.body.conversationId);
      if (!Number.isInteger(requestedId)) {
        return res.status(400).json({ error: { message: "Invalid conversationId" } });
      }
      const conversation = await findConversationForUser(requestedId, user.id, user.teamId);
      if (!conversation) {
        return res.status(404).json({ error: { message: "Conversation not found" } });
      }
      conversationId = conversation.id;
    } else {
      const conversation = await createConversation({ teamId: user.teamId, userId: user.id });
      conversationId = conversation.id;
      isNewConversation = true;
    }

    const history = isNewConversation
      ? []
      : (await listMessagesForConversation(conversationId, HISTORY_LIMIT)).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));

    // Cheap, no-LLM query rewrite: substitute the user's actual team name for
    // generic "my/our/this team" phrasing before embedding, so retrieval for
    // team-overview-style questions doesn't rely on the document literally
    // containing the word "team". Adds one indexed lookup, not another
    // model/LLM call, so it doesn't add meaningful latency to the request.
    const team = await findTeamById(user.teamId);
    const retrievalQuery = buildRetrievalQuery(message, team?.name);

    const queryEmbedding = await embedText(retrievalQuery);
    const chunks = await findSimilarChunks(user.teamId, queryEmbedding, {
      ...(selectedDocumentIds ? { documentIds: selectedDocumentIds } : {}),
      limit: RETRIEVAL_TOP_K,
    });

    const result = await generateChatAnswer(chunks, history, message);

    // Only surface follow-ups Sage can actually answer — clicking one runs a
    // fresh retrieval, so a suggestion that wouldn't clear the confidence bar
    // would dead-end in the "I couldn't find an answer" fallback.
    const followUps = await filterAnswerableFollowUps(
      result.followUps,
      user.teamId,
      team?.name,
      selectedDocumentIds
    );

    await createMessage({ conversationId, role: "user", content: message });
    await createMessage({
      conversationId,
      role: "assistant",
      content: result.answer,
      sources: result.sources,
    });

    await touchConversation(conversationId);
    if (isNewConversation) {
      await setConversationTitleIfUnset(conversationId, message);
    }

    res.json({
      conversationId,
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      followUps,
    });
  } catch (err) {
    next(err);
  }
}

export async function listConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: { message: "Unauthorized" } });

    const conversations = await listConversationsForUser(user.id, user.teamId);
    res.json({ data: conversations });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: { message: "Unauthorized" } });

    const conversationId = Number(req.params.conversationId);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).json({ error: { message: "Invalid conversationId" } });
    }

    const conversation = await findConversationForUser(conversationId, user.id, user.teamId);
    if (!conversation) {
      return res.status(404).json({ error: { message: "Conversation not found" } });
    }

    const messages = await listMessagesForConversation(conversationId, 200);
    res.json({ data: { conversation, messages } });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: { message: "Unauthorized" } });

    const conversationId = Number(req.params.conversationId);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).json({ error: { message: "Invalid conversationId" } });
    }

    const result = await deleteConversationForUser(conversationId, user.id, user.teamId);
    if (result.count === 0) {
      return res.status(404).json({ error: { message: "Conversation not found" } });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
