import { prisma } from "../db/client";

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
  // predates team assignment, or came from an OAuth exchange that didn't
  // carry custom metadata). For brand-new users we persist null, so uninvited
  // new hires are not auto-assigned to any team.
  teamId: number | null;
}) {
  const existing = await findUserBySupabaseId(input.supabaseUserId);
  if (existing) {
    const normalizedFirst = input.firstName.trim();
    const normalizedLast = input.lastName.trim();
    const existingFirst = existing.firstName.trim();
    const existingLast = existing.lastName.trim();

    const hasBetterIncomingName =
      normalizedFirst !== "" &&
      normalizedFirst.toLowerCase() !== "unknown" &&
      (existingFirst === "" ||
        existingFirst.toLowerCase() === "unknown" ||
        existingLast === "");

    // The DB is the source of truth for an existing user's team, not the JWT.
    // We only adopt the JWT's team_id when the user has NO team yet (their very
    // first assignment — e.g. a freshly created manager, or the brief window
    // during invite acceptance). Once a team is set, a JWT claim never changes
    // it: managers switch teams via the DB (activateTeam), so their token's
    // team_id goes intentionally stale, and honoring it here would silently
    // revert their active team (the same failure mode that previously reset
    // managers to the demo team after linking a second OAuth identity).
    const shouldSyncTeam = input.teamId !== null && existing.teamId === null;
    if (shouldSyncTeam || hasBetterIncomingName) {
      return prisma.user.update({
        where: { id: existing.id },
        data: {
          ...(shouldSyncTeam ? { teamId: input.teamId } : {}),
          ...(hasBetterIncomingName
            ? {
                firstName: normalizedFirst,
                lastName: normalizedLast,
              }
            : {}),
        },
      });
    }

    // Existing user with a team already set: leave it untouched. Their team is
    // owned by the DB now (see shouldSyncTeam above) — neither a missing claim
    // nor a stale-but-present one may overwrite it. Other fields (name/role)
    // are still only applied on first creation for now.
    return existing;
  }

  return prisma.user.create({
    data: {
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      teamId: input.teamId,
      authProvider: "supabase",
    },
  });
}
