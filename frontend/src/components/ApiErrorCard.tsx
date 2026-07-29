import { useNavigate } from "react-router-dom";
import type { FriendlyError } from "../api/errors";

type ApiErrorCardProps = {
  /** The humanized error from describeError(). */
  error: FriendlyError;
  /**
   * Re-run the failed request. Required for "retry" errors; ignored for
   * "signin" errors (those route to the login page instead).
   */
  onRetry?: () => void;
};

/**
 * Shared error card for failed API/data loads. Shows a friendly title + detail
 * plus the raw technical message, and surfaces the right recovery action:
 * "Sign in" for auth errors (a retry can't succeed without a session) or
 * "Try again" for transient failures.
 */
function ApiErrorCard({ error, onRetry }: ApiErrorCardProps) {
  const navigate = useNavigate();

  return (
    <div className="sf-error" role="alert">
      <span className="sf-error-icon" aria-hidden>
        !
      </span>
      <div className="sf-error-body">
        <strong className="sf-error-title">{error.title}</strong>
        <p className="sf-error-detail">{error.detail}</p>
        <p className="sf-error-technical">{error.technical}</p>
        {error.action === "signin" ? (
          <button type="button" className="sf-btn sf-btn-sm" onClick={() => navigate("/login")}>
            Sign in
          </button>
        ) : (
          <button type="button" className="sf-btn sf-btn-sm" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export default ApiErrorCard;
