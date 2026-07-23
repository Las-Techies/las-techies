import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import mascotLogo from "../assets/panda-login.png";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api/client";
import { supabase } from "../lib/supabaseClient";
import {
  ChevronRight,
  EyeIcon,
  EyeOffIcon,
  GoogleIcon,
  LockIcon,
  MailIcon,
  PeopleIcon,
  PersonIcon,
  StarSpark,
} from "../components/icons";

type Mode = "login" | "signup";

function routeForRole(role: string | undefined): string {
  return role === "manager" ? "/upload-content" : "/home";
}

function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<"" | "new_hire" | "manager">("new_hire");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
  //
  // Suppressed while `submitting`: completing a Google manager's profile sets
  // their role (which lands here mid-flight) *before* their team is created and
  // the session refreshed. Navigating away early would fire team-scoped
  // requests with a JWT that still has no team_id, and the backend would sync
  // the DB row back to the default team. We let handleCompleteProfile navigate
  // itself once the new team_id is in the refreshed JWT.
  useEffect(() => {
    if (!submitting && !loading && session && session.user.user_metadata?.role) {
      navigate(routeForRole(session.user.user_metadata.role), { replace: true });
    }
  }, [submitting, loading, session, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setInfoMessage("");
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email above first, then click 'Need help signing in?'.");
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
        setError("Account created. Please confirm your email, then log in.");
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

    if (role === "manager" && !teamName.trim()) {
      setError("Please name the team you'll be managing.");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      await updateRole(role);

      // Like the email/password signup, a Google manager names their team as
      // they finish setup. Create it now so the backend assigns them to their
      // own team (and updates Supabase metadata) instead of defaulting to team
      // 1; refresh the session so the new team_id lands in the JWT before any
      // team-scoped requests run.
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
        err instanceof Error ? err.message : "Unable to save your role. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const brandArt = (
    <section className="login-left">
      <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
      <div className="login-brand">
        <span className="login-wordmark">
          <StarSpark aria-hidden />
          SageForce
        </span>
        <p className="login-tagline">AI-powered onboarding platform</p>
      </div>
    </section>
  );

  const roleToggle = (
    <div className="field">
      <span className="field-label">I'm signing in as</span>
      <div className="seg">
        <button
          type="button"
          className={role === "new_hire" ? "seg-opt active" : "seg-opt"}
          onClick={() => setRole("new_hire")}
        >
          <PersonIcon aria-hidden /> New Hire
        </button>
        <button
          type="button"
          className={role === "manager" ? "seg-opt active" : "seg-opt"}
          onClick={() => setRole("manager")}
        >
          <PeopleIcon aria-hidden /> Manager
        </button>
      </div>
    </div>
  );

  if (needsRoleSetup) {
    return (
      <main className="login-page">
        {brandArt}
        <section className="login-card">
          <h2>Almost there</h2>
          <p className="login-sub">
            Welcome, {session?.user.user_metadata?.full_name ?? session?.user.email}! Pick your
            role to finish setting up your account.
          </p>

          {roleToggle}

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
      {brandArt}

      <section className="login-card">
        <h2>{mode === "login" ? "Welcome back" : "Create your account"}</h2>
        <p className="login-sub">
          {mode === "login"
            ? "Sign in to continue to SageForce."
            : "Join SageForce to get started."}
        </p>

        {mode === "signup" ? (
          <div className="name-row">
            <div className="field">
              <span className="field-label">First name</span>
              <div className="input-wrap">
                <input
                  type="text"
                  placeholder="Frida"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  style={{ paddingLeft: 14 }}
                />
              </div>
            </div>
            <div className="field">
              <span className="field-label">Last name</span>
              <div className="input-wrap">
                <input
                  type="text"
                  placeholder="Arriaga"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  style={{ paddingLeft: 14 }}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="field">
          <span className="field-label">Work Email</span>
          <div className="input-wrap">
            <MailIcon className="input-icon" aria-hidden />
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">Password</span>
          <div className="input-wrap has-toggle">
            <LockIcon className="input-icon" aria-hidden />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
            </button>
          </div>
        </div>

        {mode === "signup" ? roleToggle : null}

        {mode === "signup" && role === "manager" ? (
          <div className="field">
            <span className="field-label">Create your team</span>
            <div className="input-wrap">
              <PeopleIcon className="input-icon" aria-hidden />
              <input
                type="text"
                placeholder="e.g. Frontline Ops Team"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        <button
          className="sf-btn sf-btn-block login-continue"
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? mode === "login"
              ? "Signing in…"
              : "Creating account…"
            : mode === "login"
              ? "Continue"
              : "Create account"}
          <ChevronRight className="btn-arrow" aria-hidden />
        </button>

        <div className="oauth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="google-btn"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
        >
          <GoogleIcon aria-hidden />
          {isGoogleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        {mode === "login" ? (
          <button
            type="button"
            className="help-signin"
            onClick={handleForgotPassword}
            disabled={isSendingReset}
          >
            {isSendingReset ? "Sending…" : "Need help signing in?"}
          </button>
        ) : null}

        <button
          type="button"
          className="help-signin"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login"
            ? "New here? Create an account"
            : "Already have an account? Log in"}
        </button>

        {error ? <p className="form-error">{error}</p> : null}
        {infoMessage ? <p className="form-info">{infoMessage}</p> : null}
      </section>

      <button
        type="button"
        className="creators-fab"
        onClick={() => navigate("/meet-our-team")}
      >
        <PeopleIcon aria-hidden /> Meet our creators
      </button>
    </main>
  );
}

export default LoginPage;
