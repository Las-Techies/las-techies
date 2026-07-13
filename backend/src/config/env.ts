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
};
