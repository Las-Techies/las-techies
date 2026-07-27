// Supabase hands us Google's OAuth access token as `session.provider_token`,
// but only on the session minted by the OAuth exchange itself — auth-js's own
// docs say it emits the value "only once immediately after the user signs in".
// The moment the Supabase JWT auto-refreshes (~1h), `_saveSession` overwrites
// the stored session with the refresh response, which has no provider_token,
// and it's gone until the next OAuth exchange. That's why the Drive folder
// import used to fail with "sign out and sign in with Google again" — the
// token had evaporated, not the permission.
//
// So we snapshot it ourselves the one time it's emitted (see
// captureGoogleProviderTokenFromSession, wired into onAuthStateChange in
// AuthContext) and read our own copy from then on.
//
// Storage notes:
// - localStorage, not sessionStorage: the token has to survive a page reload
//   and be visible in a second tab. Supabase already persists the whole
//   session — provider_token included — to localStorage under its own key, so
//   this doesn't expose anything to XSS that wasn't already exposed.
// - Keyed by Supabase user id, and load() refuses to return a token belonging
//   to anyone but the current user. localStorage outlives the tab, so without
//   this check one person's Drive token could be handed to the next person to
//   sign in on a shared browser.
import type { Session } from "@supabase/supabase-js";

const TOKEN_STORAGE_KEY = "sageforce_google_drive_access_token";
const PENDING_PROVIDER_KEY = "sageforce_pending_oauth_provider";

// Google access tokens live ~1 hour and Supabase gives us no expiry metadata
// for provider_token (there is no `provider_token_expires_at` on Session), so
// we stamp our own capture time and retire the token slightly early rather
// than let a dead one through. This is best-effort only — callers must still
// handle Google rejecting the token, which is what needsGoogleReconsent does.
const ASSUMED_TTL_MS = 55 * 60 * 1000;

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

export function saveGoogleDriveAccessToken(userId: string, token: string): void {
  const payload: StoredToken = { userId, token, capturedAt: Date.now() };
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(payload));
}

export function loadGoogleDriveAccessToken(
  userId: string | null | undefined
): string | null {
  if (!userId) return null;

  const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!raw) return null;

  let stored: Partial<StoredToken> | null = null;
  try {
    stored = JSON.parse(raw) as Partial<StoredToken>;
  } catch {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }

  if (
    typeof stored?.token !== "string" ||
    typeof stored?.userId !== "string" ||
    typeof stored?.capturedAt !== "number"
  ) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }

  // Never hand one user's Drive token to a different account.
  if (stored.userId !== userId) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }

  if (Date.now() - stored.capturedAt >= ASSUMED_TTL_MS) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }

  return stored.token;
}

export function clearGoogleDriveAccessToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(PENDING_PROVIDER_KEY);
}

// Called for every auth state change. Captures the Google access token on the
// one session that carries it, and deliberately captures nothing otherwise:
// attribution is driven purely by the marker set before the redirect, so a
// GitHub identity link can never overwrite a good Google token (which is what
// the old "only snapshot if GitHub isn't linked yet" heuristic got wrong — it
// meant GitHub-connected users could never refresh their Google token at all).
export function captureGoogleProviderTokenFromSession(
  session: Session | null
): void {
  const token = session?.provider_token;
  const userId = session?.user?.id;
  if (!token || !userId) return;

  if (consumePendingOAuthProvider() !== "google") return;

  saveGoogleDriveAccessToken(userId, token);
}
