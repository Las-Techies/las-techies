import type { Request, Response, NextFunction } from "express";
import { findQuizById } from "../models/quiz.model";

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
