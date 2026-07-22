import { Router } from "express";
import {
  acceptInviteHandler,
  createInviteHandler,
  getInviteByTokenHandler,
} from "../controllers/invites.controller";

// requireAuth is applied globally in app.ts via app.use("/api", requireAuth),
// so the routes here (create + accept) require a logged-in user: the manager
// creates the invite, and the new hire signs up first then calls accept with
// their fresh session.
//
// The PUBLIC preview (GET /api/invites/:token) is registered in app.ts BEFORE
// requireAuth, because the new hire hits it before they have an account/JWT.
// The route below is kept for parity but is shadowed by that earlier match.
const router = Router();

router.post("/", createInviteHandler);
router.get("/:token", getInviteByTokenHandler);
router.post("/:token/accept", acceptInviteHandler);

export default router;
