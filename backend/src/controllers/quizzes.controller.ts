import type { Request, Response, NextFunction } from "express";
import { createQuiz, findQuizById } from "../models/quiz.model";
import { findDocumentByIdForTeam } from "../models/document.model";
import { generateQuiz as generateQuizQuestions } from "../services/quizGenerator";
import type { GenerationConfig } from "../services/quizTypes";

export async function getQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const id = Number(req.params.quizId);
    const quiz = await findQuizById(id);
    if (!quiz) return res.status(404).json({ error: { message: "Quiz not found" } });
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

// Integration seam: loads a document's extracted text, scoped to the team.
async function getDocumentText(id: number, teamId: number): Promise<string> {
  const doc = await findDocumentByIdForTeam(id, teamId);
  if (!doc) {
    throw Object.assign(new Error(`Document ${id} not found`), { status: 404 });
  }
  if (doc.status !== "ready" || !doc.rawText) {
    throw Object.assign(
      new Error(`Document ${id} has no extracted text (status: ${doc.status})`),
      { status: 400 }
    );
  }
  return doc.rawText;
}

function parseConfig(raw: any): GenerationConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const { numQuestions, difficulty, questionTypes, topic } = raw;
  if (typeof numQuestions !== "number" || numQuestions < 1) return null;
  if (!["easy", "medium", "hard"].includes(difficulty)) return null;
  if (!Array.isArray(questionTypes) || questionTypes.length === 0) return null;

  const config: GenerationConfig = { numQuestions, difficulty, questionTypes };
  if (typeof topic === "string" && topic.trim() !== "") config.topic = topic.trim();
  return config;
}

// Streams progress over SSE while the LLM generates, so the frontend can show
// live "generating question X of N" feedback instead of a blind spinner.
// Once headers are flushed as text/event-stream, failures are reported as an
// "error" event in the stream (status code can no longer change), not a
// normal HTTP error response.
export async function generateQuiz(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const { documentIds } = req.body ?? {};

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res
      .status(400)
      .json({ error: { message: "documentIds must be a non-empty array" } });
  }

  const config = parseConfig(req.body?.config);
  if (!config) {
    return res.status(400).json({ error: { message: "Invalid generation config" } });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    const texts = await Promise.all(
      documentIds.map((id: number) => getDocumentText(id, user.teamId))
    );

    const questions = await generateQuizQuestions(texts.join("\n\n"), config, {
      onProgress: ({ attempt, questionsDetected }) => {
        send({
          type: "progress",
          attempt,
          questionsDetected,
          totalQuestions: config.numQuestions,
        });
      },
    });

    const quiz = await createQuiz({
      teamId: user.teamId,
      createdByUserId: user.id,
      title: `Quiz from document${documentIds.length > 1 ? "s" : ""} ${documentIds.join(", ")}`,
      sourceDocumentIds: documentIds,
      generationConfig: config,
      questionsPayload: questions,
    });

    send({ type: "done", quiz });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quiz";
    send({ type: "error", message });
  } finally {
    res.end();
  }
}
