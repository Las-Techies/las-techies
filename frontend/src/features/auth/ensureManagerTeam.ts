import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import { apiFetch } from "../../api/client";

/**
 * Guarantees a signed-in manager has an active team, creating one if they don't.
 *
 * Why this exists: a manager names their team at signup, but when email
 * confirmation is on, `signUp` returns no session — so the team can't be created
 * inline and the name would be lost. We stash it in user_metadata as
 * `pending_team_name` at signup; this helper runs on the manager's first real
 * authenticated session (login, or Google profile completion) and turns that
 * pending name into an actual team. Without it, a confirmed manager could land
 * on the dashboard with no team at all.
 *
 * Safe to call on every manager login: it no-ops when the JWT already carries a
 * team_id. Returns true if it created a team (the caller should refresh the
 * session so the new team_id lands in the JWT before team-scoped requests run).
 */
export async function ensureManagerTeam(session: Session | null): Promise<boolean> {
  const metadata = session?.user.user_metadata ?? {};
  if (metadata.role !== "manager") return false;

  // Already has an active team — nothing to do.
  const teamId = metadata.team_id;
  if (Number.isInteger(Number(teamId))) return false;

  // Fall back to a sensible default name if the pending name is missing (e.g.
  // an older signup before this flow existed) so the manager still gets a team
  // rather than being stranded.
  const pendingName = String(metadata.pending_team_name ?? "").trim() || "My Team";

  await apiFetch("/api/teams", {
    method: "POST",
    body: JSON.stringify({ name: pendingName }),
  });

  // Clear the pending flag so we don't recreate the team on later logins if the
  // session's team_id claim is ever briefly absent.
  await supabase.auth.updateUser({ data: { pending_team_name: null } });

  return true;
}
