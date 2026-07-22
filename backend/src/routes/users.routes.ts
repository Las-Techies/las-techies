import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import { getTeamMembers } from "../controllers/users.controller";

const router = Router();

router.get("/team-members", requireRole("manager"), getTeamMembers);

export default router;
