import { env } from "../config/env";
import { signState, verifyStateSignature } from "./crypto";

// GitHub OAuth (Authorization Code) flow for connecting a manager's personal
// GitHub account, so the "Pick from GitHub" importer lists THEIR repos. This is
// a plain GitHub OAuth App flow (not Supabase) — Supabase's single
// provider_token slot can't hold a GitHub token when the login provider is
// Google, which is why repo listing needs its own dedicated connection.

// The scopes we request. `repo` grants read (and write, though we only read) to
// the user's public AND private repositories — matching the private+public
// choice, so managers can import from internal repos.
const GITHUB_SCOPE = "repo";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

// How long an issued `state` stays valid. Short — the user should complete the
// GitHub consent screen in well under this. Bounds the replay window.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isGithubOauthConfigured(): boolean {
  return Boolean(
    env.githubOauthClientId &&
      env.githubOauthClientSecret &&
      env.githubTokenEncKey
  );
}

// The redirect_uri sent to GitHub. Must byte-for-byte match the callback URL
// registered on the OAuth App, so it's derived from a single source (apiUrl).
function callbackUrl(): string {
  return `${env.apiUrl.replace(/\/$/, "")}/github/oauth/callback`;
}

// Builds a signed, time-boxed state string of the form
// `<base64url payload>.<hmac>`, binding the flow to a specific user id without
// any server-side session store. The callback re-verifies both the signature
// and the freshness before trusting the userId inside.
function buildState(userId: number, timestampMs: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, ts: timestampMs })
  ).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

// Reverses buildState. Returns the userId only if the signature matches and the
// state hasn't expired; otherwise null (treated as an invalid/forged callback).
export function verifyState(
  state: string,
  nowMs: number
): { userId: number } | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts as [string, string];
  if (!verifyStateSignature(payload, signature)) return null;

  let decoded: { userId?: number; ts?: number };
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof decoded.userId !== "number" || typeof decoded.ts !== "number") {
    return null;
  }
  if (nowMs - decoded.ts > STATE_TTL_MS || decoded.ts > nowMs) {
    return null;
  }
  return { userId: decoded.userId };
}

// The URL to send the user's browser to. `timestampMs` is passed in (not read
// from Date.now here) purely so the controller controls the clock.
export function buildAuthorizeUrl(userId: number, timestampMs: number): string {
  const params = new URLSearchParams({
    client_id: env.githubOauthClientId,
    redirect_uri: callbackUrl(),
    scope: GITHUB_SCOPE,
    state: buildState(userId, timestampMs),
    // Force the account picker so a manager on a shared machine can choose the
    // right GitHub account instead of silently reusing an existing session.
    allow_signup: "false",
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// Exchanges the `code` GitHub redirected back with for an access token, and
// looks up which GitHub account it belongs to (for display). Throws on any
// failure — the caller renders an error page.
export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  scope: string | null;
  githubLogin: string | null;
}> {
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: env.githubOauthClientId,
      client_secret: env.githubOauthClientSecret,
      code,
      redirect_uri: callbackUrl(),
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`GitHub token exchange failed (${tokenResponse.status}).`);
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (tokenPayload.error || !tokenPayload.access_token) {
    throw new Error(
      tokenPayload.error_description ||
        tokenPayload.error ||
        "GitHub did not return an access token."
    );
  }

  const accessToken = tokenPayload.access_token;
  const scope = tokenPayload.scope ?? null;

  // Best-effort identity lookup — a failure here shouldn't abort the connection
  // (the token is still valid); the login is only used for display.
  let githubLogin: string | null = null;
  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "las-techies-onboarding-quiz",
      },
    });
    if (userResponse.ok) {
      const userPayload = (await userResponse.json()) as { login?: string };
      githubLogin = userPayload.login ?? null;
    }
  } catch {
    // ignore — non-fatal
  }

  return { accessToken, scope, githubLogin };
}
