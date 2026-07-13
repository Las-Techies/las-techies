import { Router } from "express";
import { getQuiz } from "../controllers/quizzes.controller";

const router = Router();

router.get("/:quizId", getQuiz);

export default router;
