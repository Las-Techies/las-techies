import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { QUIZ_WORKFLOW_ROUTES } from "../../features/quiz/workflow";
import { useAuth } from "../../context/AuthContext";
import { useQuizGuard } from "../../context/QuizGuardContext";
import { useModalTransition } from "../../hooks/useModalTransition";
import { clearPreviewRole, getPreviewRole } from "../../features/auth/previewRole";
import { getUserDisplayFirstName, getUserInitials } from "../../features/auth/userDisplayName";
import logoBadge from "../../assets/sageforce-logo-badge.png";
import {
  ChartBarIcon,
  ChevronDown,
  HomeIcon,
  ModulesIcon,
  ProgressIcon,
  QuizIcon,
  ShieldIcon,
  UploadIcon,
} from "../icons";

type NavItem = { label: string; type: "link"; to: string; icon: ReactNode };

const managerNavItems: NavItem[] = [
  { label: "Dashboard", type: "link", to: "/manager-dashboard", icon: <ChartBarIcon /> },
  { label: "Upload + Generate", type: "link", to: "/upload-content", icon: <UploadIcon /> },
  { label: "Uploads", type: "link", to: "/learner-module", icon: <ModulesIcon /> },
];

const newHireNavItems: NavItem[] = [
  { label: "Home", type: "link", to: "/home", icon: <HomeIcon /> },
  { label: "My Modules", type: "link", to: "/learner-module", icon: <ModulesIcon /> },
  { label: "Quiz", type: "link", to: "/quiz-taking", icon: <QuizIcon /> },
  { label: "Progress", type: "link", to: "/quiz-results", icon: <ProgressIcon /> },
];

function AppNav({ lockedNav = false }: { lockedNav?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isWorkflowRoute = QUIZ_WORKFLOW_ROUTES.some((route) => route === location.pathname);
  const { user, signOut } = useAuth();
  const { isLeavePromptOpen, requestNavigation, confirmLeave, cancelLeave } = useQuizGuard();
  const leaveModal = useModalTransition(isLeavePromptOpen);
  const email = user?.email ?? null;
  const firstName = getUserDisplayFirstName(user);
  const effectiveRole =
    (user?.user_metadata?.role as string | undefined) ?? getPreviewRole() ?? "new_hire";
  const isManager = effectiveRole === "manager";
  const role = isManager ? "Manager" : "New Hire";
  const initials = getUserInitials(user);
  const avatarUrl = (user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture) as string | undefined;
  const navItems = isManager ? managerNavItems : newHireNavItems;

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

  const handleLogout = () => {
    setIsMenuOpen(false);
    // Logging out mid-quiz would also discard the attempt — guard it too.
    requestNavigation(async () => {
      clearPreviewRole();
      await signOut();
      navigate("/login");
    });
  };

  return (
    <header className="app-nav">
      <div className="brand">
        <img className="brand-logo" src={logoBadge} alt="" aria-hidden />
        <span className="brand-name">SageForce</span>
      </div>
      <nav className="app-nav-links">
        {navItems.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to === "/upload-content" && isWorkflowRoute);
          const isLocked = lockedNav && !isActive;

          return (
            <Link
              key={item.label}
              className={`app-nav-link ${isActive ? "active" : ""} ${isLocked ? "disabled" : ""}`}
              to={item.to}
              onClick={(event) => {
                event.preventDefault();
                if (isLocked) return;
                // Route through the quiz guard so navigating away mid-quiz
                // prompts for confirmation instead of silently discarding the
                // in-progress attempt. No-op guard when no quiz is active.
                requestNavigation(() => navigate(item.to));
              }}
            >
              {item.icon}
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
          {avatarUrl ? (
            <img className="user-avatar user-avatar-photo" src={avatarUrl} alt={initials || "User"} referrerPolicy="no-referrer" />
          ) : (
            <span className="user-avatar">{initials.toUpperCase() || "•"}</span>
          )}
          <span>
            {firstName} <span className="muted">· {role}</span>
          </span>
          <ChevronDown className="chevron" aria-hidden />
        </button>

        {isMenuOpen ? (
          <div className="app-nav-user-menu" role="menu">
            {email ? (
              <>
                {/* Non-interactive: just identifies which account is signed
                    in, truncated with a title tooltip if it's too long to
                    fit on one line. */}
                <div className="app-nav-user-menu-email" title={email}>
                  {email}
                </div>
                <div className="app-nav-user-menu-divider" role="separator" />
              </>
            ) : null}
            <button type="button" role="menuitem" onClick={handleLogout}>
              Log out
            </button>
          </div>
        ) : null}
      </div>
      {leaveModal.shouldRender
        ? createPortal(
            <div
              className={`modal-backdrop t-modal-backdrop ${leaveModal.phaseClassName}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="quiz-leave-title"
              onClick={cancelLeave}
            >
              <div
                className={`modal-card quiz-leave-modal t-modal ${leaveModal.phaseClassName}`}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="quiz-leave-icon" aria-hidden>
                  <ShieldIcon />
                </span>
                <h3 id="quiz-leave-title">Leave the quiz?</h3>
                <p>
                  You're in the middle of a quiz. If you leave now your progress
                  won't be saved and you'll have to start over.
                </p>
                <div className="quiz-leave-actions">
                  <button type="button" className="ghost-btn" onClick={cancelLeave}>
                    Keep going
                  </button>
                  <button type="button" className="sf-btn sf-btn-danger" onClick={confirmLeave}>
                    Leave quiz
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </header>
  );
}

export default AppNav;
