import type { Request, Response, NextFunction } from "express";
import { createQuiz, findQuizById } from "../models/quiz.model";
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

// Integration seam: turns a documentId into its raw text.
// TODO: swap the mock for the real Prisma lookup once Melanie's upload is merged
// and Document rows with rawText exist:
//   const doc = await prisma.document.findUnique({ where: { id } });
//   if (!doc) throw Object.assign(new Error("Document not found"), { status: 404 });
//   if (!doc.rawText) throw Object.assign(new Error("Document has no extracted text"), { status: 400 });
//   return doc.rawText;
async function getDocumentText(_id: number): Promise<string> {
  return "The deploy workflow starts by opening a pull request. A reviewer approves it, CI runs the test suite, and once green the change is merged to main. A release is then cut and deployed to staging before production.";
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

export async function generateQuiz(req: Request, res: Response, next: NextFunction) {
  try {
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

    const texts = await Promise.all(documentIds.map((id: number) => getDocumentText(id)));
    const questions = await generateQuizQuestions(texts.join("\n\n"), config);

    const quiz = await createQuiz({
      teamId: user.teamId,
      createdByUserId: user.id,
      title: `Quiz from document${documentIds.length > 1 ? "s" : ""} ${documentIds.join(", ")}`,
      sourceDocumentIds: documentIds,
      generationConfig: config,
      questionsPayload: questions,
    });

    res.status(201).json(quiz);
  } catch (err) {
    next(err);
  }
}
