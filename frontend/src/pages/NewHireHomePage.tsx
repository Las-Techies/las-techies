import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import mascot from "../assets/panda-home.png";
import { listAssignedQuizzes, type AssignedQuiz } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { learnerModule } from "../features/learner/data";
import {
  ArrowRight,
  CalendarIcon,
  CheckIcon,
  ChevronRight,
  ClipboardIcon,
  PersonIcon,
  QuizIcon,
} from "../components/icons";

const formatDue = (iso: string | null): string => {
  if (!iso) return "No due date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

type StepStatus = "done" | "current" | "upcoming";
type QuizStep = {
  quizId: number;
  title: string;
  status: StepStatus;
  statusLabel: string;
  date: string;
};

function NewHireHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ?? "there";

  const [assignments, setAssignments] = useState<AssignedQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Show the new hire's real assigned quizzes (soonest-due-and-pending first).
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listAssignedQuizzes()
      .then((data) => {
        if (!cancelled) setAssignments(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load your assigned quizzes.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The "current" quiz is the soonest still-pending one (list is pre-sorted).
  const current = useMemo(
    () => assignments.find((a) => a.status !== "completed") ?? assignments[0] ?? null,
    [assignments]
  );

  const steps: QuizStep[] = useMemo(() => {
    const currentId = current?.assignmentId;
    return assignments.map((a) => {
      const isDone = a.status === "completed";
      const isCurrent = !isDone && a.assignmentId === currentId;
      const status: StepStatus = isDone ? "done" : isCurrent ? "current" : "upcoming";
      const statusLabel = isDone ? "Completed" : isCurrent ? "In Progress" : "Upcoming";
      const due = formatDue(a.dueDate);
      const date = isDone ? "Completed" : a.dueDate ? `Due ${due}` : "No due date";
      return { quizId: a.quizId, title: a.title, status, statusLabel, date };
    });
  }, [assignments, current]);

  const pendingCount = assignments.filter((a) => a.status !== "completed").length;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="nh-home">
        <header className="nh-hero">
          <div className="nh-hero-text">
            <h1>Welcome back, {firstName}</h1>
            <p className="nh-hero-sub">
              {isLoading
                ? `Your onboarding path · ${learnerModule.team}`
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
                  <h2>Loading…</h2>
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
              className="sf-btn sf-btn-block"
              disabled={!current || current.status === "completed"}
              onClick={() =>
                current && navigate(`/learner-module?quizId=${current.quizId}`)
              }
            >
              {current?.status === "completed" ? "Completed" : "Get Started"}{" "}
              <ArrowRight aria-hidden />
            </button>
          </section>

          <section className="nh-card glass nh-quizzes">
            <img className="nh-quizzes-mascot" src={mascot} alt="" aria-hidden />
            <span className="nh-eyebrow">
              <QuizIcon aria-hidden /> Your Quizzes
            </span>

            {error ? (
              <p className="form-error">{error}</p>
            ) : isLoading ? (
              <ul className="nh-timeline">
                <li className="nh-step upcoming">
                  <span className="nh-step-icon" />
                  <div className="nh-step-main">
                    <strong>Loading your quizzes…</strong>
                    <span>Please wait</span>
                  </div>
                </li>
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
                    onClick={() => navigate(`/learner-module?quizId=${step.quizId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        navigate(`/learner-module?quizId=${step.quizId}`);
                      }
                    }}
                  >
                    <span className="nh-step-icon">
                      {step.status === "done" ? <CheckIcon aria-hidden /> : null}
                    </span>
                    <div className="nh-step-main">
                      <strong>{step.title}</strong>
                      <span>{step.statusLabel}</span>
                    </div>
                    <span className="nh-step-date">{step.date}</span>
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
