import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import mascotLogo from "../assets/sageforce-mascot-transparent.png";
import { useAuth } from "../context/AuthContext";

type Mode = "login" | "signup";

function routeForRole(role: string | undefined): string {
  return role === "manager" ? "/upload-content" : "/quiz-results";
}

function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [role, setRole] = useState<"" | "new_hire" | "manager">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { session, loading, signIn, signUp } = useAuth();

  // Already logged in (e.g. came back to "/" with a valid session) —
  // skip the form entirely instead of asking them to log in again.
  useEffect(() => {
    if (!loading && session) {
      navigate(routeForRole(session.user.user_metadata?.role), { replace: true });
    }
  }, [loading, session, navigate]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }

    setError("");
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

    setError("");
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
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </main>
  );
}

export default LoginPage;
