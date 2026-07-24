import { env } from "../config/env";
import { buildChatPrompt } from "../utils/prompts";
import type { SimilarChunk } from "../models/documentChunk.model";
import type { ChatSource } from "../models/chatMessage.model";

// Cosine similarity thresholds (1 - pgvector cosine distance) used to decide
// whether retrieved context is good enough to answer from at all. Tuned to
// be conservative: a "low" result skips the LLM call entirely rather than
// risking a confidently-hallucinated answer from weak context.
//
// MEDIUM was lowered from 0.4 to 0.35 after measuring real queries against
// an actually-relevant, heading-isolated chunk (a "Key People" section with
// named roles): a clearly-on-topic question like "who are the key people on
// this team?" scored ~0.376 against it — all-MiniLM-L6-v2 tends to score
// short question-vs-declarative-list pairs lower in absolute magnitude even
// when genuinely relevant. For comparison, unrelated questions ("what's the
// weather tomorrow?") scored ~0.01–0.13 against the same document, so 0.35
// still leaves a wide margin against true negatives.
const HIGH_SIMILARITY_THRESHOLD = 0.6;
const MEDIUM_SIMILARITY_THRESHOLD = 0.35;

export type Confidence = "high" | "medium" | "low";

export type ChatAnswer = {
  answer: string;
  sources: ChatSource[];
  confidence: Confidence;
  followUps: string[];
};

export class ChatGenerationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = "ChatGenerationError";
  }
}

type ChatHistoryTurn = { role: "user" | "assistant"; content: string };

function similarityFromDistance(distance: number): number {
  // pgvector cosine distance is in [0, 2]; embeddings are normalized so in
  // practice this stays within [0, 1]-ish, matching cosine similarity = 1 - distance.
  return 1 - distance;
}

export function computeConfidence(chunks: SimilarChunk[]): Confidence {
  const topChunk = chunks[0];
  if (!topChunk) return "low";

  const similarity = similarityFromDistance(topChunk.distance);
  if (similarity >= HIGH_SIMILARITY_THRESHOLD) return "high";
  if (similarity >= MEDIUM_SIMILARITY_THRESHOLD) return "medium";
  return "low";
}

// Non-streaming call to the same Salesforce LLM Gateway used for quiz
// generation — a single chat answer is short enough that a live progress
// stream (like quizGenerator.ts uses for multi-question generation) isn't
// needed here.
async function callGateway(prompt: string): Promise<string> {
  if (!env.resolvedLlmGatewayUrl || !env.resolvedLlmKey) {
    throw new ChatGenerationError(
      env.useOpenRouter
        ? "OpenRouter is not configured. Set OPENROUTER_API_KEY (and optionally OPENROUTER_GATEWAY_URL / OPENROUTER_MODEL)."
        : "LLM gateway is not configured. Set LLM_GATEWAY_URL and ENG_AI_MODEL_GW_KEY in backend/.env."
    );
  }

  const res = await fetch(env.resolvedLlmGatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resolvedLlmKey}`,
      "Content-Type": "application/json",
      ...(env.appUrl ? { "HTTP-Referer": env.appUrl } : {}),
      ...(env.llmAppName ? { "X-Title": env.llmAppName } : {}),
    },
    body: JSON.stringify({
      model: env.resolvedLlmModel,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful onboarding assistant for Salesforce engineering teams. You answer " +
            "questions using only the excerpts you're given, always cite your sources, and say " +
            "plainly when you don't have enough information instead of guessing. You only output " +
            "valid JSON with no markdown fences and no prose before or after the JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new ChatGenerationError(`LLM gateway returned ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new ChatGenerationError("LLM gateway returned an empty response");
  }
  return content;
}

// Claude sometimes wraps JSON in ```json fences or adds stray prose.
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ? fenced[1] : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    throw new ChatGenerationError("Could not parse JSON from LLM response");
  }
}

function validate(parsed: any, knownDocumentIds: Set<number>): Omit<ChatAnswer, "confidence"> {
  if (!parsed || typeof parsed.answer !== "string" || parsed.answer.trim() === "") {
    throw new ChatGenerationError("Response is missing a non-empty 'answer'");
  }

  const rawSources = Array.isArray(parsed.sources) ? parsed.sources : [];
  const sources: ChatSource[] = rawSources
    .filter(
      (s: any) =>
        s &&
        typeof s.documentId === "number" &&
        knownDocumentIds.has(s.documentId) &&
        typeof s.documentTitle === "string" &&
        s.documentTitle.trim() !== "" &&
        typeof s.snippet === "string" &&
        s.snippet.trim() !== ""
    )
    .map((s: any) => ({
      documentId: s.documentId,
      documentTitle: s.documentTitle,
      snippet: s.snippet,
    }));

  const followUps = Array.isArray(parsed.followUps)
    ? parsed.followUps.filter((f: unknown): f is string => typeof f === "string" && f.trim() !== "").slice(0, 3)
    : [];

  return { answer: parsed.answer.trim(), sources, followUps };
}

// Deterministic, no-LLM-call response for when retrieval didn't turn up
// anything worth answering from — matches the "low-confidence fallback"
// decision in planning/project_plan.md.
function fallbackAnswer(chunks: SimilarChunk[]): ChatAnswer {
  const suggestedTitles = [...new Set(chunks.map((c) => c.documentTitle))].slice(0, 3);

  const answer =
    suggestedTitles.length > 0
      ? "I couldn't find a confident answer to that in your team's docs. You might find it in: " +
        suggestedTitles.join(", ") +
        ". Try rephrasing your question or asking about one of those documents directly."
      : "I couldn't find anything in your team's docs to answer that. Try uploading the relevant document, or rephrase your question.";

  return { answer, sources: [], confidence: "low", followUps: [] };
}

export async function generateChatAnswer(
  retrievedChunks: SimilarChunk[],
  history: ChatHistoryTurn[],
  question: string,
  options?: { maxRetries?: number }
): Promise<ChatAnswer> {
  const confidence = computeConfidence(retrievedChunks);
  if (confidence === "low") {
    return fallbackAnswer(retrievedChunks);
  }

  const prompt = buildChatPrompt(retrievedChunks, history, question);
  const knownDocumentIds = new Set(retrievedChunks.map((c) => c.documentId));
  const maxRetries = options?.maxRetries ?? 1;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callGateway(prompt);
      const parsed = validate(extractJson(raw), knownDocumentIds);
      return { ...parsed, confidence };
    } catch (err) {
      lastError = err;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ChatGenerationError(`Failed to generate a chat answer after ${maxRetries + 1} attempt(s): ${detail}`);
}
