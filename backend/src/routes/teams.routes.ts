import { Router } from "express";
import { createTeamHandler } from "../controllers/teams.controller";

// requireAuth is applied globally in app.ts. Any signed-in user may create a
// team (which makes them its manager); there's no pre-existing manager role to
// gate on at this point in the signup flow.
const router = Router();

router.post("/", createTeamHandler);

export default router;
