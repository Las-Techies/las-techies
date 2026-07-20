import type { Request, Response, NextFunction } from "express";
import {
  createQuiz,
  findLatestQuizForUser,
  findQuizById,
  isValidQuizStatus,
  updateQuizStatus,
} from "../models/quiz.model";
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

// Lets the frontend resume "my most recently generated quiz" on any device,
// instead of remembering a quizId in this browser's localStorage. Responds
// 200 with null (not 404) when the user has no quiz yet, since "no quiz" is
// a normal state here, not an error.
export async function getLatestQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quiz = await findLatestQuizForUser(user.id, user.teamId);
    res.json(quiz ?? null);
  } catch (err) {
    next(err);
  }
}

// Scoped to the requesting user's team so one team can't publish/unpublish
// another team's quiz by guessing an id.
export async function updateQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const id = Number(req.params.quizId);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: { message: "Invalid quiz id" } });
    }

    const { status } = req.body ?? {};
    if (!isValidQuizStatus(status)) {
      return res
        .status(400)
        .json({ error: { message: "status must be one of: draft, published" } });
    }

    const result = await updateQuizStatus(id, user.teamId, status);
    if (result.count === 0) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const quiz = await findQuizById(id);
    res.json(quiz);
  } catch (err) {
    next(err);
  }
}

type QuizSourceDocument = {
  id: number;
  title: string;
  rawText: string;
};

// Integration seam: loads a document's extracted text, scoped to the team.
async function getDocumentSource(id: number, teamId: number): Promise<QuizSourceDocument> {
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
  return {
    id: doc.id,
    title: doc.title,
    rawText: doc.rawText,
  };
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

type QuizMetadata = {
  title?: string;
  passingScore?: number;
  timeLimitMinutes?: number;
  dueDate?: Date;
};

// All optional/best-effort: a malformed metadata field is dropped rather than
// failing the whole generation request, since the AI-generation path is the
// part worth protecting from a bad request body.
function parseMetadata(raw: any): QuizMetadata {
  const metadata: QuizMetadata = {};
  if (!raw || typeof raw !== "object") return metadata;

  if (typeof raw.moduleTitle === "string" && raw.moduleTitle.trim() !== "") {
    metadata.title = raw.moduleTitle.trim();
  }
  if (
    typeof raw.passingScore === "number" &&
    Number.isFinite(raw.passingScore) &&
    raw.passingScore >= 0 &&
    raw.passingScore <= 100
  ) {
    metadata.passingScore = raw.passingScore;
  }
  if (
    typeof raw.timeLimitMinutes === "number" &&
    Number.isFinite(raw.timeLimitMinutes) &&
    raw.timeLimitMinutes > 0
  ) {
    metadata.timeLimitMinutes = raw.timeLimitMinutes;
  }
  if (typeof raw.dueDate === "string" && raw.dueDate.trim() !== "") {
    const parsedDate = new Date(raw.dueDate);
    if (!Number.isNaN(parsedDate.getTime())) {
      metadata.dueDate = parsedDate;
    }
  }
  return metadata;
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

  const metadata = parseMetadata(req.body?.metadata);

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
    const sourceDocuments = await Promise.all(
      documentIds.map((id: number) => getDocumentSource(id, user.teamId))
    );

    const questions = await generateQuizQuestions(sourceDocuments, config, {
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
      title:
        metadata.title ??
        `Quiz from document${documentIds.length > 1 ? "s" : ""} ${documentIds.join(", ")}`,
      sourceDocumentIds: documentIds,
      generationConfig: config,
      questionsPayload: questions,
      passingScore: metadata.passingScore,
      timeLimitMinutes: metadata.timeLimitMinutes,
      dueDate: metadata.dueDate,
    });

    send({ type: "done", quiz });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate quiz";
    send({ type: "error", message });
  } finally {
    res.end();
  }
}
