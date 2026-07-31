import { Router } from "express";
import { requireRole } from "../middleware/requireRole";
import {
  activateTeamHandler,
  createTeamHandler,
  getManagedTeamsHandler,
  getMyTeamHandler,
} from "../controllers/teams.controller";

// requireAuth is applied globally in app.ts. Any signed-in user may create a
// team (which makes them its manager); there's no pre-existing manager role to
// gate on at this point in the signup flow.
const router = Router();

router.post("/", createTeamHandler);
router.get("/mine", getMyTeamHandler);
// Team switcher: list the teams this manager owns, and switch the active one.
// Manager-only — new hires belong to exactly one team and never switch.
router.get("/managed", requireRole("manager"), getManagedTeamsHandler);
router.post("/:teamId/activate", requireRole("manager"), activateTeamHandler);

export default router;
