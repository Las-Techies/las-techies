import type { NextFunction, Request, Response } from "express";
import { randomBytes } from "crypto";
import { env } from "../config/env";
import { supabaseAdmin } from "../db/supabaseAdmin";
import { sendMail } from "../services/mailer";
import {
  createInvite,
  findInviteByToken,
  markInviteUsed,
} from "../models/invite.model";
import { assignUserTeamAndRole } from "../models/user.model";
import { findTeamById } from "../models/team.model";

type AuthUser = {
  id: number;
  teamId: number;
  role: string;
  supabaseUserId: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Manager-only: invite a new hire to join the manager's team.
 *
 * Security: the invite's teamId is taken from the manager's verified session
 * (req.user.teamId), never from the request body. The link carries only an
 * opaque random token; the team is resolved server-side from the Invite row
 * at accept time, so a new hire can't influence which team they land on.
 */
export async function createInviteHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id || !user?.teamId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    if (user.role !== "manager") {
      return res
        .status(403)
        .json({ error: { message: "Only managers can invite new hires" } });
    }

    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return res
        .status(400)
        .json({ error: { message: "A valid email is required" } });
    }
    if (env.allowedEmailDomain) {
      const domain = email.split("@")[1];
      if (domain !== env.allowedEmailDomain.toLowerCase()) {
        return res.status(400).json({
          error: {
            message: `Invites are restricted to @${env.allowedEmailDomain} email addresses`,
          },
        });
      }
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + env.inviteExpiryHours * 60 * 60 * 1000
    );

    await createInvite({
      token,
      teamId: user.teamId,
      email,
      createdByUserId: user.id,
      expiresAt,
    });

    const team = await findTeamById(user.teamId);
    const teamName = team?.name ?? "your team";
    const link = `${env.appUrl}/signup?invite=${token}`;

    await sendMail({
      to: email,
      subject: `You've been invited to join ${teamName} on SageForce`,
      text: `You've been invited to take an onboarding quiz on SageForce.\n\nClick this link to create your account and get started:\n${link}\n\nThis link expires in ${env.inviteExpiryHours} hours.`,
      html: `
        <p>You've been invited to take an onboarding quiz on <strong>SageForce</strong>.</p>
        <p><a href="${link}">Click here to create your account and get started.</a></p>
        <p style="color:#666">This link expires in ${env.inviteExpiryHours} hours.</p>
      `,
    });

    return res.status(201).json({ data: { email, teamId: user.teamId } });
  } catch (error) {
    next(error);
  }
}

/**
 * Public preview for the signup page: given a token, report whether it's a
 * valid, unexpired, unused invite and (if so) the team name to display.
 * Deliberately does NOT leak the teamId or email of an invalid token.
 */
export async function getInviteByTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = String(req.params.token ?? "");
    const invite = await findInviteByToken(token);

    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return res
        .status(404)
        .json({ error: { message: "This invite link is invalid or has expired" } });
    }

    const team = await findTeamById(invite.teamId);
    return res.json({
      data: { email: invite.email, teamName: team?.name ?? null },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Called by the freshly-signed-up new hire. Validates the token, then assigns
 * them to the invite's team and locks their role to new_hire — both in the
 * local User row and in Supabase user_metadata (so it rides along in future
 * JWTs). Finally marks the invite used so it can't be redeemed again.
 */
export async function acceptInviteHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.supabaseUserId) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    // Invites are for onboarding new hires. Refuse to convert a manager (who
    // owns their own team) into a new_hire on someone else's team.
    if (user.role === "manager") {
      return res.status(409).json({
        error: {
          message:
            "This account is a manager and can't join a team as a new hire. Use a different email for the invite.",
        },
      });
    }

    const token = String(req.params.token ?? "");
    const invite = await findInviteByToken(token);
    if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
      return res
        .status(404)
        .json({ error: { message: "This invite link is invalid or has expired" } });
    }

    // Team + role come from the trusted invite record, not from the client.
    const teamId = invite.teamId;

    // Persist to Supabase so it's in every future JWT (requireAuth reads it).
    const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
      user.supabaseUserId,
      { user_metadata: { team_id: teamId, role: "new_hire" } }
    );
    if (metaError) {
      return res.status(502).json({
        error: { message: `Could not finalize invite: ${metaError.message}` },
      });
    }

    // Update the local row now so the response reflects the new team
    // immediately (rather than waiting for the next login to sync).
    await assignUserTeamAndRole({
      supabaseUserId: user.supabaseUserId,
      teamId,
      role: "new_hire",
    });

    await markInviteUsed(invite.id);

    return res.json({ data: { teamId, role: "new_hire" } });
  } catch (error) {
    next(error);
  }
}
