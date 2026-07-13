import { env } from "../config/env";
import { buildPrompt } from "../utils/prompts";
import type { GenerationConfig, QuizQuestion } from "./quizTypes";

const MODEL = "claude-sonnet-4-5-20250929";

export class QuizGenerationError extends Error {
  status = 500;
  constructor(message: string) {
    super(message);
    this.name = "QuizGenerationError";
  }
}

async function callGateway(documentText: string, config: GenerationConfig): Promise<string> {
  if (!env.llmGatewayUrl || !env.llmKey) {
    throw new QuizGenerationError(
      "LLM gateway is not configured. Set LLM_GATEWAY_URL and ENG_AI_MODEL_GW_KEY in backend/.env."
    );
  }

  const res = await fetch(env.llmGatewayUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.llmKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a quiz generator for Salesforce onboarding documentation. You only output valid JSON.",
        },
        { role: "user", content: buildPrompt(documentText, config) },
      ],
    }),
  });

  if (!res.ok) {
    throw new QuizGenerationError(`LLM gateway returned ${res.status} ${res.statusText}`);
  }

  const data: any = await res.json();
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new QuizGenerationError("LLM gateway returned an empty response");
  }
  return content;
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
  });

  return questions;
}

export async function generateQuiz(
  documentText: string,
  config: GenerationConfig,
  maxRetries = 1
): Promise<QuizQuestion[]> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callGateway(documentText, config);
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
