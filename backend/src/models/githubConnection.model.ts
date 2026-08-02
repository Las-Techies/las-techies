import { prisma } from "../db/client";
import { decryptSecret, encryptSecret } from "../services/crypto";

// Persistence for a manager's personal GitHub OAuth connection. The access
// token is encrypted here on the way in and decrypted on the way out, so the
// rest of the app only ever handles plaintext tokens in memory and the DB only
// ever holds ciphertext.

// Creates or replaces the caller's connection (one row per user). Reconnecting
// — e.g. after a revoke or a scope change — overwrites the stored token.
export function upsertGithubConnection(input: {
  userId: number;
  accessToken: string;
  githubLogin?: string | null;
  scope?: string | null;
}) {
  const accessTokenEnc = encryptSecret(input.accessToken);
  return prisma.githubConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      accessTokenEnc,
      githubLogin: input.githubLogin ?? null,
      scope: input.scope ?? null,
    },
    update: {
      accessTokenEnc,
      githubLogin: input.githubLogin ?? null,
      scope: input.scope ?? null,
    },
  });
}

// Lightweight status for the UI: is this user connected, and as whom. Never
// returns the token itself.
export async function getGithubConnectionStatus(
  userId: number
): Promise<{ connected: boolean; githubLogin: string | null }> {
  const row = await prisma.githubConnection.findUnique({
    where: { userId },
    select: { githubLogin: true },
  });
  return {
    connected: Boolean(row),
    githubLogin: row?.githubLogin ?? null,
  };
}

// Decrypts and returns the caller's stored GitHub token, or null if they have
// no connection (or the stored ciphertext can't be decrypted — e.g. the enc key
// was rotated). A null here means "prompt the user to (re)connect."
export async function getGithubAccessToken(
  userId: number
): Promise<string | null> {
  const row = await prisma.githubConnection.findUnique({
    where: { userId },
    select: { accessTokenEnc: true },
  });
  if (!row) return null;
  try {
    return decryptSecret(row.accessTokenEnc);
  } catch {
    return null;
  }
}

// Removes the caller's connection (used when GitHub reports the token is no
// longer valid, so the next picker open cleanly re-prompts instead of retrying
// a dead token).
export function deleteGithubConnection(userId: number) {
  return prisma.githubConnection.deleteMany({ where: { userId } });
}
