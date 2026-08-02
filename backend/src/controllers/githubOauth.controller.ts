import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  isGithubOauthConfigured,
  verifyState,
} from "../services/githubOauth";
import {
  getGithubConnectionStatus,
  upsertGithubConnection,
} from "../models/githubConnection.model";

type AuthUser = { id: number; teamId: number };

// GET /api/documents/github/oauth/start (authed)
// Returns the GitHub authorize URL for the signed-in manager to open in a
// popup. The URL carries a signed state binding the flow to this user, so the
// unauthenticated callback can trust who it's for.
export async function githubOauthStartHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    if (!isGithubOauthConfigured()) {
      return res.status(503).json({
        error: {
          message:
            "GitHub connection is not configured on the server. Set GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, and GITHUB_TOKEN_ENC_KEY.",
        },
      });
    }

    const url = buildAuthorizeUrl(user.id, Date.now());
    return res.json({ data: { url } });
  } catch (error) {
    next(error);
  }
}

// GET /api/documents/github/connection (authed)
// Whether the signed-in manager has a working GitHub connection, and as whom.
export async function githubConnectionStatusHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = (req as any).user as AuthUser | undefined;
    if (!user?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }
    const status = await getGithubConnectionStatus(user.id);
    return res.json({ data: status });
  } catch (error) {
    next(error);
  }
}

// Minimal HTML page rendered into the OAuth popup. It posts the result back to
// the opener (the upload page) and closes itself. The opener verifies
// event.origin, so we can safely postMessage to our own frontend origin.
function renderCallbackPage(result: {
  ok: boolean;
  message?: string;
}): string {
  // env.appUrl is the trusted frontend origin (not user input), so it's a safe
  // targetOrigin for postMessage. JSON.stringify guards against breaking out of
  // the script string.
  const payload = JSON.stringify({
    source: "github-oauth",
    ok: result.ok,
    message: result.message ?? null,
  });
  const targetOrigin = JSON.stringify(env.appUrl);
  const heading = result.ok ? "GitHub connected" : "GitHub connection failed";
  const detail = result.ok
    ? "You can close this window and return to SageForce."
    : result.message ?? "Something went wrong. Please try again.";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>${heading}</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; text-align: center;">
    <h2>${heading}</h2>
    <p>${detail}</p>
    <script>
      (function () {
        try {
          if (window.opener) {
            window.opener.postMessage(${payload}, ${targetOrigin});
          }
        } catch (e) {}
        setTimeout(function () { window.close(); }, 800);
      })();
    </script>
  </body>
</html>`;
}

// GET /github/oauth/callback  (NOT under /api — GitHub redirects the browser
// here with no JWT, so it must be registered ahead of requireAuth). Verifies
// the state, exchanges the code, stores the encrypted token for the user the
// state names, and returns the popup-closing HTML.
export async function githubOauthCallbackHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const oauthError =
      typeof req.query.error === "string" ? req.query.error : "";

    if (oauthError) {
      return res
        .status(400)
        .send(renderCallbackPage({ ok: false, message: "Authorization was denied." }));
    }
    if (!code || !state) {
      return res
        .status(400)
        .send(renderCallbackPage({ ok: false, message: "Missing code or state." }));
    }

    const verified = verifyState(state, Date.now());
    if (!verified) {
      return res.status(400).send(
        renderCallbackPage({
          ok: false,
          message: "This connection link is invalid or has expired.",
        })
      );
    }

    const { accessToken, scope, githubLogin } = await exchangeCodeForToken(code);
    await upsertGithubConnection({
      userId: verified.userId,
      accessToken,
      githubLogin,
      scope,
    });

    return res.status(200).send(renderCallbackPage({ ok: true }));
  } catch (error) {
    // Render a friendly popup page rather than the JSON error handler, since
    // this response is shown directly in the user's popup window.
    const message =
      error instanceof Error ? error.message : "Failed to connect GitHub.";
    if (!res.headersSent) {
      return res.status(500).send(renderCallbackPage({ ok: false, message }));
    }
    next(error);
  }
}
