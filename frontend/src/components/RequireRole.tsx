import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getPreviewRole } from "../features/auth/previewRole";

type RequireRoleProps = {
  role: "manager" | "new_hire";
  children: ReactNode;
};

// Mirrors AppNav's effective-role logic so the guard and the nav never
// disagree about who counts as a manager. Managers land back on their
// upload flow, new hires on their home page, matching LoginPage's redirect.
function RequireRole({ role, children }: RequireRoleProps) {
  const { user } = useAuth();
  const effectiveRole =
    (user?.user_metadata?.role as string | undefined) ?? getPreviewRole() ?? "new_hire";

  if (effectiveRole !== role) {
    return <Navigate to={effectiveRole === "manager" ? "/upload-content" : "/home"} replace />;
  }

  return <>{children}</>;
}

export default RequireRole;
