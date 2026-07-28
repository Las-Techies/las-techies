import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { findOrCreateUserFromSupabase } from "../models/user.model";

function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function deriveNameFromSupabaseUser(supabaseUser: any): { firstName: string; lastName: string } {
  const metadata = (supabaseUser?.user_metadata ?? {}) as Record<string, unknown>;

  const directFirst = String(metadata.first_name ?? "").trim();
  const directLast = String(metadata.last_name ?? "").trim();
  if (directFirst || directLast) {
    return {
      firstName: directFirst || "Unknown",
      lastName: directLast,
    };
  }

  const givenName = String(metadata.given_name ?? "").trim();
  const familyName = String(metadata.family_name ?? "").trim();
  if (givenName || familyName) {
    return {
      firstName: givenName || "Unknown",
      lastName: familyName,
    };
  }

  const fullName = String(metadata.full_name ?? metadata.name ?? "").trim();
  if (fullName) {
    const parsed = splitDisplayName(fullName);
    return {
      firstName: parsed.firstName || "Unknown",
      lastName: parsed.lastName,
    };
  }

  // Final fallback: derive something readable from the email prefix.
  const email = String(supabaseUser?.email ?? "").trim();
  const prefix = email.split("@")[0]?.trim() ?? "";
  if (prefix) {
    const parsed = splitDisplayName(prefix.replace(/[._-]+/g, " "));
    return {
      firstName: parsed.firstName || "Unknown",
      lastName: parsed.lastName,
    };
  }

  return { firstName: "Unknown", lastName: "" };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
      return res
        .status(500)
        .json({ error: { message: "Supabase auth is not configured" } });
    }

    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return res.status(401).json({ error: { message: "Missing auth token" } });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res
        .status(401)
        .json({ error: { message: "Invalid or expired token" } });
    }

    const supabaseUser = data.user;
    const role =
      (supabaseUser.user_metadata?.role as string | undefined) ?? "new_hire";
    const { firstName, lastName } = deriveNameFromSupabaseUser(supabaseUser);
    // Team now rides along in the JWT like role/name do. `null` here means
    // "this session's metadata doesn't say". We preserve that null for
    // brand-new users so they are not auto-assigned to any default team;
    // invite acceptance or manager team setup is what should assign team_id.
    // For existing users, a missing claim still must not overwrite their
    // already-assigned team.
    const teamIdRaw = supabaseUser.user_metadata?.team_id;
    const teamId = Number.isInteger(Number(teamIdRaw)) ? Number(teamIdRaw) : null;

    const user = await findOrCreateUserFromSupabase({
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email ?? "",
      firstName,
      lastName,
      role,
      teamId,
    });

    (req as any).user = {
      id: user.id,
      teamId: user.teamId,
      role: user.role,
      supabaseUserId: supabaseUser.id,
    };
    next();
  } catch (err) {
    next(err);
  }
}
