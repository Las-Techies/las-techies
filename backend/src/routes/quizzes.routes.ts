import { Router } from "express";
import {
  generateQuiz,
  getLatestQuiz,
  getQuiz,
  regenerateQuestion,
  updateQuestion,
  updateQuiz,
} from "../controllers/quizzes.controller";

const router = Router();

router.post("/generate", generateQuiz);
router.get("/mine/latest", getLatestQuiz);
router.get("/:quizId", getQuiz);
router.patch("/:quizId", updateQuiz);
router.patch("/:quizId/questions/:questionId", updateQuestion);
router.post("/:quizId/questions/:questionId/regenerate", regenerateQuestion);

export default router;
