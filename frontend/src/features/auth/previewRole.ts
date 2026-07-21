// Temporary "quick access" role override for local testing. Lets the login
// screen drop straight into either role's tabs without a full Supabase login.
// A real logged-in user's role (from user_metadata) always takes precedence.
import type { UserRole } from "../../context/AuthContext";

const PREVIEW_ROLE_KEY = "sageforce_preview_role";

export function getPreviewRole(): UserRole | null {
  const value = localStorage.getItem(PREVIEW_ROLE_KEY);
  return value === "manager" || value === "new_hire" ? value : null;
}

export function setPreviewRole(role: UserRole): void {
  localStorage.setItem(PREVIEW_ROLE_KEY, role);
}

export function clearPreviewRole(): void {
  localStorage.removeItem(PREVIEW_ROLE_KEY);
}
