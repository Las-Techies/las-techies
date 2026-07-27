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
import { createQuizAssignments, findQuizByIdForTeam } from "../models/quiz.model";

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

    // Optional: the quiz this invite is for. When present, accepting the
    // invite auto-creates a QuizAssignment so the new hire lands with the
    // quiz already on their onboarding list. Validated against the manager's
    // team so a manager can't attach another team's quiz to their invite.
    let quizId: number | null = null;
    if (req.body?.quizId !== undefined && req.body?.quizId !== null) {
      const parsed = Number(req.body.quizId);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return res.status(400).json({ error: { message: "Invalid quizId" } });
      }
      const quiz = await findQuizByIdForTeam(parsed, user.teamId);
      if (!quiz) {
        return res
          .status(404)
          .json({ error: { message: "Quiz not found on your team" } });
      }
      quizId = quiz.id;
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + env.inviteExpiryHours * 60 * 60 * 1000
    );

    await createInvite({
      token,
      teamId: user.teamId,
      email,
      quizId,
      createdByUserId: user.id,
      expiresAt,
    });

    const team = await findTeamById(user.teamId);
    const teamName = team?.name ?? "your team";
    const link = `${env.appUrl}/signup?invite=${token}`;
    const inviteExpiryDays = Math.max(1, Math.ceil(env.inviteExpiryHours / 24));
    const inviteExpiryDaysLabel = `${inviteExpiryDays} day${inviteExpiryDays === 1 ? "" : "s"}`;
    const pandaImageUrl =
      "https://raw.githubusercontent.com/Las-Techies/las-techies/main/frontend/src/assets/panda-cheer-fullhat.png";
    const escapedTeamName = teamName
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    await sendMail({
      to: email,
      subject: `🎉 You're invited to join ${teamName} on SageForce`,
      text: `Welcome aboard! 🐼

You've been invited to join ${teamName} on SageForce — your onboarding workspace where getting up to speed is actually kind of fun.

Accept your invite:
${link}

New to SageForce?
1) Click Accept Invite
2) Create your account or continue with Google
3) Finish setup and hop into your workspace

Already have an account?
1) Click Accept Invite
2) Log in with your existing account
3) You'll land straight in your workspace

No pressure — if you didn't expect this invite, you can safely ignore this email.

Heads up: this link expires in ${inviteExpiryDaysLabel}, so grab it while it's fresh!`,
      html: `
        <div style="margin:0;padding:0;background:#eef4ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0e2a47;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your invite to ${escapedTeamName} on SageForce is ready — let's get you onboarded. 🐼</div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef4ff;padding:40px 12px;">
            <tr>
              <td align="center">
                <!-- Panda peeking over the top of the card. Sits above the card with a
                     negative bottom margin so its lower half tucks behind the header. -->
                <img
                  src="${pandaImageUrl}"
                  alt="Celebrating SageForce panda"
                  width="220"
                  style="display:block;margin:0 auto -56px;position:relative;z-index:2;border:0;outline:none;text-decoration:none;max-width:70%;height:auto;"
                />
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:720px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #d6e4ff;box-shadow:0 16px 40px rgba(26,123,224,0.14);">
                  <tr>
                    <td style="background:linear-gradient(135deg,#1657c0 0%,#2f8bff 55%,#7bc0ff 100%);padding:64px 32px 34px;color:#ffffff;text-align:center;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">✦ SageForce</div>
                      <div style="margin-top:10px;font-size:38px;line-height:1.15;font-weight:800;">You're invited! 🎉</div>
                      <div style="margin-top:12px;font-size:19px;line-height:1.5;opacity:0.95;">
                        Come join <strong>${escapedTeamName}</strong> on SageForce.
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:38px 40px 10px;text-align:center;">
                      <p style="margin:0 0 4px;font-size:19px;line-height:1.65;color:#173b63;">
                        Welcome aboard! Your onboarding workspace is ready and waiting —
                        it's where getting up to speed is actually kind of fun.
                      </p>
                      <div style="text-align:center;margin:30px 0 8px;">
                        <a href="${link}" style="display:inline-block;background:#1a7be0;color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;padding:18px 42px;border-radius:999px;box-shadow:0 6px 16px rgba(26,123,224,0.35);">
                          Accept Invite →
                        </a>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 40px 4px;">
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0 16px;">
                        <tr>
                          <td style="background:#f6f9ff;border:1px solid #dbe8ff;border-radius:16px;padding:20px 22px;">
                            <div style="font-size:18px;font-weight:700;color:#11365a;margin-bottom:10px;">🌱 New to SageForce?</div>
                            <ol style="margin:0;padding-left:20px;color:#244e74;font-size:16px;line-height:1.75;">
                              <li>Click <strong>Accept Invite</strong></li>
                              <li>Create your account or continue with Google</li>
                              <li>Finish setup and hop into your workspace</li>
                            </ol>
                          </td>
                        </tr>
                        <tr>
                          <td style="background:#f6f9ff;border:1px solid #dbe8ff;border-radius:16px;padding:20px 22px;">
                            <div style="font-size:18px;font-weight:700;color:#11365a;margin-bottom:10px;">👋 Already have an account?</div>
                            <ol style="margin:0;padding-left:20px;color:#244e74;font-size:16px;line-height:1.75;">
                              <li>Click <strong>Accept Invite</strong></li>
                              <li>Log in with your existing account</li>
                              <li>You'll land straight in your workspace</li>
                            </ol>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:10px 40px 16px;">
                      <div style="font-size:14px;line-height:1.6;color:#395f86;">
                        Button not working? Click here:
                      </div>
                      <a href="${link}" style="display:inline-block;color:#1a7be0;text-decoration:underline;font-size:14px;line-height:1.6;margin-top:4px;">Click here</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 40px 32px;border-top:1px solid #ebf2ff;font-size:13px;line-height:1.7;color:#6a86a5;">
                      ⏳ This invite expires in <strong>${inviteExpiryDaysLabel}</strong>, so grab it while it's fresh.<br />
                      No pressure — if you didn't expect this, you can safely ignore this email.
                    </td>
                  </tr>
                </table>
                <div style="max-width:720px;margin:18px auto 0;font-size:12px;line-height:1.5;color:#93a9c6;text-align:center;">
                  Sent with 🐼 by SageForce
                </div>
              </td>
            </tr>
          </table>
        </div>
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
    const updatedUser = await assignUserTeamAndRole({
      supabaseUserId: user.supabaseUserId,
      teamId,
      role: "new_hire",
    });

    // If the invite was sent for a specific quiz, record the assignment now so
    // the quiz shows up on the new hire's onboarding list. skipDuplicates makes
    // this a harmless no-op if they somehow already have it.
    if (invite.quizId) {
      await createQuizAssignments(invite.quizId, [updatedUser.id], invite.createdByUserId);
    }

    await markInviteUsed(invite.id);

    return res.json({ data: { teamId, role: "new_hire" } });
  } catch (error) {
    next(error);
  }
}
