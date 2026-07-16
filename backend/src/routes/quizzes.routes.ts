import { Router } from "express";
import { generateQuiz, getQuiz, updateQuiz } from "../controllers/quizzes.controller";

const router = Router();

router.post("/generate", generateQuiz);
router.get("/:quizId", getQuiz);
router.patch("/:quizId", updateQuiz);

export default router;
