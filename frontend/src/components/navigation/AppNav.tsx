import { Link, useLocation } from "react-router-dom";
import { QUIZ_WORKFLOW_ROUTES } from "../../features/quiz/workflow";

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
        <span>Manager</span>
      </div>
    </header>
  );
}

export default AppNav;
