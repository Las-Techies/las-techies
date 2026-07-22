import type { Request, Response, NextFunction } from "express";
import { findTeamMembersByRole } from "../models/user.model";

// Powers the "assign learners" picker on Review & Publish: managers need a
// real roster (id + name + email) of new hires on their own team, not
// free-text emails that don't map to an actual account.
export async function getTeamMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const user = (req as any).user;
    const role = typeof req.query.role === "string" ? req.query.role : "new_hire";

    const members = await findTeamMembersByRole(user.teamId, role);
    res.json({ data: members });
  } catch (err) {
    next(err);
  }
}
