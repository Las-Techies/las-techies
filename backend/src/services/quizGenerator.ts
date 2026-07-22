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
};

type SourceDocument = {
  id: number;
  title: string;
  rawText: string;
};

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
        { role: "user", content: buildPrompt(documents, config, avoidPrompts) },
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

export async function generateQuiz(
  documents: SourceDocument[],
  config: GenerationConfig,
  options?: {
    maxRetries?: number;
    onProgress?: (progress: GenerationProgress) => void;
    // Prompts of questions already on the quiz, so a single-question
    // regeneration doesn't just repeat one that's still there.
    avoidPrompts?: string[];
  }
): Promise<QuizQuestion[]> {
  const maxRetries = options?.maxRetries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callGatewayStream(
        documents,
        config,
        (accumulated) => {
          options?.onProgress?.({
            attempt: attempt + 1,
            questionsDetected: Math.min(countDetectedQuestions(accumulated), config.numQuestions),
          });
        },
        options?.avoidPrompts
      );
      return validate(extractJson(raw), config);
    } catch (err) {
      lastError = err;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new QuizGenerationError(
    `Failed to generate a valid quiz after ${maxRetries + 1} attempt(s): ${detail}`
  );
}
