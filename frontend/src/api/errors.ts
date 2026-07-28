/**
 * Error handling shared across the API layer and UI.
 *
 * Goal: every failed request should produce (a) a rich, greppable console
 * message with the status/method/path/raw body for whoever is debugging, and
 * (b) a friendly, actionable sentence a new hire can actually read in the UI.
 */

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server (network/CORS). */
  readonly status: number;
  readonly method: string;
  readonly path: string;
  /** The backend's raw `error.message`, before we humanize it for the UI. */
  readonly rawMessage: string;

  constructor(args: {
    status: number;
    method: string;
    path: string;
    rawMessage: string;
  }) {
    super(args.rawMessage);
    this.name = "ApiError";
    this.status = args.status;
    this.method = args.method;
    this.path = args.path;
    this.rawMessage = args.rawMessage;
  }
}

/**
 * Logs a failed request to the console with full context so it's obvious
 * what broke and where. Grouped so the (often noisy) details stay collapsed.
 */
export function logApiError(err: ApiError): void {
  const label =
    err.status === 0
      ? `🔌 API unreachable — ${err.method} ${err.path}`
      : `⚠️ API ${err.status} — ${err.method} ${err.path}`;

  // eslint-disable-next-line no-console
  console.groupCollapsed(`%c${label}`, "color:#ba0517;font-weight:600");
  // eslint-disable-next-line no-console
  console.error("Message:", err.rawMessage);
  // eslint-disable-next-line no-console
  console.error("Status: ", err.status || "(no response)");
  // eslint-disable-next-line no-console
  console.error("Request:", err.method, err.path);
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/**
 * What the UI should offer the user to recover:
 * - "signin" — the request failed because there's no valid session, so a
 *   retry can't succeed; send them to the login page instead.
 * - "retry"  — a transient failure (network blip, server hiccup) where
 *   re-running the same request is a reasonable next step.
 */
export type ErrorAction = "signin" | "retry";

export type FriendlyError = {
  /** Short headline for the UI, e.g. "You're signed out". */
  title: string;
  /** One-sentence explanation of what to do next. */
  detail: string;
  /** The underlying technical message, shown in smaller/muted text. */
  technical: string;
  /** The recovery action the UI should surface for this error. */
  action: ErrorAction;
};

/**
 * Turns any thrown value into a friendly headline + detail + the raw technical
 * message. Maps the auth/status cases we actually emit from the backend so the
 * UI can tell the user what's wrong instead of dumping "Missing auth token".
 */
export function describeError(err: unknown): FriendlyError {
  if (err instanceof ApiError) {
    // Network failure — request never got a response.
    if (err.status === 0) {
      return {
        title: "Can't reach the server",
        detail:
          "The app couldn't connect to the backend. Check your connection and try again.",
        technical: err.rawMessage,
        action: "retry",
      };
    }

    const raw = err.rawMessage.toLowerCase();

    if (err.status === 401) {
      if (raw.includes("missing auth token")) {
        return {
          title: "You're signed out",
          detail: "Your sign-in wasn't sent with this request. Please sign in again.",
          technical: err.rawMessage,
          action: "signin",
        };
      }
      return {
        title: "Your session expired",
        detail: "For your security you've been signed out. Please sign in again.",
        technical: err.rawMessage,
        action: "signin",
      };
    }

    if (err.status === 403) {
      return {
        title: "You don't have access",
        detail: "Your account isn't allowed to view this. Ask your manager if this looks wrong.",
        technical: err.rawMessage,
        action: "retry",
      };
    }

    if (err.status === 404) {
      return {
        title: "Not found",
        detail: "We couldn't find what you were looking for. It may have been removed.",
        technical: err.rawMessage,
        action: "retry",
      };
    }

    if (err.status >= 500) {
      return {
        title: "Something went wrong on our end",
        detail: "This is a problem with the server, not you. Please try again in a moment.",
        technical: err.rawMessage,
        action: "retry",
      };
    }

    return {
      title: "Something went wrong",
      detail: "The request didn't go through. Please try again.",
      technical: err.rawMessage,
      action: "retry",
    };
  }

  return {
    title: "Something went wrong",
    detail: "An unexpected error occurred. Please try again.",
    technical: err instanceof Error ? err.message : String(err),
    action: "retry",
  };
}
