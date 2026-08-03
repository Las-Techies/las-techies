import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import mascot from "../assets/panda-home.png";
import { getMyTeam, listAssignedQuizzes, type AssignedQuiz } from "../api/client";
import { describeError, type FriendlyError } from "../api/errors";
import ApiErrorCard from "../components/ApiErrorCard";
import Skeleton from "../components/Skeleton";
import { useAuth } from "../context/AuthContext";
import { getUserDisplayFirstName } from "../features/auth/userDisplayName";
import {
  ArrowRight,
  CalendarIcon,
  CheckIcon,
  ChevronRight,
  ClipboardIcon,
  PersonIcon,
  QuizIcon,
  RefreshIcon,
  XCircleIcon,
} from "../components/icons";

const formatDue = (iso: string | null): string => {
  if (!iso) return "No due date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

type StepStatus = "done" | "current" | "upcoming" | "failed";
type QuizStep = {
  quizId: number;
  title: string;
  status: StepStatus;
  statusLabel: string;
  date: string;
};

const hasPassed = (a: AssignedQuiz) =>
  a.status === "completed" &&
  (a.passingScore == null || a.score == null || a.score >= a.passingScore);

const hasFailed = (a: AssignedQuiz) =>
  a.status === "completed" &&
  a.passingScore != null &&
  a.score != null &&
  a.score < a.passingScore;

function NewHireHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName = getUserDisplayFirstName(user);

  const [assignments, setAssignments] = useState<AssignedQuiz[]>([]);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<FriendlyError | null>(null);
  // Bumped by the Retry button to re-run the loader effect.
  const [reloadKey, setReloadKey] = useState(0);

  // Show the new hire's real assigned quizzes (soonest-due-and-pending first).
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    listAssignedQuizzes()
      .then((data) => {
        if (!cancelled) setAssignments(data);
      })
      .catch((err) => {
        if (!cancelled) setError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Real team name for the hero subline. Fails quietly — the subline just
  // omits the team rather than falling back to placeholder seed data.
  useEffect(() => {
    let cancelled = false;
    getMyTeam()
      .then((team) => {
        if (!cancelled) setTeamName(team.name);
      })
      .catch(() => {
        /* leave teamName null; the subline drops the team suffix */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The "current" quiz is the soonest still-pending or failed one (list is pre-sorted).
  const current = useMemo(
    () => assignments.find((a) => a.status !== "completed" || hasFailed(a)) ?? assignments[0] ?? null,
    [assignments]
  );

  const steps: QuizStep[] = useMemo(() => {
    const currentId = current?.assignmentId;
    return assignments.map((a) => {
      const failed = hasFailed(a);
      const passed = hasPassed(a);
      const isCurrent = !passed && !failed && a.assignmentId === currentId;
      const status: StepStatus = passed ? "done" : failed ? "failed" : isCurrent ? "current" : "upcoming";
      const statusLabel = passed ? "Completed" : failed ? "Completed · Not Passed" : isCurrent ? "In Progress" : "Upcoming";
      const due = formatDue(a.dueDate);
      const date = passed ? "Completed" : a.dueDate ? `Due ${due}` : "No due date";
      return { quizId: a.quizId, title: a.title, status, statusLabel, date };
    });
  }, [assignments, current]);

  const pendingCount = assignments.filter((a) => a.status !== "completed" || hasFailed(a)).length;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="nh-home">
        <header className="nh-hero">
          <div className="nh-hero-text">
            <h1>Welcome back, {firstName}</h1>
            <p className="nh-hero-sub">
              {isLoading
                ? `Your onboarding path${teamName ? ` · ${teamName}` : ""}`
                : pendingCount > 0
                  ? `You have ${pendingCount} onboarding quiz${pendingCount === 1 ? "" : "zes"} to complete`
                  : "You're all caught up on your onboarding"}
            </p>
          </div>
        </header>

        <div className="nh-grid">
          <section className="nh-card glass nh-assigned">
            <span className="nh-eyebrow">
              <ClipboardIcon aria-hidden /> Assigned Module
            </span>

            <div className="nh-assigned-body">
              <div className="nh-assigned-info">
                {isLoading ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    <Skeleton width="68%" height={24} />
                    <Skeleton width="90%" height={13} />
                    <Skeleton width="52%" height={13} />
                  </div>
                ) : current ? (
                  <>
                    <h2>{current.title}</h2>
                    {current.description ? (
                      <p className="nh-meta">
                        <PersonIcon aria-hidden /> {current.description}
                      </p>
                    ) : null}
                    <p className="nh-meta">
                      <CalendarIcon aria-hidden /> Due {formatDue(current.dueDate)}
                    </p>
                  </>
                ) : (
                  <>
                    <h2>You're all set for now</h2>
                    <p className="nh-meta">
                      Your manager hasn't assigned any onboarding quizzes yet.
                    </p>
                  </>
                )}
              </div>
            </div>

            <button
              type="button"
              className={`sf-btn sf-btn-block${current && hasFailed(current) ? " sf-btn-retake" : ""}`}
              disabled={!current || hasPassed(current)}
              onClick={() =>
                current && navigate(`/learner-module?quizId=${current.quizId}`)
              }
            >
              {current && hasPassed(current) ? "Completed" : current && hasFailed(current) ? "Retake Quiz" : "Get Started"}
              <ArrowRight aria-hidden />
            </button>
          </section>

          <section className="nh-card glass nh-quizzes">
            <img className="nh-quizzes-mascot" src={mascot} alt="" aria-hidden />
            <span className="nh-eyebrow">
              <QuizIcon aria-hidden /> Your Quizzes
            </span>

            {error ? (
              <ApiErrorCard error={error} onRetry={() => setReloadKey((k) => k + 1)} />
            ) : isLoading ? (
              <ul className="nh-timeline" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <li className="nh-step upcoming" key={i}>
                    <span className="nh-step-icon" />
                    <div className="nh-step-main" style={{ display: "grid", gap: 8, flex: 1 }}>
                      <Skeleton width={`${58 + i * 10}%`} height={14} />
                      <Skeleton width={`${38 + i * 8}%`} height={11} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : steps.length === 0 ? (
              <ul className="nh-timeline">
                <li className="nh-step upcoming">
                  <span className="nh-step-icon" />
                  <div className="nh-step-main">
                    <strong>No quizzes assigned yet</strong>
                    <span>Check back soon</span>
                  </div>
                </li>
              </ul>
            ) : (
              <ul className="nh-timeline">
                {steps.map((step, i) => (
                  <li
                    key={`${step.quizId}-${i}`}
                    className={`nh-step ${step.status}`}
                    onClick={() => navigate(`/quiz-taking?quizId=${step.quizId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigate(`/quiz-taking?quizId=${step.quizId}`);
                      }
                    }}
                  >
                    <span className="nh-step-icon">
                      {step.status === "done" ? <CheckIcon aria-hidden /> : null}
                      {step.status === "failed" ? <XCircleIcon aria-hidden /> : null}
                    </span>
                    <div className="nh-step-main">
                      <strong>{step.title}</strong>
                      <span>{step.statusLabel}</span>
                    </div>
                    {step.status === "failed" ? (
                      <span className="nh-step-retake">
                        <RefreshIcon aria-hidden /> Retake
                      </span>
                    ) : (
                      <span className="nh-step-date">{step.date}</span>
                    )}
                    <ChevronRight className="nh-step-chevron" aria-hidden />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default NewHireHomePage;
