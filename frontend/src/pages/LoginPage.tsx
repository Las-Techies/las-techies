import { useState } from "react";
import { useNavigate } from "react-router-dom";
import mascotLogo from "../assets/sageforce-mascot-transparent.png";

function LoginPage() {
  const [role, setRole] = useState<"" | "new_hire" | "manager">("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = () => {
    if (!email.trim() || !password.trim() || role === "") {
      setError("Please fill out email, password, and role before logging in.");
      return;
    }
    setError("");
    navigate("/upload-content");
  };

  return (
    <main className="login-page">
      <section className="login-left">
        <img className="login-mascot" src={mascotLogo} alt="SageForce mascot logo" />
      </section>

      <section className="login-card">
        <h2>Welcome to SageForce</h2>

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
          <button className="primary-btn btn-link" type="button" onClick={handleLogin}>
            Log in
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </section>
    </main>
  );
}

export default LoginPage;
