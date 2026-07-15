import { prisma } from "../db/client";

export function findUserBySupabaseId(supabaseUserId: string) {
  return prisma.user.findUnique({ where: { supabaseUserId } });
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
  if (existing) return existing;

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
