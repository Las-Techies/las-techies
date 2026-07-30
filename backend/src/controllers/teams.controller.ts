import type { NextFunction, Request, Response } from "express";
import { supabaseAdmin } from "../db/supabaseAdmin";
import {
  claimTeamIfUnowned,
  createTeam,
  findTeamById,
  findTeamByIdForManager,
  findTeamsByManager,
} from "../models/team.model";
import { assignUserTeamAndRole } from "../models/user.model";

type AuthUser = {
  id: number;
  teamId: number;
  role: string;
  supabaseUserId: string;
};

/**
 * Points a manager's active team at `teamId` in the local User row (the source
 * of truth) and locks their role to manager. requireAuth reads req.user.teamId
 * from this row, so the switch takes effect on the very next request — no
 * Supabase session refresh required.
 *
 * Note we deliberately do NOT touch Supabase user_metadata here: an existing
 * user's team is owned by the DB (see user.model shouldSyncTeam), so a stale
 * team_id in the JWT is harmless and never overwrites this value.
 */
async function activateTeamInDb(
  supabaseUserId: string,
  teamId: number
): Promise<void> {
  await assignUserTeamAndRole({ supabaseUserId, teamId, role: "manager" });
}

/**
 * Like activateTeamInDb, but also stamps the team_id/role into Supabase
 * user_metadata. Used only at team CREATION: it's a manager's first team, so
 * the JWT claim is what ensureManagerTeam checks to decide "does this manager
 * already have a team?" — and it's the one moment shouldSyncTeam will adopt a
 * JWT team_id (when the DB row still has none). Returns a Supabase error
 * message on failure, or null on success.
 */
async function setActiveTeam(
  supabaseUserId: string,
  teamId: number
): Promise<string | null> {
  const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
    supabaseUserId,
    { user_metadata: { team_id: teamId, role: "manager" } }
  );
  if (metaError) return metaError.message;

  await activateTeamInDb(supabaseUserId, teamId);
  return null;
}

/**
 * Called when a manager names a new team — either at signup, or later from the
 * dashboard "Create new team" flow. Creates the Team owned by the caller, then
 * makes it their active team (a manager may own many teams but views one at a
 * time). The client must refresh its Supabase session afterward so requireAuth
 * reads the new team_id rather than the stale one.
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

    const team = await createTeam({ name, managerId: user.id });

    const metaError = await setActiveTeam(user.supabaseUserId, team.id);
    if (metaError) {
      return res.status(502).json({
        error: { message: `Could not finalize team setup: ${metaError}` },
      });
    }

    return res.status(201).json({ data: { id: team.id, name: team.name } });
  } catch (error) {
    next(error);
  }
}

/**
 * Lists every team the calling manager owns, for the dashboard team switcher.
 * Manager-only (gated by requireRole in the route).
 */
export async function getManagedTeamsHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // Backfill: a manager created before the managerId column existed owns a
    // team (their active one) that has no owner recorded. Claim it now, but
    // only if it's genuinely unowned, so their current team shows up in the
    // switcher instead of an empty list. No-op for managers who created their
    // team through the new flow.
    if (user.teamId) {
      await claimTeamIfUnowned(user.teamId, user.id);
    }

    const teams = await findTeamsByManager(user.id);
    return res.json({ data: teams });
  } catch (error) {
    next(error);
  }
}

/**
 * Switches the calling manager's active team to :teamId. Authorization is the
 * key step: we only activate a team the caller actually owns, so a manager
 * can't switch into another manager's team by guessing an id. The switch is
 * written to the DB (the source of truth for req.user.teamId), so it takes
 * effect on the caller's next request with no session refresh needed.
 */
export async function activateTeamHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.supabaseUserId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId)) {
      return res.status(400).json({ error: { message: "Invalid team id" } });
    }

    const team = await findTeamByIdForManager(teamId, user.id);
    if (!team) {
      // Either the team doesn't exist or the caller doesn't own it — same
      // response either way, so we don't leak which teams exist.
      return res
        .status(404)
        .json({ error: { message: "Team not found or not yours to manage" } });
    }

    await activateTeamInDb(user.supabaseUserId, team.id);

    return res.json({ data: { id: team.id, name: team.name } });
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
