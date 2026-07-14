import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { findOrCreateUserFromSupabase } from "../models/user.model";

const DEFAULT_TEAM_ID = 1;

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
    const fullName =
      (supabaseUser.user_metadata?.full_name as string | undefined) ??
      supabaseUser.email ??
      "Unknown";

    const user = await findOrCreateUserFromSupabase({
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email ?? "",
      fullName,
      role,
      teamId: DEFAULT_TEAM_ID,
    });

    (req as any).user = {
      id: user.id,
      teamId: user.teamId,
      role: user.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}
