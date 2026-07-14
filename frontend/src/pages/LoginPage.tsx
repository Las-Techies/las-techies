import { useState } from "react";
import { useNavigate } from "react-router-dom";
import mascotLogo from "../assets/sageforce-mascot-transparent.png";
import { useAuth } from "../context/AuthContext";

function LoginPage() {
  const [role, setRole] = useState<"" | "new_hire" | "manager">("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { signInWithRole } = useAuth();

  const handleLogin = async () => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !email.trim() ||
      !password.trim() ||
      role === ""
    ) {
      setError(
        "Please fill out your name, email, password, and role before logging in."
      );
      return;
    }

    setError("");
    setSubmitting(true);
    try {
      const session = await signInWithRole(
        email.trim(),
        password,
        role,
        firstName.trim(),
        lastName.trim()
      );
      if (!session) {
        setError(
          "Account created. Please confirm your email, then log in again."
        );
        return;
      }
      navigate(role === "manager" ? "/upload-content" : "/quiz-results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-left">
        <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
      </section>

      <section className="login-card">
        <h2>Welcome to SageForce</h2>

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
          <a className="help-link" href="#">
            Need help signing in?
          </a>
          <button
            className="primary-btn btn-link"
            type="button"
            onClick={handleLogin}
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </main>
  );
}

export default LoginPage;
