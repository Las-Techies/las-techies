import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import mascot from "../assets/panda-home.png";
import { listAssignedQuizzes, type AssignedQuiz } from "../api/client";
import { useAuth } from "../context/AuthContext";
import {
  ArrowRight,
  CalendarIcon,
  CheckIcon,
  ChevronRight,
  ClipboardIcon,
  QuizIcon,
} from "../components/icons";

const formatDue = (iso: string | null): string => {
  if (!iso) return "No due date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type StepStatus = "done" | "current" | "upcoming";

function NewHireHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ?? "there";

  const [assignments, setAssignments] = useState<AssignedQuiz[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

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

  const pendingCount = assignments.filter((a) => a.status !== "completed").length;

  // Feature the first still-pending assignment (or fall back to the first one).
  const featured =
    assignments.find((a) => a.status !== "completed") ?? assignments[0] ?? null;

  const firstPendingId = assignments.find((a) => a.status !== "completed")?.assignmentId;

  const stepStatusFor = (assignment: AssignedQuiz): StepStatus => {
    if (assignment.status === "completed") return "done";
    return assignment.assignmentId === firstPendingId ? "current" : "upcoming";
  };

  const STEP_LABEL: Record<StepStatus, string> = {
    done: "Completed",
    current: "In Progress",
    upcoming: "Upcoming",
  };

  return (
    <div className="app-shell">
      <AppNav />
      <main className="nh-home">
        <header className="nh-hero">
          <div className="nh-hero-text">
            <h1>Welcome back, {firstName}</h1>
            <p className="nh-hero-sub">
              {pendingCount > 0
                ? `You have ${pendingCount} onboarding quiz${pendingCount === 1 ? "" : "zes"} to complete`
                : "You're all caught up on your onboarding"}
            </p>
          </div>
        </header>

        {isLoading ? (
          <p className="uploads-empty">Loading your assigned quizzes…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : assignments.length === 0 ? (
          <section className="nh-card glass nh-assigned">
            <span className="nh-eyebrow">
              <ClipboardIcon aria-hidden /> Assigned Module
            </span>
            <div className="nh-assigned-body">
              <div className="nh-assigned-info">
                <h2>You're all set for now</h2>
                <p className="nh-meta">
                  Your manager hasn't assigned any onboarding quizzes yet. Check back soon.
                </p>
              </div>
            </div>
          </section>
        ) : (
          <div className="nh-grid">
            {featured ? (
              <section className="nh-card glass nh-assigned">
                <span className="nh-eyebrow">
                  <ClipboardIcon aria-hidden /> Assigned Module
                </span>

                <div className="nh-assigned-body">
                  <div className="nh-assigned-info">
                    <h2>{featured.title}</h2>
                    {featured.description ? (
                      <p className="nh-meta">{featured.description}</p>
                    ) : null}
                    <p className="nh-meta">
                      <CalendarIcon aria-hidden /> Due {formatDue(featured.dueDate)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="sf-btn sf-btn-block"
                  disabled={featured.status === "completed"}
                  onClick={() => navigate(`/learner-module?quizId=${featured.quizId}`)}
                >
                  {featured.status === "completed" ? (
                    "Completed"
                  ) : (
                    <>
                      Get Started <ArrowRight aria-hidden />
                    </>
                  )}
                </button>
              </section>
            ) : null}

            <section className="nh-card glass nh-quizzes">
              <img className="nh-quizzes-mascot" src={mascot} alt="" aria-hidden />
              <span className="nh-eyebrow">
                <QuizIcon aria-hidden /> Your Quizzes
              </span>

              <ul className="nh-timeline">
                {assignments.map((assignment) => {
                  const status = stepStatusFor(assignment);
                  return (
                    <li
                      key={assignment.assignmentId}
                      className={`nh-step ${status}`}
                      onClick={() => navigate(`/learner-module?quizId=${assignment.quizId}`)}
                    >
                      <span className="nh-step-icon">
                        {status === "done" ? <CheckIcon aria-hidden /> : null}
                      </span>
                      <div className="nh-step-main">
                        <strong>{assignment.title}</strong>
                        <span>{STEP_LABEL[status]}</span>
                      </div>
                      <span className="nh-step-date">
                        {status === "done" ? "Completed" : `Due ${formatDue(assignment.dueDate)}`}
                      </span>
                      <ChevronRight className="nh-step-chevron" aria-hidden />
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default NewHireHomePage;
