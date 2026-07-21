import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import mascotLogo from "../assets/sageforce-mascot-transparent.png";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api/client";
import { supabase } from "../lib/supabaseClient";

type InvitePreview = { email: string; teamName: string | null };
type Mode = "signup" | "login";

/**
 * Landing page for an invite link (/signup?invite=<token>).
 *
 * 1. Validates the token against the backend and shows which team the new hire
 *    is joining.
 * 2. Lets them create a Supabase account (email is pre-filled + locked to the
 *    invited address).
 * 3. Calls POST /api/invites/:token/accept, which assigns them to the manager's
 *    team as a new_hire server-side.
 * 4. Sends them to the new-hire UI.
 */
function InviteSignupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("invite") ?? "";
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState("");

  const [mode, setMode] = useState<Mode>("signup");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setPreviewError("This invite link is missing its token.");
      setLoadingPreview(false);
      return;
    }
    apiFetch<{ data: InvitePreview }>(`/api/invites/${token}`)
      .then((res) => setPreview(res.data))
      .catch((err) =>
        setPreviewError(
          err instanceof Error ? err.message : "This invite link is invalid or has expired."
        )
      )
      .finally(() => setLoadingPreview(false));
  }, [token]);

  // Shared final step: call accept (assigns team + new_hire role server-side),
  // refresh the session so the new team_id is in the JWT, then enter the app.
  const acceptAndEnter = async () => {
    await apiFetch(`/api/invites/${token}/accept`, { method: "POST" });
    await supabase.auth.refreshSession();
    navigate("/home", { replace: true });
  };

  const handleSignup = async () => {
    if (!preview) return;
    if (!firstName.trim() || !lastName.trim() || !password.trim()) {
      setError("Please fill out your name and a password.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      // Create the account as a new_hire. The invited email is authoritative.
      const session = await signUp(
        preview.email,
        password,
        "new_hire",
        firstName.trim(),
        lastName.trim()
      );

      // If email confirmation is required, signUp returns no session. Try to
      // sign in immediately so we can call accept with a valid token; if that
      // fails, the account still exists and they can accept after confirming.
      if (!session) {
        const signedIn = await signIn(preview.email, password).catch(() => null);
        if (!signedIn) {
          setError(
            'Account created. Please confirm your email, then open this invite link again and use "Log in to accept" to finish joining your team.'
          );
          setSubmitting(false);
          return;
        }
      }

      await acceptAndEnter();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to finish signing up. Please try again."
      );
      setSubmitting(false);
    }
  };

  // For someone who already has a SageForce account (clicked the link twice, or
  // is being moved onto a new team): log them in, then accept the invite.
  const handleLoginAndAccept = async () => {
    if (!preview) return;
    if (!password.trim()) {
      setError("Please enter your password.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const signedIn = await signIn(preview.email, password).catch(() => null);
      if (!signedIn) {
        setError("Incorrect password for this email. Please try again.");
        setSubmitting(false);
        return;
      }
      await acceptAndEnter();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to accept the invite. Please try again."
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-left">
        <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
      </section>

      <section className="login-card">
        {loadingPreview ? (
          <p>Checking your invite…</p>
        ) : previewError ? (
          <>
            <h2>Invite unavailable</h2>
            <p className="form-error">{previewError}</p>
            <a className="help-link" href="/">
              Go to login
            </a>
          </>
        ) : (
          <>
            <h2>Join {preview?.teamName ?? "your team"}</h2>
            <p className="role-setup-intro">
              {mode === "signup"
                ? "You've been invited to take your onboarding quiz. Create your account to get started."
                : "Log in to your existing account to join this team."}
            </p>

            {mode === "signup" ? (
              <div className="name-row">
                <label>
                  First Name
                  <input
                    type="text"
                    placeholder="Frida"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                  />
                </label>
                <label>
                  Last Name
                  <input
                    type="text"
                    placeholder="Arriaga"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <label>
              Work Email
              <input type="email" value={preview?.email ?? ""} disabled readOnly />
            </label>

            <label>
              Password
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <div className="login-actions">
              <a
                className="help-link"
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  setError("");
                  setMode(mode === "signup" ? "login" : "signup");
                }}
              >
                {mode === "signup"
                  ? "Already have an account? Log in to accept"
                  : "Need an account? Sign up instead"}
              </a>
              <button
                className="primary-btn btn-link"
                type="button"
                onClick={mode === "signup" ? handleSignup : handleLoginAndAccept}
                disabled={submitting}
              >
                {submitting
                  ? "Joining…"
                  : mode === "signup"
                    ? "Create account & join"
                    : "Log in & join"}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </>
        )}
      </section>
    </main>
  );
}

export default InviteSignupPage;
