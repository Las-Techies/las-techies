import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? "http://localhost:5173",

  // Local defaults (Salesforce gateway path used during localhost development).
  llmGatewayUrl: process.env.LLM_GATEWAY_URL ?? "",
  llmKey: process.env.ENG_AI_MODEL_GW_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "claude-sonnet-4-5-20250929",

  // Deployed defaults (OpenRouter path used outside localhost).
  openRouterGatewayUrl:
    process.env.OPENROUTER_GATEWAY_URL ??
    "https://openrouter.ai/api/v1/chat/completions",
  openRouterKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
  llmAppName: process.env.LLM_APP_NAME ?? "SageForce",

  // Resolve provider automatically:
  // - localhost app URL => Salesforce gateway values
  // - non-localhost app URL => OpenRouter values
  get useOpenRouter(): boolean {
    return !this.appUrl.includes("localhost");
  },
  get resolvedLlmGatewayUrl(): string {
    return this.useOpenRouter ? this.openRouterGatewayUrl : this.llmGatewayUrl;
  },
  get resolvedLlmKey(): string {
    return this.useOpenRouter ? this.openRouterKey : this.llmKey;
  },
  get resolvedLlmModel(): string {
    return this.useOpenRouter ? this.openRouterModel : this.llmModel;
  },

  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  // Bucket that holds the original bytes of uploaded documents, so the
  // learner-facing viewer can show the real file instead of extracted text.
  documentsStorageBucket: process.env.SUPABASE_DOCUMENTS_BUCKET ?? "documents",
  githubToken: process.env.GITHUB_TOKEN ?? "",
  gmailUser: required("GMAIL_USER"),
  gmailAppPassword: required("GMAIL_APP_PASSWORD"),
  // Optional: restrict invited emails to a single domain (e.g. salesforce.com).
  allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN ?? "",
  // How long an invite link stays valid.
  inviteExpiryHours: Number(process.env.INVITE_EXPIRY_HOURS ?? 168), // 7 days
};
