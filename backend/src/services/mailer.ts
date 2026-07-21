import nodemailer from "nodemailer";
import { env } from "../config/env";

// Created once at module load and reused for every send — nodemailer pools
// connections internally, so there's no need to rebuild this per request.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // STARTTLS on 587
  auth: {
    user: env.gmailUser,
    pass: env.gmailAppPassword,
  },
});

export type SendMailOptions = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
};

/**
 * Send an email from the app's Gmail account.
 * Returns the provider message id on success; throws on failure.
 */
export async function sendMail(options: SendMailOptions): Promise<string> {
  const info = await transporter.sendMail({
    from: `"SageForce" <${env.gmailUser}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo: options.replyTo,
  });
  return info.messageId;
}
