import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoBadge from "../assets/sageforce-logo-badge.png";
import { apiFetch, completeQuizAssignment } from "../api/client";
import { saveQuizAttempt } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";
import { ArrowRight, ClockIcon } from "../components/icons";

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
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [quizId, setQuizId] = useState<number | null>(quizIdParam ? Number(quizIdParam) : null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Guards against the auto-submit-on-timeout effect firing more than once.
  const hasSubmittedRef = useRef(false);

  // Loads the specific quiz this page was opened for (from the new-hire's
  // assigned-quiz list); falls back to "my latest quiz" only when no quizId
  // was passed in, so old links/bookmarks without one still work.
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
        if (quiz.timeLimitMinutes) {
          setHasTimeLimit(true);
          setSecondsLeft(quiz.timeLimitMinutes * 60);
        }
      })
      .catch(() => {
        /* leave questions empty — the empty state renders below */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quizIdParam]);

  const total = questions.length;
  const question = questions[current];
  const isLast = current === total - 1;

  const submitQuiz = () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
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

  // Countdown ticks only while there's a time limit and time remaining.
  useEffect(() => {
    if (!hasTimeLimit || secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => (value <= 1 ? 0 : value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasTimeLimit, secondsLeft]);

  // When the clock hits zero, the quiz auto-submits.
  useEffect(() => {
    if (hasTimeLimit && secondsLeft === 0 && !isLoading && questions.length > 0) {
      submitQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTimeLimit, secondsLeft, isLoading, questions.length]);

  const selectOption = (optionId: number) => {
    setAnswers((prev) => ({ ...prev, [question.id]: optionId }));
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
      <header className="slim-topbar">
        <div className="brand">
          <img className="brand-logo" src={logoBadge} alt="SageForce" />
          <span className="brand-name">SageForce</span>
        </div>
      </header>

      <main className="quiz-stage">
        {isLoading ? (
          <section className="glass quiz-panel">
            <p className="cfg-empty">Loading quiz…</p>
          </section>
        ) : total === 0 ? (
          <section className="glass quiz-panel">
            <p className="cfg-empty">
              No quiz is available yet. Check back once your manager publishes one.
            </p>
          </section>
        ) : (
          <section className="glass quiz-panel">
            <div className="quiz-panel-head">
              <span className="quiz-qcount">
                Question {current + 1} of {total}
              </span>
              {hasTimeLimit ? (
                <span className={`timer-chip ${secondsLeft <= 60 ? "low" : ""}`}>
                  <ClockIcon /> {formatTime(secondsLeft)} left
                </span>
              ) : null}
            </div>

            <div className="seg-progress" aria-hidden>
              {dots.map((index) => (
                <span key={index} className={index <= current ? "on" : ""} />
              ))}
            </div>

            <h1 className="quiz-prompt">{question.prompt}</h1>

            <div className="answers">
              {question.options.map((option, index) => {
                const selected = answers[question.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`answer ${selected ? "selected" : ""}`}
                    onClick={() => selectOption(option.id)}
                  >
                    <span className="answer-letter">{LETTERS[index]}</span>
                    <span className="answer-text">{option.text}</span>
                    <span className="answer-radio" aria-hidden />
                  </button>
                );
              })}
            </div>

            <div className="quiz-panel-foot">
              <button
                className="ghost-btn"
                type="button"
                onClick={goPrev}
                disabled={current === 0}
              >
                Previous
              </button>

              <div className="dot-stepper" aria-hidden>
                {dots.map((index) => (
                  <span
                    key={index}
                    className={`d ${index < current ? "on" : ""} ${
                      index === current ? "here" : ""
                    }`}
                  />
                ))}
              </div>

              <button className="sf-btn" type="button" onClick={goNext}>
                {isLast ? "Submit" : "Next"} <ArrowRight />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default QuizTakingPage;
