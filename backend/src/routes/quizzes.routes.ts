import { Router } from "express";
import { generateQuiz, getQuiz } from "../controllers/quizzes.controller";

const router = Router();

router.post("/generate", generateQuiz);
router.get("/:quizId", getQuiz);

export default router;
