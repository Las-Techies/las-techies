import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import mascotLogo from "../assets/sageforce-mascot-transparent.png";
import { useAuth } from "../context/AuthContext";
import { setPreviewRole } from "../features/auth/previewRole";
import type { UserRole } from "../context/AuthContext";
import { apiFetch } from "../api/client";
import { supabase } from "../lib/supabaseClient";

type Mode = "login" | "signup";

function routeForRole(role: string | undefined): string {
  return role === "manager" ? "/upload-content" : "/home";
}

function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<"" | "new_hire" | "manager">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const {
    session,
    loading,
    signIn,
    signUp,
    resetPassword,
    signInWithGoogle,
    setRole: updateRole,
  } = useAuth();

  // Google accounts have no concept of "manager" vs "new hire", so a
  // first-time Google sign-in lands here with a session but no role yet.
  const needsRoleSetup = Boolean(
    !loading && session && !session.user.user_metadata?.role
  );

  // Already logged in with a role set (e.g. came back to "/" with a valid
  // session) — skip the form entirely instead of asking them to log in again.
  useEffect(() => {
    if (!loading && session && session.user.user_metadata?.role) {
      navigate(routeForRole(session.user.user_metadata.role), { replace: true });
    }
  }, [loading, session, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setInfoMessage("");
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email above first, then click 'Forgot password?'.");
      return;
    }

    setError("");
    setInfoMessage("");
    setIsSendingReset(true);
    try {
      await resetPassword(email.trim());
      setInfoMessage(
        "If an account exists for that email, a password reset link is on its way."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to send reset email. Please try again."
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setError("");
    setInfoMessage("");
    setSubmitting(true);
    try {
      const result = await signIn(email.trim(), password);
      if (!result) {
        setError("Unable to log in. Please try again.");
        return;
      }
      navigate(routeForRole(result.user.user_metadata?.role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password.trim() ||
      role === ""
    ) {
      setError(
        "Please fill out your name, email, password, and role before creating an account."
      );
      return;
    }

    if (role === "manager" && !teamName.trim()) {
      setError("Please name the team you'll be managing.");
      return;
    }

    setError("");
    setInfoMessage("");
    setSubmitting(true);
    try {
      const result = await signUp(
        email.trim(),
        password,
        role,
        firstName.trim(),
        lastName.trim()
      );
      if (!result) {
        setError(
          "Account created. Please confirm your email, then log in."
        );
        switchMode("login");
        return;
      }

      // A manager names their team at signup. Create it now — the backend
      // assigns the manager to the new team and updates their Supabase
      // metadata, so we refresh the session to pull the new team_id into the
      // JWT before any team-scoped requests run.
      if (role === "manager") {
        await apiFetch("/api/teams", {
          method: "POST",
          body: JSON.stringify({ name: teamName.trim() }),
        });
        await supabase.auth.refreshSession();
      }

      navigate(routeForRole(role));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to create your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (mode === "login") {
      handleLogin();
    } else {
      handleSignup();
    }
  };

  // Temporary shortcut: jump straight into either role's tabs without a full
  // login. Remove before shipping — it's only for exploring the app locally.
  const enterAs = (nextRole: UserRole) => {
    setPreviewRole(nextRole);
    navigate(routeForRole(nextRole));
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setInfoMessage("");
    setIsGoogleLoading(true);
    try {
      // This redirects the whole page to Google; if it resolves without
      // navigating away, something's misconfigured (bad client id/secret).
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to start Google sign-in. Please try again."
      );
      setIsGoogleLoading(false);
    }
  };

  const handleCompleteProfile = async () => {
    if (role === "") {
      setError("Please select a role to finish setting up your account.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await updateRole(role);
      navigate(routeForRole(role));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save your role. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (needsRoleSetup) {
    return (
      <main className="login-page">
        <section className="login-left">
          <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
        </section>

        <section className="login-card">
          <h2>Almost there</h2>
          <p className="role-setup-intro">
            Welcome, {session?.user.user_metadata?.full_name ?? session?.user.email}! Pick your
            role to finish setting up your account.
          </p>

          <label>Role</label>
          <div className="role-switch">
            <button
              type="button"
              className={role === "new_hire" ? "selected role-option" : "role-option"}
              onClick={() => setRole("new_hire")}
            >
              New Hire
            </button>
            <button
              type="button"
              className={role === "manager" ? "selected role-option" : "role-option"}
              onClick={() => setRole("manager")}
            >
              Manager
            </button>
          </div>

          <div className="login-actions">
            <button
              className="primary-btn btn-link"
              type="button"
              onClick={handleCompleteProfile}
              disabled={submitting}
            >
              {submitting ? "Saving…" : "Continue"}
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="login-page">
      <section className="login-left">
        <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
      </section>

      <section className="login-card">
        <h2>{mode === "login" ? "Welcome back" : "Welcome to SageForce"}</h2>

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
          <input
            type="email"
            placeholder="you@salesforce.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
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

        {mode === "login" ? (
          <button
            type="button"
            className="forgot-password-link"
            onClick={handleForgotPassword}
            disabled={isSendingReset}
          >
            {isSendingReset ? "Sending…" : "Forgot password?"}
          </button>
        ) : null}

        {mode === "signup" ? (
          <>
            <label>Role</label>
            <div className="role-switch">
              <button
                type="button"
                className={role === "new_hire" ? "selected role-option" : "role-option"}
                onClick={() => setRole("new_hire")}
              >
                New Hire
              </button>
              <button
                type="button"
                className={role === "manager" ? "selected role-option" : "role-option"}
                onClick={() => setRole("manager")}
              >
                Manager
              </button>
            </div>

            {role === "manager" ? (
              <label>
                Create your team
                <input
                  type="text"
                  placeholder="e.g. Frontline Ops Team"
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                />
              </label>
            ) : null}
          </>
        ) : null}

        <div className="login-actions">
          <a
            className="help-link"
            href="#"
            onClick={(event) => {
              event.preventDefault();
              switchMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Log in"}
          </a>
          <button
            className="primary-btn btn-link"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting
              ? mode === "login"
                ? "Logging in…"
                : "Creating account…"
              : mode === "login"
                ? "Log in"
                : "Create account"}
          </button>
        </div>

        <div className="oauth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
        >
          {isGoogleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        {error ? <p className="form-error">{error}</p> : null}
        {infoMessage ? <p className="form-info">{infoMessage}</p> : null}

        <div className="dev-access">
          <span className="dev-access-label">Quick access · for testing</span>
          <div className="dev-access-btns">
            <button
              type="button"
              className="dev-access-btn"
              onClick={() => enterAs("new_hire")}
            >
              Enter as New Hire
            </button>
            <button
              type="button"
              className="dev-access-btn"
              onClick={() => enterAs("manager")}
            >
              Enter as Manager
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
