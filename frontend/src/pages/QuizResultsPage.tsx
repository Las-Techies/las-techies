import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoBadge from "../assets/sageforce-logo-badge.png";
import mascot from "../assets/panda-cheer-fullhat.png";
import { apiFetch } from "../api/client";
import { loadQuizAttempt, loadQuizConfig } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";
import {
  ArrowRight,
  CheckCircleIcon,
  CheckPlain,
  ClockIcon,
  ChartBarIcon,
  ListIcon,
  RefreshIcon,
  XPlain,
} from "../components/icons";

type ReviewRow = { id: number; text: string; correct: boolean; source: string };

// Sample content so the page is always demoable when opened without a real
// submitted attempt. Mirrors the v3 wireframe.
const SAMPLE_ROWS: ReviewRow[] = [
  { id: 1, text: "What is Salesforce Customer 360?", correct: true, source: "Trailhead" },
  { id: 2, text: "Which cloud allows you to automate service processes?", correct: true, source: "Help Docs" },
  { id: 3, text: "What is the purpose of a Record Type?", correct: true, source: "Trailhead" },
  { id: 4, text: "Which field type is used for long text and rich formatting?", correct: false, source: "Help Docs" },
  { id: 5, text: "What is a validation rule used for?", correct: true, source: "Trailhead" },
];

const CONFETTI = [
  { left: "6%", top: "24%", bg: "#f6c445", rot: "18deg" },
  { left: "14%", top: "60%", bg: "#e0453a", rot: "-12deg" },
  { left: "22%", top: "12%", bg: "#7c5cff", rot: "40deg" },
  { left: "34%", top: "70%", bg: "#2f8fe6", rot: "-24deg" },
  { left: "44%", top: "18%", bg: "#22c081", rot: "10deg" },
  { left: "58%", top: "64%", bg: "#f6c445", rot: "-30deg" },
  { left: "66%", top: "10%", bg: "#e0453a", rot: "22deg" },
  { left: "78%", top: "50%", bg: "#7c5cff", rot: "-16deg" },
  { left: "88%", top: "26%", bg: "#22c081", rot: "34deg" },
  { left: "94%", top: "62%", bg: "#2f8fe6", rot: "-8deg" },
];

function QuizResultsPage() {
  const navigate = useNavigate();
  const attempt = useMemo(() => loadQuizAttempt(), []);
  const [passingScore, setPassingScore] = useState(70);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);

  useEffect(() => {
    setPassingScore(loadQuizConfig().passingScore);
    if (attempt) return;
    apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest")
      .then((data) => setQuiz(data))
      .catch(() => {
        /* keep sample content */
      });
  }, [attempt]);

  const reviewQuestions: QuizQuestion[] = attempt?.questions ?? quiz?.questionsPayload ?? [];
  const userAnswers = attempt?.answers ?? {};
  const hasRealData = reviewQuestions.length > 0;

  const rows: ReviewRow[] = hasRealData
    ? reviewQuestions.map((question, index) => {
        const correctOption = question.options.find((option) => option.isCorrect);
        const gotItRight = Boolean(correctOption && userAnswers[question.id] === correctOption.id);
        return {
          id: question.id,
          text: `${index + 1}. ${question.prompt}`,
          correct: attempt ? gotItRight : Boolean(correctOption),
          source: question.citation?.sourceDocumentTitle ?? "Course Docs",
        };
      })
    : SAMPLE_ROWS;

  const totalQuestions = rows.length;
  const correctCount = rows.filter((row) => row.correct).length;
  const incorrectCount = Math.max(totalQuestions - correctCount, 0);
  const score =
    attempt && totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : hasRealData
        ? Math.round((correctCount / totalQuestions) * 100)
        : 80;
  const didPass = score >= passingScore;
  const timeTaken = attempt ? "—" : "12m 34s";

  return (
    <div className="app-shell">
      <header className="slim-topbar">
        <div className="brand">
          <img className="brand-logo" src={logoBadge} alt="SageForce" />
          <span className="brand-name">SageForce</span>
        </div>
        <span className="done-pill">
          <CheckCircleIcon /> Quiz Completed
        </span>
      </header>

      <main className="results-stage">
        {CONFETTI.map((bit, index) => (
          <span
            key={index}
            className="confetti-bit"
            style={{ left: bit.left, top: bit.top, background: bit.bg, transform: `rotate(${bit.rot})` }}
          />
        ))}

        <div className="results-hero">
          <div>
            <p className="results-eyebrow">QUIZ RESULTS</p>
            <h1>{didPass ? "You passed!" : "Almost there"}</h1>
            <p>
              {didPass
                ? "Great job! You've demonstrated a solid understanding of this topic."
                : "Review the questions you missed, then retake the quiz to pass."}
            </p>
          </div>
        </div>

        <div className="results-grid">
          <section className="glass card">
            <h2 className="card-title">
              <ChartBarIcon /> Your Results
            </h2>

            <div className="score-row">
              <div className="score-ring" style={{ "--pct": `${score}%` } as CSSProperties}>
                <div className="score-ring-center">
                  <strong>{score}%</strong>
                  <span>Your Score</span>
                </div>
              </div>
              <div className="score-meta">
                <span className={`pass-badge ${didPass ? "ok" : "no"}`}>
                  {didPass ? <CheckCircleIcon /> : <XPlain />}
                  {didPass ? "Passed" : "Not yet"}
                </span>
                <p className="score-sub">Passing score: {passingScore}%</p>
                <p className="score-breakdown-label">Performance Breakdown</p>
              </div>
            </div>

            <div className="stat-chips">
              <div className="stat-chip">
                <span className="stat-ic good">
                  <CheckPlain />
                </span>
                <strong>{correctCount}</strong>
                <span>Correct</span>
              </div>
              <div className="stat-chip">
                <span className="stat-ic bad">
                  <XPlain />
                </span>
                <strong>{incorrectCount}</strong>
                <span>Incorrect</span>
              </div>
              <div className="stat-chip">
                <span className="stat-ic time">
                  <ClockIcon />
                </span>
                <strong>{timeTaken}</strong>
                <span>Time Taken</span>
              </div>
            </div>
          </section>

          <section className="glass card results-review">
            <img className="results-review-mascot" src={mascot} alt="Celebrating panda" />
            <h2 className="card-title">
              <ListIcon /> Review Your Answers
            </h2>
            <div className="review-scroll">
              {rows.map((row) => (
                <div className="review-item" key={row.id}>
                  <span className={`review-mark ${row.correct ? "ok" : "no"}`}>
                    {row.correct ? <CheckPlain /> : <XPlain />}
                  </span>
                  <span className="review-q">{row.text}</span>
                  <span className="source-tag">Source: {row.source}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="results-foot">
          <button className="ghost-btn" type="button" onClick={() => navigate("/quiz-taking")}>
            <RefreshIcon /> Retake
          </button>
          <button className="sf-btn" type="button" onClick={() => navigate("/learner-module")}>
            Back to Module <ArrowRight />
          </button>
        </div>
      </main>
    </div>
  );
}

export default QuizResultsPage;
