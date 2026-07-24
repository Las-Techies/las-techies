import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { createTeam, findTeamById } from "../models/team.model";
import { assignUserTeamAndRole } from "../models/user.model";

type AuthUser = {
  id: number;
  teamId: number;
  role: string;
  supabaseUserId: string;
};

/**
 * Called by a signed-in user who chose "manager" at signup and named their
 * team. Creates the Team, then assigns the caller to it as a manager — both in
 * Supabase user_metadata (so it rides in future JWTs) and in the local User row.
 *
 * The client must refresh its Supabase session afterward so requireAuth reads
 * the new team_id rather than the stale default.
 */
export async function createTeamHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.supabaseUserId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const name = String(req.body?.name ?? "").trim();
    if (!name) {
      return res
        .status(400)
        .json({ error: { message: "A team name is required" } });
    }

    const team = await createTeam({ name });

    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      user.supabaseUserId,
      { user_metadata: { team_id: team.id, role: "manager" } }
    );
    if (metaError) {
      return res.status(502).json({
        error: { message: `Could not finalize team setup: ${metaError.message}` },
      });
    }

    await assignUserTeamAndRole({
      supabaseUserId: user.supabaseUserId,
      teamId: team.id,
      role: "manager",
    });

    return res.status(201).json({ data: { id: team.id, name: team.name } });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns the caller's own team (id + name), for UI that wants to show the
 * team's real name rather than e.g. a quiz title — the learner module header
 * being the first case. Available to any signed-in role, not just managers,
 * since new hires need it too.
 */
export async function getMyTeamHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const team = await findTeamById(user.teamId);
    if (!team) {
      return res.status(404).json({ error: { message: "Team not found" } });
    }

    return res.json({ data: { id: team.id, name: team.name } });
  } catch (error) {
    next(error);
  }
}
