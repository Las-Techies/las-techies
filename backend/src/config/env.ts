import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 4000),
  llmGatewayUrl: process.env.LLM_GATEWAY_URL ?? "",
  llmKey: process.env.ENG_AI_MODEL_GW_KEY ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // Bucket that holds the original bytes of uploaded documents, so the
  // learner-facing viewer can show the real file instead of extracted text.
  documentsStorageBucket: process.env.SUPABASE_DOCUMENTS_BUCKET ?? "documents",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  gmailUser: required("GMAIL_USER"),
  gmailAppPassword: required("GMAIL_APP_PASSWORD"),
  // Where the invite link should send the new hire to sign up.
  appUrl: process.env.APP_URL ?? "http://localhost:5173",
  // Optional: restrict invited emails to a single domain (e.g. salesforce.com).
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? "",
  // How long an invite link stays valid.
  inviteExpiryHours: Number(process.env.INVITE_EXPIRY_HOURS ?? 168), // 7 days
};
