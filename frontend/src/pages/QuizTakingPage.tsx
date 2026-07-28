import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { apiFetch, completeQuizAssignment } from "../api/client";
import { saveQuizAttempt } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";
import { useQuizGuard } from "../context/QuizGuardContext";
import { ArrowLeft, ArrowRight, ClockIcon, ClipboardIcon, ShieldIcon } from "../components/icons";

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
  const { setQuizInProgress } = useQuizGuard();
  const [isLoading, setIsLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [quizId, setQuizId] = useState<number | null>(
    quizIdParam ? Number(quizIdParam) : null
  );
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  // Gate the questions behind an intro screen so a new hire explicitly starts
  // the quiz (and sees the "finish in one sitting" warning) instead of being
  // dropped straight into Question 1.
  const [hasStarted, setHasStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  // Guards against the auto-submit-on-timeout effect firing more than once.
  const hasSubmittedRef = useRef(false);
  // Set once the quiz's real questions are actually on screen (not on mount —
  // that would also count the loading spinner toward the learner's time).
  // Used to compute a real "time taken" instead of a hardcoded placeholder.
  const startedAtRef = useRef<number | null>(null);

  // Loads the specific quiz this page was opened for (from the new hire's
  // assigned-quiz list); falls back to "my latest quiz" only when no quizId
  // was passed in, so older links without one still work. Nothing is shown
  // until this resolves — no placeholder/sample questions.
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
        // Remember the limit but don't start the clock — the countdown begins
        // only once the learner starts the quiz from the intro screen.
        if (quiz.timeLimitMinutes) setTimeLimitMinutes(quiz.timeLimitMinutes);
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

  // Begins the attempt: starts the timer (if any), stamps the start time for a
  // real "time taken", and flips the quiz-in-progress guard on so leaving the
  // page now prompts for confirmation.
  const startQuiz = () => {
    startedAtRef.current = Date.now();
    if (timeLimitMinutes) {
      setHasTimeLimit(true);
      setSecondsLeft(timeLimitMinutes * 60);
    }
    setHasStarted(true);
    setQuizInProgress(true);
  };

  const submitQuiz = () => {
    if (hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    // Attempt is finishing — release the navigation guard before routing to
    // results so the confirm modal doesn't fire on our own navigate().
    setQuizInProgress(false);

    const submittedAt = Date.now();
    const startedAt = startedAtRef.current ?? submittedAt;
    const timeTakenSeconds = Math.max(0, Math.round((submittedAt - startedAt) / 1000));

    const correctCount = questions.reduce((count, q) => {
      const correctOption = q.options.find((option) => option.isCorrect);
      return correctOption && answers[q.id] === correctOption.id ? count + 1 : count;
    }, 0);
    const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

    saveQuizAttempt({
      quizId,
      title,
      startedAt: new Date(startedAt).toISOString(),
      submittedAt: new Date(submittedAt).toISOString(),
      questions,
      answers,
    });

    // Best-effort: marks this new hire's assignment complete (and records
    // their score/time) so it drops off their "to do" list and a manager can
    // see real results instead of a blank/null row. Never blocks navigating
    // to results — a failure here shouldn't stop the learner from seeing how
    // they did.
    if (quizId) {
      void completeQuizAssignment(quizId, score, timeTakenSeconds).catch(() => {
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

  // Browser-level guardrail: warn on refresh / tab-close / browser-back while
  // the quiz is in progress. This is the native confirm dialog — the in-app
  // nav confirm modal (via QuizGuard) covers clicks on our own links.
  useEffect(() => {
    if (!hasStarted || hasSubmittedRef.current) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Required for the prompt to show in some browsers; the text itself is
      // ignored by modern browsers, which show their own generic message.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasStarted]);

  // Safety net: if this page unmounts for any reason while a quiz is live
  // (it wasn't submitted), clear the global guard so it can't get stuck on.
  useEffect(() => {
    return () => setQuizInProgress(false);
  }, [setQuizInProgress]);

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
      <AppNav />

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
            <div className="quiz-panel-foot" style={{ justifyContent: "center" }}>
              <button
                className="ghost-btn btn-link"
                type="button"
                onClick={() => navigate("/learner-module")}
              >
                <ArrowLeft /> Back to Learner Module
              </button>
            </div>
          </section>
        ) : !hasStarted ? (
          <section className="glass quiz-panel quiz-intro">
            <span className="quiz-intro-eyebrow">
              <ClipboardIcon aria-hidden /> Onboarding Quiz
            </span>
            <h1 className="quiz-intro-title">{title || "Ready to start?"}</h1>

            <ul className="quiz-intro-facts">
              <li>
                <strong>{total}</strong>
                <span>{total === 1 ? "question" : "questions"}</span>
              </li>
              <li>
                <strong>{timeLimitMinutes ? `${timeLimitMinutes} min` : "No limit"}</strong>
                <span>time limit</span>
              </li>
            </ul>

            <div className="quiz-intro-notice" role="note">
              <span className="quiz-intro-notice-icon" aria-hidden>
                <ShieldIcon />
              </span>
              <p>
                Once you begin, complete the quiz in one sitting.{" "}
                <strong>If you leave before submitting, your progress won't be saved</strong>{" "}
                and you'll have to start over{timeLimitMinutes ? ", and the timer keeps running" : ""}.
              </p>
            </div>

            <div className="quiz-panel-foot" style={{ justifyContent: "space-between" }}>
              <button
                className="ghost-btn"
                type="button"
                onClick={() => navigate("/learner-module")}
              >
                <ArrowLeft /> Back
              </button>
              <button className="sf-btn" type="button" onClick={startQuiz}>
                Start Quiz <ArrowRight />
              </button>
            </div>
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
