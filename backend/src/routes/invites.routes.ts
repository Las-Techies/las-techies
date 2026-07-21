import { Router } from "express";
import {
  acceptInviteHandler,
  createInviteHandler,
  getInviteByTokenHandler,
} from "../controllers/invites.controller";

// requireAuth is applied globally in app.ts via app.use("/api", requireAuth).
// The manager-only check lives in createInviteHandler. Note: the preview and
// accept endpoints also require a logged-in user (the new hire signs up first,
// then calls accept with their fresh session).
const router = Router();

router.post("/", createInviteHandler);
router.get("/:token", getInviteByTokenHandler);
router.post("/:token/accept", acceptInviteHandler);

export default router;
