import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import mascot from "../assets/panda-home.png";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import type { GeneratedQuiz } from "../features/quiz/types";
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
  if (!iso) return learnerModule.dueLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return learnerModule.dueLabel;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

type StepStatus = "done" | "current" | "upcoming";
type QuizItem = { title: string; status: StepStatus; statusLabel: string; date: string };

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
  const dueLabel = quiz ? formatDue(quiz.dueDate) : learnerModule.dueLabel;

  const quizzes: QuizItem[] = [
    { title: "Welcome to SageForce", status: "done", statusLabel: "Completed", date: "May 28" },
    { title: "Company Overview", status: "done", statusLabel: "Completed", date: "May 29" },
    { title, status: "current", statusLabel: "In Progress", date: `Due ${dueLabel}` },
    { title: "Safety Procedures", status: "upcoming", statusLabel: "Upcoming", date: "Jul 10" },
    { title: "Emergency Response", status: "upcoming", statusLabel: "Upcoming", date: "Jul 15" },
  ];

  return (
    <div className="app-shell">
      <AppNav />
      <main className="nh-home">
        <header className="nh-hero">
          <div className="nh-hero-text">
            <h1>Welcome back, {firstName}</h1>
            <p className="nh-hero-sub">Your onboarding path · {learnerModule.team}</p>
          </div>
        </header>

        <div className="nh-grid">
          <section className="nh-card glass nh-assigned">
            <span className="nh-eyebrow">
              <ClipboardIcon aria-hidden /> Assigned Module
            </span>

            <div className="nh-assigned-body">
              <div className="nh-assigned-info">
                <h2>{title}</h2>
                <p className="nh-meta">
                  <PersonIcon aria-hidden /> Assigned by {learnerModule.assignedBy}
                </p>
                <p className="nh-meta">
                  <CalendarIcon aria-hidden /> Due {dueLabel}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="sf-btn sf-btn-block"
              onClick={() => navigate("/learner-module")}
            >
              Get Started <ArrowRight aria-hidden />
            </button>
          </section>

          <section className="nh-card glass nh-quizzes">
            <img className="nh-quizzes-mascot" src={mascot} alt="" aria-hidden />
            <span className="nh-eyebrow">
              <QuizIcon aria-hidden /> Your Quizzes
            </span>

            <ul className="nh-timeline">
              {quizzes.map((step, i) => (
                <li key={`${step.title}-${i}`} className={`nh-step ${step.status}`}>
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
          </section>
        </div>
      </main>
    </div>
  );
}

export default NewHireHomePage;
