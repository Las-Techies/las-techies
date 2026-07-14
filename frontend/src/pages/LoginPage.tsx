import { useState } from "react";
import { Link } from "react-router-dom";

function LoginPage() {
  const [role, setRole] = useState<"new_hire" | "manager">("new_hire");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="login-page">
      <section className="login-left">
        <h1>AI-powered training built for frontline teams.</h1>
        <p>
          Launch onboarding and compliance quizzes in minutes using your existing docs and
          videos.
        </p>
        <ul>
          <li>Fast content ingestion</li>
          <li>Auto-generated quiz questions</li>
          <li>Manager-ready analytics dashboard</li>
        </ul>
      </section>

      <section className="login-card">
        <h2>Welcome to (app name)</h2>

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

        <Link className="primary-btn btn-link" to="/upload-content">
          Continue
        </Link>
        <a className="help-link" href="#">
          Need help signing in?
        </a>
      </section>
    </main>
  );
}

export default LoginPage;
