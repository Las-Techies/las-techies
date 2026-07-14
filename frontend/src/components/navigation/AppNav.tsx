import { Link, useLocation } from "react-router-dom";
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
  const isWorkflowRoute = QUIZ_WORKFLOW_ROUTES.some((route) => route === location.pathname);
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ?? "there";
  const role =
    (user?.user_metadata?.role as string | undefined) === "manager"
      ? "Manager"
      : "New Hire";

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
      <div className="app-nav-user">
        <span className="user-avatar" />
        <span>
          Hi, {firstName} <span className="muted">· {role}</span>
        </span>
      </div>
    </header>
  );
}

export default AppNav;
