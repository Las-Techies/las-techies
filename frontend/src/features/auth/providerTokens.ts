// Supabase hands us an OAuth provider's access token as
// `session.provider_token`, but only on the session minted by the OAuth
// exchange itself — auth-js's own docs say it emits the value "only once
// immediately after the user signs in". The moment the Supabase JWT
// auto-refreshes (~1h), `_saveSession` overwrites the stored session with the
// refresh response, which has no provider_token, and it's gone until the next
// OAuth exchange. That's why the Drive folder import used to fail with "sign
// out and sign in with Google again" — the token had evaporated, not the
// permission. GitHub's repo picker had the exact same bug, made worse because
// the primary login is Google: Supabase keeps only one provider_token slot, so
// after a Google login (or the next refresh) the slot never holds GitHub's
// token at all.
//
// So we snapshot the token ourselves the one time it's emitted (see
// captureProviderTokenFromSession, wired into onAuthStateChange in AuthContext)
// and read our own copy from then on. Attribution is driven by a marker set
// right before the redirect (markPendingOAuthProvider), since a Google sign-in
// and a GitHub identity link look identical in the session afterward.
//
// Storage notes:
// - localStorage, not sessionStorage: the token has to survive a page reload
//   and be visible in a second tab. Supabase already persists the whole
//   session — provider_token included — to localStorage under its own key, so
//   this doesn't expose anything to XSS that wasn't already exposed.
// - Keyed by Supabase user id, and load() refuses to return a token belonging
//   to anyone but the current user. localStorage outlives the tab, so without
//   this check one person's token could be handed to the next person to sign
//   in on a shared browser.
import type { Session } from "@supabase/supabase-js";

const GOOGLE_TOKEN_STORAGE_KEY = "sageforce_google_drive_access_token";
const GITHUB_TOKEN_STORAGE_KEY = "sageforce_github_access_token";
const PENDING_PROVIDER_KEY = "sageforce_pending_oauth_provider";

// Access tokens have a lifetime we can't read from the Session (there's no
// `provider_token_expires_at`), so we stamp our own capture time and retire the
// token slightly early rather than let a dead one through. Google tokens live
// ~1h. GitHub OAuth tokens don't expire on their own, but can be revoked and
// the snapshot can go stale across days — cap it so a long-abandoned token
// isn't trusted forever. Both are best-effort only: callers must still handle
// the provider rejecting the token (a 401), which is the authoritative signal.
const GOOGLE_ASSUMED_TTL_MS = 55 * 60 * 1000;
const GITHUB_ASSUMED_TTL_MS = 8 * 60 * 60 * 1000;

type PendingProvider = "google" | "github";

type StoredToken = {
  userId: string;
  token: string;
  capturedAt: number;
};

// Recorded immediately before we kick off an OAuth redirect. Supabase keeps
// exactly one provider_token slot, so when the user comes back a GitHub
// identity link looks identical to a Google sign-in — this marker is how we
// tell them apart instead of guessing from the session. sessionStorage is
// right here: the marker only needs to survive the redirect in this tab.
export function markPendingOAuthProvider(provider: PendingProvider): void {
  sessionStorage.setItem(PENDING_PROVIDER_KEY, provider);
}

function consumePendingOAuthProvider(): PendingProvider | null {
  const value = sessionStorage.getItem(PENDING_PROVIDER_KEY);
  if (value !== "google" && value !== "github") return null;
  sessionStorage.removeItem(PENDING_PROVIDER_KEY);
  return value;
}

function saveToken(storageKey: string, userId: string, token: string): void {
  const payload: StoredToken = { userId, token, capturedAt: Date.now() };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadToken(
  storageKey: string,
  userId: string | null | undefined,
  ttlMs: number
): string | null {
  if (!userId) return null;

  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  let stored: Partial<StoredToken> | null = null;
  try {
    stored = JSON.parse(raw) as Partial<StoredToken>;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }

  if (
    typeof stored?.token !== "string" ||
    typeof stored?.userId !== "string" ||
    typeof stored?.capturedAt !== "number"
  ) {
    localStorage.removeItem(storageKey);
    return null;
  }

  // Never hand one user's token to a different account.
  if (stored.userId !== userId) {
    localStorage.removeItem(storageKey);
    return null;
  }

  if (Date.now() - stored.capturedAt >= ttlMs) {
    localStorage.removeItem(storageKey);
    return null;
  }

  return stored.token;
}

export function saveGoogleDriveAccessToken(userId: string, token: string): void {
  saveToken(GOOGLE_TOKEN_STORAGE_KEY, userId, token);
}

export function loadGoogleDriveAccessToken(
  userId: string | null | undefined
): string | null {
  return loadToken(GOOGLE_TOKEN_STORAGE_KEY, userId, GOOGLE_ASSUMED_TTL_MS);
}

export function loadGithubAccessToken(
  userId: string | null | undefined
): string | null {
  return loadToken(GITHUB_TOKEN_STORAGE_KEY, userId, GITHUB_ASSUMED_TTL_MS);
}

// Wipe every provider token we've stashed. Called on sign-out (including
// sign-outs we didn't initiate) so no token outlives its session.
export function clearProviderAccessTokens(): void {
  localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
  localStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(PENDING_PROVIDER_KEY);
}

// Called for every auth state change. Captures the provider access token on the
// one session that carries it, routing it to the right provider's slot by the
// marker set before the redirect. Reading the marker exactly once here (not
// once per provider) is deliberate: two separate capture functions would race
// to consume the single marker, and whichever ran first would delete it before
// the other saw it. Captures nothing when there's no token or no marker, so a
// plain JWT refresh can never overwrite a good token with an empty one.
export function captureProviderTokenFromSession(session: Session | null): void {
  const token = session?.provider_token;
  const userId = session?.user?.id;
  if (!token || !userId) return;

  const provider = consumePendingOAuthProvider();
  if (provider === "google") {
    saveToken(GOOGLE_TOKEN_STORAGE_KEY, userId, token);
  } else if (provider === "github") {
    saveToken(GITHUB_TOKEN_STORAGE_KEY, userId, token);
  }
}
