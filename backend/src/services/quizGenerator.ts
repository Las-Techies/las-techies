import { env } from "../config/env";
import { buildPrompt } from "../utils/prompts";
import type { GenerationConfig, QuizQuestion } from "./quizTypes";

export class QuizGenerationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = "QuizGenerationError";
  }
}

export type GenerationProgress = {
  attempt: number;
  questionsDetected: number;
  batch: number;
  totalBatches: number;
};

type SourceDocument = {
  id: number;
  title: string;
  rawText: string;
};

// Large single-shot generations are fragile: one bad character anywhere in
// (say) a 30-question JSON blob invalidates the whole response, and bigger
// outputs are more likely to get cut off before they finish. Splitting into
// ~10-question batches keeps each individual LLM call's output small enough
// to reliably stay well-formed, and means a failure only costs a cheap
// retry of that one batch instead of redoing the entire quiz.
const MAX_BATCH_SIZE = 10;

// Balanced rather than greedy chunking — e.g. 21 questions becomes [7, 7, 7],
// not [10, 10, 1]. A lone trailing batch of 1 would still cost a full LLM
// round-trip (with the whole source-document context re-sent) for a single
// question, so it's worth spreading the remainder evenly instead.
function splitIntoBatchSizes(total: number, maxBatchSize: number): number[] {
  const totalBatches = Math.max(1, Math.ceil(total / maxBatchSize));
  const base = Math.floor(total / totalBatches);
  const remainder = total % totalBatches;
  return Array.from({ length: totalBatches }, (_, i) => base + (i < remainder ? 1 : 0));
}

// The gateway caches responses by exact request content — verified
// empirically: sending the identical prompt twice returns the identical
// response in well under a second the second time (vs. 30+ seconds fresh).
// Left unchecked that means (a) two separate "Generate" clicks with the same
// documents/settings silently produce the exact same quiz, and worse,
// (b) a retry after a malformed/truncated response just replays that same
// bad cached response instead of getting a genuinely new attempt — which is
// exactly why a batch could fail 3/3 "attempts" and still get the identical
// "Could not parse JSON" error each time. Appending a random, semantically
// inert token to the prompt busts the cache key on every call.
function randomCacheBustToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

// Streams the gateway response via SSE and reports the running-total question
// count as soon as each "prompt" field appears in the partial JSON, so the
// caller can show live progress instead of waiting for the full completion.
async function callGatewayStream(
  documents: SourceDocument[],
  config: GenerationConfig,
  onDelta: (accumulated: string) => void,
  avoidPrompts?: string[]
): Promise<string> {
  if (!env.resolvedLlmGatewayUrl || !env.resolvedLlmKey) {
    throw new QuizGenerationError(
      env.useOpenRouter
        ? "OpenRouter is not configured. Set OPENROUTER_API_KEY (and optionally OPENROUTER_GATEWAY_URL / OPENROUTER_MODEL)."
        : "LLM gateway is not configured. Set LLM_GATEWAY_URL and ENG_AI_MODEL_GW_KEY in backend/.env."
    );
  }

  const content = `${buildPrompt(documents, config, avoidPrompts)}\n\n(internal request id, not part of the task — ignore: ${randomCacheBustToken()})`;

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
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are an expert instructional designer who writes onboarding assessments for " +
            "Salesforce engineering teams. You write clear, unambiguous questions that test real " +
            "understanding of the source material, not just keyword-matching. You only output valid JSON " +
            "with no markdown fences and no prose before or after the JSON.",
        },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok || !res.body) {
    throw new QuizGenerationError(`LLM gateway returned ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by a blank line; keep any trailing partial
    // event in the buffer until more bytes arrive.
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (payload === "" || payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          accumulated += delta;
          onDelta(accumulated);
        }
      } catch {
        // Partial/malformed SSE fragment — wait for more bytes.
      }
    }
  }

  if (accumulated.trim() === "") {
    throw new QuizGenerationError("LLM gateway returned an empty response");
  }
  return accumulated;
}

// Claude sometimes wraps JSON in ```json fences or adds stray prose.
// Pull out the JSON object before parsing.
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]
    ? fenced[1]
    : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

  try {
    return JSON.parse(candidate);
  } catch {
    throw new QuizGenerationError("Could not parse JSON from LLM response");
  }
}

function validate(parsed: any, config: GenerationConfig): QuizQuestion[] {
  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new QuizGenerationError("Response is missing a 'questions' array");
  }

  const questions = parsed.questions as QuizQuestion[];

  if (questions.length !== config.numQuestions) {
    throw new QuizGenerationError(
      `Expected ${config.numQuestions} questions but got ${questions.length}`
    );
  }

  questions.forEach((q, i) => {
    const n = i + 1;
    if (!q || typeof q.prompt !== "string" || q.prompt.trim() === "") {
      throw new QuizGenerationError(`Question ${n}: empty or missing prompt`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new QuizGenerationError(`Question ${n}: needs at least 2 options`);
    }
    if (q.options.some((o) => typeof o?.text !== "string" || o.text.trim() === "")) {
      throw new QuizGenerationError(`Question ${n}: has an empty option`);
    }
    const correct = q.options.filter((o) => o?.isCorrect === true);
    if (correct.length !== 1) {
      throw new QuizGenerationError(`Question ${n}: must have exactly one correct option`);
    }
    if (typeof q.explanation !== "string" || q.explanation.trim() === "") {
      throw new QuizGenerationError(`Question ${n}: empty or missing explanation`);
    }

    //citation validation aka don't accept this question unless citation data is complete/valid
    if (!q.citation || typeof q.citation !== "object") {
      throw new QuizGenerationError(`Question ${n}: missing citation object`);
    }
    if (//checking that sourceDocumentId is a number and finite
      typeof q.citation.sourceDocumentId !== "number" ||
      !Number.isFinite(q.citation.sourceDocumentId)
    ) {
      throw new QuizGenerationError(`Question ${n}: invalid citation.sourceDocumentId`);
    }
    if (//checking that sourceDocumentTitle is a string and not empty
      typeof q.citation.sourceDocumentTitle !== "string" ||
      q.citation.sourceDocumentTitle.trim() === ""
    ) {
      throw new QuizGenerationError(`Question ${n}: missing citation.sourceDocumentTitle`);
    }
    if (//checking that sourceSnippet is a string and not empty
      typeof q.citation.sourceSnippet !== "string" ||
      q.citation.sourceSnippet.trim() === ""
    ) {
      throw new QuizGenerationError(`Question ${n}: missing citation.sourceSnippet`);
    }
  });

  return questions;
}

// Counts completed "prompt" fields in the partial JSON streamed so far, as a
// proxy for "questions generated so far". Approximate by design — it only
// needs to be good enough for a live progress indicator.
function countDetectedQuestions(accumulated: string): number {
  const matches = accumulated.match(/"prompt"\s*:/g);
  return matches ? matches.length : 0;
}

// Randomize each question's option order (Fisher-Yates). The model tends to
// mirror the prompt's example layout and place the correct answer first, so we
// shuffle server-side as a guarantee that the correct answer is spread across
// positions. Grading is by option id + isCorrect (never position), so this is
// safe and does not affect scoring.
function shuffleQuestionOptions(questions: QuizQuestion[]): QuizQuestion[] {
  for (const question of questions) {
    const options = question.options;
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = options[i]!;
      options[i] = options[j]!;
      options[j] = temp;
    }
  }
  return questions;
}

// One batch's worth of generation: a single LLM call plus its own bounded
// retry loop, scoped to `batchSize` questions rather than the quiz's full
// count. Throws the underlying (unwrapped) error on exhaustion so the
// caller can add batch context to the final message.
async function generateBatch(
  documents: SourceDocument[],
  config: GenerationConfig,
  batchSize: number,
  avoidPrompts: string[],
  maxRetries: number,
  onProgress?: (attempt: number, questionsDetected: number) => void
): Promise<QuizQuestion[]> {
  const batchConfig: GenerationConfig = { ...config, numQuestions: batchSize };
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callGatewayStream(
        documents,
        batchConfig,
        (accumulated) => {
          onProgress?.(attempt + 1, Math.min(countDetectedQuestions(accumulated), batchSize));
        },
        avoidPrompts
      );
      return shuffleQuestionOptions(validate(extractJson(raw), batchConfig));
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function generateQuiz(
  documents: SourceDocument[],
  config: GenerationConfig,
  options?: {
    maxRetries?: number;
    onProgress?: (progress: GenerationProgress) => void;
    // Fires once per question as soon as its batch finishes validating, so
    // the caller can stream completed questions to the client incrementally
    // instead of waiting for the whole (possibly multi-batch) quiz.
    onQuestion?: (index: number, question: QuizQuestion) => void;
    // Prompts of questions already on the quiz, so a single-question
    // regeneration (or a later batch) doesn't just repeat one that's
    // already been generated.
    avoidPrompts?: string[];
  }
): Promise<QuizQuestion[]> {
  // Bumped from 1 -> 2 (up to 3 attempts): now that a "retry" only means
  // redoing one small batch instead of the whole quiz, extra retries are
  // cheap insurance rather than a slow, expensive redo.
  const maxRetries = options?.maxRetries ?? 2;
  const batchSizes = splitIntoBatchSizes(config.numQuestions, MAX_BATCH_SIZE);
  const totalBatches = batchSizes.length;

  const allQuestions: QuizQuestion[] = [];
  const avoidPrompts = [...(options?.avoidPrompts ?? [])];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchSize = batchSizes[batchIndex]!;
    const questionsDoneBefore = allQuestions.length;

    let batchQuestions: QuizQuestion[];
    try {
      batchQuestions = await generateBatch(
        documents,
        config,
        batchSize,
        avoidPrompts,
        maxRetries,
        (attempt, detectedInBatch) => {
          options?.onProgress?.({
            attempt,
            questionsDetected: Math.min(
              questionsDoneBefore + detectedInBatch,
              config.numQuestions
            ),
            batch: batchIndex + 1,
            totalBatches,
          });
        }
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new QuizGenerationError(
        totalBatches > 1
          ? `Failed to generate quiz after ${maxRetries + 1} attempt(s) on batch ${
              batchIndex + 1
            } of ${totalBatches}: ${detail}`
          : `Failed to generate a valid quiz after ${maxRetries + 1} attempt(s): ${detail}`
      );
    }

    batchQuestions.forEach((question, i) => {
      options?.onQuestion?.(questionsDoneBefore + i, question);
    });
    allQuestions.push(...batchQuestions);
    avoidPrompts.push(...batchQuestions.map((q) => q.prompt));
  }

  // Each batch's questions independently number their own "id" starting at
  // 1, so renumber sequentially across the merged set — ids are used
  // elsewhere (e.g. targeting a specific question to edit/regenerate) and
  // must be unique across the whole quiz.
  return allQuestions.map((question, i) => ({ ...question, id: i + 1 }));
}
