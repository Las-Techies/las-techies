// Temporary "quick access" role override for local testing. Lets the login
// screen drop straight into either role's tabs without a full Supabase login.
// A real logged-in user's role (from user_metadata) always takes precedence.
import type { UserRole } from "../../context/AuthContext";

const PREVIEW_ROLE_KEY = "sageforce_preview_role";

function isLocalPreviewAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function getPreviewRole(): UserRole | null {
  if (!isLocalPreviewAllowed()) return null;
  const value = localStorage.getItem(PREVIEW_ROLE_KEY);
  return value === "manager" || value === "new_hire" ? value : null;
}

export function setPreviewRole(role: UserRole): void {
  if (!isLocalPreviewAllowed()) return;
  localStorage.setItem(PREVIEW_ROLE_KEY, role);
}

export function clearPreviewRole(): void {
  localStorage.removeItem(PREVIEW_ROLE_KEY);
}
