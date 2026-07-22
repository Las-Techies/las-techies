import type { Request, Response, NextFunction } from "express";
import {
  createQuiz,
  findLatestQuizForUser,
  findLatestPublishedQuizForTeam,
  findQuizById,
  findQuizByIdForTeam,
  isValidQuizStatus,
  updateQuizQuestions,
  updateQuizStatus,
} from "../models/quiz.model";
import { findDocumentByIdForTeam } from "../models/document.model";
import { generateQuiz as generateQuizQuestions } from "../services/quizGenerator";
import type { GenerationConfig, QuizQuestion } from "../services/quizTypes";

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

// Returns "the quiz to show me" and is role-aware:
//   - manager: their most recently generated quiz (to resume editing/publishing)
//   - new hire: the latest *published* quiz on their team (their assignment) —
//     new hires author nothing, so a creator-scoped lookup would always be null.
// Responds 200 with null (not 404) when there's no quiz yet, since "no quiz" is
// a normal state here, not an error.
export async function getLatestQuiz(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quiz =
      user.role === "manager"
        ? await findLatestQuizForUser(user.id, user.teamId)
        : await findLatestPublishedQuizForTeam(user.teamId);
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

// Mirrors the shape-checks in quizGenerator.ts's validate(), scaled down to a
// single manually-edited question rather than a whole batch. Keeps the
// original question's id regardless of what (if anything) the client sends.
function validateQuestionBody(raw: any, questionId: number): QuizQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.prompt !== "string" || raw.prompt.trim() === "") return null;
  if (!Array.isArray(raw.options) || raw.options.length < 2) return null;
  if (raw.options.some((o: any) => typeof o?.text !== "string" || o.text.trim() === "")) {
    return null;
  }
  const correctCount = raw.options.filter((o: any) => o?.isCorrect === true).length;
  if (correctCount !== 1) return null;
  if (typeof raw.explanation !== "string" || raw.explanation.trim() === "") return null;

  const citation = raw.citation;
  if (
    !citation ||
    typeof citation !== "object" ||
    typeof citation.sourceDocumentId !== "number" ||
    typeof citation.sourceDocumentTitle !== "string" ||
    typeof citation.sourceSnippet !== "string"
  ) {
    return null;
  }

  return {
    id: questionId,
    prompt: raw.prompt.trim(),
    type: "multiple_choice",
    options: raw.options.map((option: any, index: number) => ({
      id: typeof option.id === "number" ? option.id : index + 1,
      text: String(option.text).trim(),
      isCorrect: option.isCorrect === true,
    })),
    explanation: raw.explanation.trim(),
    citation: {
      sourceDocumentId: citation.sourceDocumentId,
      sourceDocumentTitle: citation.sourceDocumentTitle,
      sourceSnippet: citation.sourceSnippet,
    },
  };
}

// Lets a manager hand-edit a single question (prompt/options/correct
// answer/explanation) without regenerating the whole quiz.
export async function updateQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(quizId) || !Number.isFinite(questionId)) {
      return res.status(400).json({ error: { message: "Invalid quiz or question id" } });
    }

    const quiz = await findQuizByIdForTeam(quizId, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const questions = quiz.questionsPayload as unknown as QuizQuestion[];
    const index = questions.findIndex((question) => question.id === questionId);
    if (index === -1) {
      return res.status(404).json({ error: { message: "Question not found on this quiz" } });
    }

    const updatedQuestion = validateQuestionBody(req.body, questionId);
    if (!updatedQuestion) {
      return res.status(400).json({
        error: {
          message:
            "Invalid question: needs a prompt, at least 2 non-empty options with exactly one marked correct, an explanation, and a citation.",
        },
      });
    }

    const nextQuestions = [...questions];
    nextQuestions[index] = updatedQuestion;

    await updateQuizQuestions(quizId, user.teamId, nextQuestions);
    const refreshed = await findQuizById(quizId);
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
}

// Removes one question and asks the AI for a single replacement drawn from
// the same source documents/config the quiz was originally generated with,
// telling it not to repeat any question still on the quiz.
export async function regenerateQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const quizId = Number(req.params.quizId);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(quizId) || !Number.isFinite(questionId)) {
      return res.status(400).json({ error: { message: "Invalid quiz or question id" } });
    }

    const quiz = await findQuizByIdForTeam(quizId, user.teamId);
    if (!quiz) {
      return res.status(404).json({ error: { message: "Quiz not found" } });
    }

    const questions = quiz.questionsPayload as unknown as QuizQuestion[];
    const index = questions.findIndex((question) => question.id === questionId);
    if (index === -1) {
      return res.status(404).json({ error: { message: "Question not found on this quiz" } });
    }

    const sourceDocumentIds = quiz.sourceDocumentIds as unknown as number[];
    if (!Array.isArray(sourceDocumentIds) || sourceDocumentIds.length === 0) {
      return res
        .status(400)
        .json({ error: { message: "Quiz has no source documents to regenerate from" } });
    }

    const baseConfig = quiz.generationConfig as unknown as GenerationConfig | null;
    if (
      !baseConfig ||
      typeof baseConfig.difficulty !== "string" ||
      !Array.isArray(baseConfig.questionTypes)
    ) {
      return res
        .status(400)
        .json({ error: { message: "Quiz is missing a valid generation config" } });
    }

    const sourceDocuments = await Promise.all(
      sourceDocumentIds.map((id) => getDocumentSource(id, user.teamId))
    );

    const avoidPrompts = questions
      .filter((_, i) => i !== index)
      .map((question) => question.prompt);

    const [replacement] = await generateQuizQuestions(
      sourceDocuments,
      { ...baseConfig, numQuestions: 1 },
      { avoidPrompts }
    );
    if (!replacement) {
      throw new Error("AI did not return a replacement question");
    }

    const nextQuestions = [...questions];
    nextQuestions[index] = { ...replacement, id: questionId };

    await updateQuizQuestions(quizId, user.teamId, nextQuestions);
    const refreshed = await findQuizById(quizId);
    res.json(refreshed);
  } catch (err) {
    next(err);
  }
}
