import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { GeneratedQuiz } from "../features/quiz/types";
import { learnerModule } from "../features/learner/data";

const formatDue = (iso: string | null): string => {
  if (!iso) return learnerModule.dueLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return learnerModule.dueLabel;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

// Minimal onboarding home: a new hire is assigned exactly one onboarding
// module/quiz, so this page intentionally shows just a welcome + that single
// assigned card with a call to action.
function NewHireHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const firstName =
    (user?.user_metadata?.first_name as string | undefined) ?? "there";

  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);

  // Show the new hire's actually-assigned quiz when the backend has one;
  // otherwise fall back to the demo module so the page always renders.
  useEffect(() => {
    let cancelled = false;
    apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest")
      .then((data) => {
        if (!cancelled) setQuiz(data);
      })
      .catch(() => {
        /* keep demo content */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = quiz?.title ?? learnerModule.title;
  const description = quiz?.description ?? learnerModule.description;
  const dueLabel = quiz ? formatDue(quiz.dueDate) : learnerModule.dueLabel;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="home-wrap">
        <header className="home-header">
          <h1>Welcome back, {firstName}</h1>
          <p className="subtle">Your onboarding path · {learnerModule.team}</p>
        </header>

        <section className="assigned-card">
          <span className="assigned-eyebrow">Your assigned onboarding</span>
          <h2>{title}</h2>
          <p className="assigned-meta">
            Assigned by {learnerModule.assignedBy} · Due {dueLabel}
          </p>
          <p className="assigned-desc">{description}</p>

          <button
            type="button"
            className="primary-btn assigned-cta"
            onClick={() => navigate("/learner-module")}
          >
            Get Started <span aria-hidden>→</span>
          </button>
        </section>
      </main>
    </div>
  );
}

export default NewHireHomePage;
