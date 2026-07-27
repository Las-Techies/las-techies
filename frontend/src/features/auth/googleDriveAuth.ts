// Asks Google directly for a Drive access token, instead of piggybacking on
// Supabase's `session.provider_token`.
//
// Why: a login session and a Drive authorization have completely different
// lifetimes. Supabase hands out provider_token exactly once (at the OAuth
// exchange) and drops it on the next JWT refresh, keeps only one slot for it
// (so linking GitHub clobbers Google's), and refreshing it means re-running
// signInWithOAuth — which mints a whole new session/JWT and is what previously
// reset managers to the demo team. All of that is incidental damage from
// coupling the two.
//
// Google Identity Services' token client decouples them: it returns a fresh
// access token in a popup, scoped to Drive only, without touching the Supabase
// session at all. Nothing is stored — the token is requested at the moment of
// use and thrown away — so there's no expiry to track and no credential
// sitting in localStorage.
//
// Setup: VITE_GOOGLE_CLIENT_ID must be the Google Cloud OAuth *web* client id
// (the same one Supabase's Google provider uses is fine), and your app origin
// must be listed under "Authorized JavaScript origins" on that client. Client
// ids are public — no secret belongs in the frontend.

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

type TokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type TokenClient = {
  requestAccessToken: () => void;
};

type TokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
        };
      };
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Could not load Google sign-in.")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Could not load Google sign-in.")),
      { once: true }
    );
    document.head.appendChild(script);
  });

  // Never leave a rejected promise cached: one offline moment would otherwise
  // poison every later attempt for the lifetime of the page.
  scriptPromise.catch(() => {
    scriptPromise = null;
  });

  return scriptPromise;
}

export function isGoogleDriveAuthConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

// Warm the script up on page load so that by the time the user clicks Import,
// requestAccessToken runs immediately after their gesture. Awaiting a network
// fetch first is what gets popups blocked. Safe to call when unconfigured.
export function preloadGoogleDriveAuth(): void {
  if (!isGoogleDriveAuthConfigured()) return;
  void loadGisScript().catch(() => {
    // Ignore — requestGoogleDriveAccessToken retries and reports properly.
  });
}

// Opens Google's consent/account-chooser popup and resolves with a fresh Drive
// access token. Must be called from a user gesture (a click) or the browser
// will block the popup.
export async function requestGoogleDriveAccessToken(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Google Drive import isn't configured. Set VITE_GOOGLE_CLIENT_ID in frontend/.env."
    );
  }

  await loadGisScript();

  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error("Could not load Google sign-in. Check your connection and retry.");
  }

  return new Promise<string>((resolve, reject) => {
    // A fresh client per request, so a stale callback from an earlier attempt
    // can never resolve this one.
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(
            new Error(
              response.error_description ??
                "Google denied access to Drive. Please try again."
            )
          );
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google did not return a Drive access token."));
          return;
        }
        resolve(response.access_token);
      },
      // Without this, closing or blocking the popup leaves the promise
      // pending forever and the import spinner never stops.
      error_callback: (error) => {
        if (error?.type === "popup_closed") {
          reject(new Error("Google access was cancelled."));
          return;
        }
        if (error?.type === "popup_failed_to_open") {
          reject(
            new Error(
              "Your browser blocked the Google popup. Allow popups for this site and retry."
            )
          );
          return;
        }
        reject(new Error(error?.message ?? "Could not reach Google to authorize Drive."));
      },
    });

    client.requestAccessToken();
  });
}
