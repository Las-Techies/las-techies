import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  assignQuiz,
  completeAssignment,
  generateQuiz,
  getAssignedQuizzes,
  getLatestQuiz,
  getManagerDashboard,
  getQuiz,
  regenerateQuestion,
  updateQuestion,
  updateQuiz,
  deleteQuiz,
} from "../controllers/quizzes.controller";

const router = Router();

router.post("/generate", requireRole("manager"), generateQuiz);
router.get("/mine/latest", getLatestQuiz);
router.get("/assigned/mine", getAssignedQuizzes);
router.get("/manager/dashboard", requireRole("manager"), getManagerDashboard);
router.get("/:quizId", getQuiz);
router.patch("/:quizId", requireRole("manager"), updateQuiz);
router.delete("/:quizId", requireRole("manager"), deleteQuiz);
router.patch("/:quizId/questions/:questionId", requireRole("manager"), updateQuestion);
router.post(
  "/:quizId/questions/:questionId/regenerate",
  requireRole("manager"),
  regenerateQuestion
);
router.post("/:quizId/assignments", requireRole("manager"), assignQuiz);
router.post("/:quizId/assignments/me/complete", completeAssignment);

export default router;
