import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { listAssignedQuizzes, type AssignedQuiz } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Urgency = "overdue" | "soon" | "ontrack" | "none" | "completed";

const DAY_MS = 24 * 60 * 60 * 1000;

function urgencyFor(assignment: AssignedQuiz): Urgency {
  if (assignment.status === "completed") return "completed";
  if (!assignment.dueDate) return "none";

  const due = new Date(assignment.dueDate).getTime();
  if (Number.isNaN(due)) return "none";

  const daysLeft = (due - Date.now()) / DAY_MS;
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 3) return "soon";
  return "ontrack";
}

const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: "Overdue",
  soon: "Due soon",
  ontrack: "On track",
  none: "No due date",
  completed: "Completed",
};

const formatDue = (iso: string | null): string => {
  if (!iso) return "No due date";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No due date";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

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

  return (
    <div className="app-shell">
      <AppNav />
      <main className="home-wrap">
        <header className="home-header">
          <h1>Welcome back, {firstName}</h1>
          <p className="subtle">
            {pendingCount > 0
              ? `You have ${pendingCount} onboarding quiz${pendingCount === 1 ? "" : "zes"} to complete`
              : "You're all caught up on your onboarding"}
          </p>
        </header>

        {isLoading ? (
          <p className="uploads-empty">Loading your assigned quizzes…</p>
        ) : error ? (
          <p className="form-error">{error}</p>
        ) : assignments.length === 0 ? (
          <section className="assigned-card">
            <span className="assigned-eyebrow">Nothing assigned yet</span>
            <h2>You're all set for now</h2>
            <p className="assigned-desc">
              Your manager hasn't assigned any onboarding quizzes yet. Check back soon.
            </p>
          </section>
        ) : (
          <div className="assigned-quiz-list">
            {assignments.map((assignment) => {
              const urgency = urgencyFor(assignment);
              return (
                <section
                  key={assignment.assignmentId}
                  className={`card assigned-quiz-card urgency-${urgency}`}
                >
                  <div className="assigned-quiz-card-head">
                    <span className={`assigned-quiz-badge urgency-${urgency}`}>
                      {URGENCY_LABEL[urgency]}
                    </span>
                    <span className="subtle">Due {formatDue(assignment.dueDate)}</span>
                  </div>
                  <h2>{assignment.title}</h2>
                  {assignment.description ? (
                    <p className="assigned-desc">{assignment.description}</p>
                  ) : null}

                  <button
                    type="button"
                    className="primary-btn assigned-cta"
                    disabled={assignment.status === "completed"}
                    onClick={() => navigate(`/learner-module?quizId=${assignment.quizId}`)}
                  >
                    {assignment.status === "completed" ? (
                      "Completed"
                    ) : (
                      <>
                        Get Started <span aria-hidden>→</span>
                      </>
                    )}
                  </button>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default NewHireHomePage;
