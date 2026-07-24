// Supabase's session only ever holds one `provider_token` at a time — it's
// overwritten by whichever OAuth exchange most recently completed. This app
// signs in with Google first, then may later "Connect GitHub" from the
// Upload page, which silently replaces the Google access token on the
// session with a GitHub one. Anything that still needs to call the Google
// Drive API after that point (the Drive folder import) would otherwise send
// GitHub's token to Google and get a 401.
//
// To avoid that, we snapshot the Google token into sessionStorage the moment
// we can still be sure it's actually a Google token — i.e. before a GitHub
// identity has been linked in this session — and prefer that stashed copy
// over whatever's currently on the live session. sessionStorage (not
// localStorage) is used since this only needs to survive page reloads
// within the same tab/session, not longer than that.
const GOOGLE_DRIVE_TOKEN_STORAGE_KEY = "sageforce_google_drive_access_token";

export function saveGoogleDriveAccessToken(token: string): void {
  sessionStorage.setItem(GOOGLE_DRIVE_TOKEN_STORAGE_KEY, token);
}

export function loadGoogleDriveAccessToken(): string | null {
  return sessionStorage.getItem(GOOGLE_DRIVE_TOKEN_STORAGE_KEY);
}

export function clearGoogleDriveAccessToken(): void {
  sessionStorage.removeItem(GOOGLE_DRIVE_TOKEN_STORAGE_KEY);
}
