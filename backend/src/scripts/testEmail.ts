import "dotenv/config";
import nodemailer from "nodemailer";

/**
 * One-off SMTP smoke test. Run with:
 *   npx tsx src/scripts/testEmail.ts
 * Sends an email from your Gmail account to yourself.
 */
async function main() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // STARTTLS on 587
    auth: { user, pass },
  });

  // Fails fast with a clear error if auth/connection is wrong.
  await transporter.verify();
  console.log("SMTP connection + auth OK");

  const info = await transporter.sendMail({
    from: `"SMTP Test" <${user}>`,
    to: user, // send to yourself
    subject: "SMTP test ✔",
    text: "If you're reading this, Gmail SMTP works.",
  });

  console.log("Sent:", info.messageId);
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
