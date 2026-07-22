import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { apiFetch, completeQuizAssignment } from "../api/client";
import { loadQuizConfig, saveQuizAttempt } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";

// Shown when the account has no generated quiz yet, so the screen is always
// demoable. Mirrors the wireframe content.
const FALLBACK_QUESTIONS: QuizQuestion[] = [
  {
    id: 1,
    prompt: "What is the minimum PPE requirement for Zone A?",
    type: "multiple_choice",
    explanation: "",
    options: [
      { id: 11, text: "Hard hat only", isCorrect: false },
      { id: 12, text: "Hard hat, safety glasses, and steel-toe boots", isCorrect: true },
      { id: 13, text: "High-visibility vest only", isCorrect: false },
      { id: 14, text: "No PPE required if walking only", isCorrect: false },
    ],
  },
  {
    id: 2,
    prompt: "How often must fire extinguishers be inspected according to OSHA 2026 guidelines?",
    type: "multiple_choice",
    explanation: "",
    options: [
      { id: 21, text: "Weekly", isCorrect: false },
      { id: 22, text: "Monthly", isCorrect: false },
      { id: 23, text: "Every 6 months", isCorrect: true },
      { id: 24, text: "Annually", isCorrect: false },
    ],
  },
  {
    id: 3,
    prompt: "When must hearing protection be worn in Zone A?",
    type: "multiple_choice",
    explanation: "",
    options: [
      { id: 31, text: "At all times", isCorrect: false },
      { id: 32, text: "When noise levels exceed 85 dB", isCorrect: true },
      { id: 33, text: "Only during night shifts", isCorrect: false },
      { id: 34, text: "Never", isCorrect: false },
    ],
  },
  {
    id: 4,
    prompt: "Who may enter Zone A during active machinery operation?",
    type: "multiple_choice",
    explanation: "",
    options: [
      { id: 41, text: "Anyone with a visitor badge", isCorrect: false },
      { id: 42, text: "Only certified operators", isCorrect: true },
      { id: 43, text: "Any full-time employee", isCorrect: false },
      { id: 44, text: "New hires in their first week", isCorrect: false },
    ],
  },
  {
    id: 5,
    prompt: "What should you do before servicing equipment in Zone A?",
    type: "multiple_choice",
    explanation: "",
    options: [
      { id: 51, text: "Apply lockout/tagout and verify zero energy state", isCorrect: true },
      { id: 52, text: "Notify a coworker verbally", isCorrect: false },
      { id: 53, text: "Nothing, just start working", isCorrect: false },
      { id: 54, text: "Remove any existing locks", isCorrect: false },
    ],
  },
];

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function QuizTakingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quizIdParam = searchParams.get("quizId");
  const [title, setTitle] = useState(() => loadQuizConfig().moduleTitle);
  const [quizId, setQuizId] = useState<number | null>(
    quizIdParam ? Number(quizIdParam) : null
  );
  const [questions, setQuestions] = useState<QuizQuestion[]>(FALLBACK_QUESTIONS);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState(() => loadQuizConfig().timeLimit * 60);

  // Loads the specific quiz this page was opened for (from the new-hire's
  // assigned-quiz list); falls back to "my latest quiz" only when no quizId
  // was passed in, so old links/bookmarks without one still work. Falls
  // back silently to the sample questions if the API is unavailable.
  useEffect(() => {
    let cancelled = false;
    const quizRequest = quizIdParam
      ? apiFetch<GeneratedQuiz | null>(`/api/quizzes/${quizIdParam}`)
      : apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest");

    quizRequest
      .then((quiz) => {
        if (cancelled || !quiz || quiz.questionsPayload.length === 0) return;
        setQuestions(quiz.questionsPayload);
        setQuizId(quiz.id);
        setTitle(quiz.title);
        if (quiz.timeLimitMinutes) setSecondsLeft(quiz.timeLimitMinutes * 60);
      })
      .catch(() => {
        /* keep fallback questions */
      });
    return () => {
      cancelled = true;
    };
  }, [quizIdParam]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const total = questions.length;
  const question = questions[current];
  const progressPercent = Math.round(((current + 1) / total) * 100);
  const isLast = current === total - 1;

  const selectOption = (optionId: number) => {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
  };

  const toggleFlag = () => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  };

  const submitQuiz = () => {
    saveQuizAttempt({
      quizId,
      title,
      submittedAt: new Date().toISOString(),
      questions,
      answers,
    });

    // Best-effort: marks this new hire's assignment complete so it drops off
    // their "to do" list. Never blocks navigating to results — a failure
    // here shouldn't stop the learner from seeing how they did.
    if (quizId) {
      void completeQuizAssignment(quizId).catch(() => {
        /* non-fatal */
      });
    }

    navigate("/quiz-results");
  };

  const goNext = () => {
    if (isLast) {
      submitQuiz();
      return;
    }
    setCurrent((index) => Math.min(index + 1, total - 1));
  };

  const goPrev = () => setCurrent((index) => Math.max(index - 1, 0));

  const dots = useMemo(() => Array.from({ length: total }, (_, index) => index), [total]);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <div className="quiz-take-head">
          <h1>{title} — Quiz</h1>
          <button
            type="button"
            className="exit-link"
            onClick={() =>
              navigate(quizId ? `/learner-module?quizId=${quizId}` : "/learner-module")
            }
          >
            Exit quiz
          </button>
        </div>

        <div className="quiz-progress-row">
          <span className="quiz-progress-count">
            Question {current + 1} of {total}
          </span>
          <span className={`timer-pill ${secondsLeft <= 60 ? "low" : ""}`}>
            <span aria-hidden>◷</span> {formatTime(secondsLeft)} left
          </span>
        </div>
        <div className="progress-track quiz-progress-track">
          <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <section className="card quiz-card">
          <span className="q-eyebrow">Question {current + 1}</span>
          <h2 className="q-prompt">{question.prompt}</h2>

          <div className="q-options">
            {question.options.map((option, index) => {
              const selected = answers[question.id] === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`q-option ${selected ? "selected" : ""}`}
                  onClick={() => selectOption(option.id)}
                >
                  <span className={`q-radio ${selected ? "on" : ""}`} aria-hidden />
                  <span className="q-letter">{LETTERS[index]}.</span>
                  <span className="q-text">{option.text}</span>
                </button>
              );
            })}
          </div>

          <button type="button" className="flag-btn" onClick={toggleFlag}>
            <span aria-hidden>⚑</span>{" "}
            {flagged.has(question.id) ? "Flagged for review" : "Flag for review"}
          </button>
        </section>

        <div className="quiz-foot">
          <button
            className="secondary-btn"
            type="button"
            onClick={goPrev}
            disabled={current === 0}
          >
            ← Previous
          </button>

          <div className="stepper" aria-hidden>
            {dots.map((index) => (
              <span
                key={index}
                className={`dot ${index < current ? "filled" : ""} ${
                  index === current ? "current" : ""
                }`}
              />
            ))}
          </div>

          <button className="primary-btn" type="button" onClick={goNext}>
            {isLast ? "Submit" : "Next →"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default QuizTakingPage;
