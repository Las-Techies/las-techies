import { prisma } from "../db/client";

// Fallback for a genuinely brand-new user whose JWT doesn't carry a team_id
// yet (GUS import comes later). Only used at creation time — see
// findOrCreateUserFromSupabase, which deliberately does NOT fall back to
// this for an existing user with a missing/invalid team_id claim, since that
// previously caused a real team assignment to get silently overwritten
// whenever a session's JWT happened to lack team_id (e.g. right after
// linking a second OAuth identity).
const DEFAULT_TEAM_ID = 1;

export function findUserBySupabaseId(supabaseUserId: string) {
  return prisma.user.findUnique({ where: { supabaseUserId } });
}

// Powers the "assign learners" picker on Review & Publish: a manager needs
// real user ids (not free-text emails) for a team roster of new hires.
export function findTeamMembersByRole(teamId: number, role: string) {
  return prisma.user.findMany({
    where: { teamId, role },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

// Used to validate that assignment target ids are real new hires on the
// manager's own team, not arbitrary/cross-team user ids.
export function findUsersByIdsForTeam(ids: number[], teamId: number) {
  return prisma.user.findMany({
    where: { id: { in: ids }, teamId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
}

// Batch name lookup for document/quiz attribution ("uploaded by X").
export function findUsersByIds(ids: number[]) {
  return prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  });
}

// Used when a new hire accepts an invite: assign them to the inviting
// manager's team and lock their role to new_hire, server-side.
export function assignUserTeamAndRole(input: {
  supabaseUserId: string;
  teamId: number;
  role: string;
}) {
  return prisma.user.update({
    where: { supabaseUserId: input.supabaseUserId },
    data: { teamId: input.teamId, role: input.role },
  });
}

export async function findOrCreateUserFromSupabase(input: {
  supabaseUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string; // from JWT user_metadata; applied only on first creation
  // `null` means this session's JWT doesn't have a team_id claim (e.g. it
  // predates a team being created, or came from an OAuth exchange that
  // didn't carry custom metadata) — NOT "this user has no team". Only used
  // as-is for a brand-new user (falls back to DEFAULT_TEAM_ID below); an
  // existing user's already-assigned team is left alone instead.
  teamId: number | null;
}) {
  const existing = await findUserBySupabaseId(input.supabaseUserId);
  if (existing) {
    // Keep an existing user's team in sync with their JWT, but only when the
    // JWT actually asserts a team — a missing/invalid claim must never
    // overwrite a real assignment (this is what previously reset managers
    // back to the demo team after linking a second OAuth identity). Other
    // fields (name/role) are still only applied on first creation for now.
    if (input.teamId !== null && existing.teamId !== input.teamId) {
      return prisma.user.update({
        where: { id: existing.id },
        data: { teamId: input.teamId },
      });
    }
    return existing;
  }

  return prisma.user.create({
    data: {
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      teamId: input.teamId ?? DEFAULT_TEAM_ID,
      authProvider: "supabase",
    },
  });
}
