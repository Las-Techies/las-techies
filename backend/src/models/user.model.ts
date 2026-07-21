import { prisma } from "../db/client";

export function findUserBySupabaseId(supabaseUserId: string) {
  return prisma.user.findUnique({ where: { supabaseUserId } });
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
  teamId: number; // default team for now (GUS import comes later)
}) {
  const existing = await findUserBySupabaseId(input.supabaseUserId);
  if (existing) {
    // Keep an existing user's team in sync with their JWT. Other fields
    // (name/role) are still only applied on first creation for now.
    if (existing.teamId !== input.teamId) {
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
      teamId: input.teamId,
      authProvider: "supabase",
    },
  });
}
