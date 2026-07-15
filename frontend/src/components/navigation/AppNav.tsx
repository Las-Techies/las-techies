import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { QUIZ_WORKFLOW_ROUTES } from "../../features/quiz/workflow";
import { useAuth } from "../../context/AuthContext";

type NavItem =
  | { label: string; type: "label" }
  | { label: string; type: "link"; to: string };

const navItems: NavItem[] = [
  { label: "Manager Dashboard", type: "label" },
  { label: "Upload + Generate", type: "link", to: "/upload-content" },
  { label: "Learner Module", type: "label" },
  { label: "Quiz Results", type: "link", to: "/quiz-results" },
];

function AppNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const isWorkflowRoute = QUIZ_WORKFLOW_ROUTES.some((route) => route === location.pathname);
  const { user, signOut } = useAuth();
  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ?? "there";
  const role =
    (user?.user_metadata?.role as string | undefined) === "manager"
      ? "Manager"
      : "New Hire";

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  const handleLogout = async () => {
    setIsMenuOpen(false);
    await signOut();
    navigate("/");
  };

  return (
    <header className="app-nav">
      <div className="brand">SageForce</div>
      <nav className="app-nav-links">
        {navItems.map((item) => {
          if (item.type === "label") {
            return (
              <span key={item.label} className="app-nav-link muted">
                {item.label}
              </span>
            );
          }

          const isActive =
            location.pathname === item.to ||
            (item.to === "/upload-content" && isWorkflowRoute);

          return (
            <Link
              key={item.label}
              className={`app-nav-link ${isActive ? "active" : ""}`}
              to={item.to}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="app-nav-user" ref={menuRef}>
        <button
          type="button"
          className="app-nav-user-trigger"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          <span className="user-avatar" />
          <span>
            Hi, {firstName} <span className="muted">· {role}</span>
          </span>
        </button>

        {isMenuOpen ? (
          <div className="app-nav-user-menu" role="menu">
            <button type="button" role="menuitem" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default AppNav;
