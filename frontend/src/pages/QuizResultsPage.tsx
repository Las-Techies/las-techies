import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  FileTextIcon,
  ListIcon,
  RefreshIcon,
  XPlain,
} from "../components/icons";

type Citation = {
  sourceDocumentId: number;
  sourceDocumentTitle: string;
  sourceSnippet: string;
};

type ReviewRow = {
  id: number;
  text: string;
  correct: boolean;
  source: string;
  citation: Citation | null;
};

// Sample content so the page is always demoable when opened without a real
// submitted attempt. Mirrors the v3 wireframe.
const SAMPLE_ROWS: ReviewRow[] = [
  { id: 1, text: "What is Salesforce Customer 360?", correct: true, source: "Trailhead", citation: null },
  { id: 2, text: "Which cloud allows you to automate service processes?", correct: true, source: "Help Docs", citation: null },
  { id: 3, text: "What is the purpose of a Record Type?", correct: true, source: "Trailhead", citation: null },
  { id: 4, text: "Which field type is used for long text and rich formatting?", correct: false, source: "Help Docs", citation: null },
  { id: 5, text: "What is a validation rule used for?", correct: true, source: "Trailhead", citation: null },
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
  // Which review row's source document is open in the source modal.
  const [sourceModalRowId, setSourceModalRowId] = useState<number | null>(null);
  const [sourceTextByDocumentId, setSourceTextByDocumentId] = useState<Record<number, string>>({});
  const [sourceLoadingByDocumentId, setSourceLoadingByDocumentId] = useState<
    Record<number, boolean>
  >({});
  const [sourceErrorByDocumentId, setSourceErrorByDocumentId] = useState<Record<number, string>>(
    {}
  );
  const highlightRefs = useRef<Record<number, HTMLElement | null>>({});

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
          citation: question.citation
            ? {
                sourceDocumentId: question.citation.sourceDocumentId,
                sourceDocumentTitle: question.citation.sourceDocumentTitle,
                sourceSnippet: question.citation.sourceSnippet,
              }
            : null,
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

  const activeSourceRow =
    sourceModalRowId != null ? rows.find((row) => row.id === sourceModalRowId) ?? null : null;

  const openSourceModal = (row: ReviewRow) => {
    if (!row.citation) return;
    setSourceModalRowId(row.id);
    void loadSourceText(row.citation.sourceDocumentId);
  };

  async function loadSourceText(documentId: number) {
    if (sourceTextByDocumentId[documentId] || sourceLoadingByDocumentId[documentId]) return;

    setSourceLoadingByDocumentId((prev) => ({ ...prev, [documentId]: true }));
    setSourceErrorByDocumentId((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });

    try {
      const response = await apiFetch<{ data: { rawText: string | null } }>(
        `/api/documents/${documentId}`
      );
      setSourceTextByDocumentId((prev) => ({
        ...prev,
        [documentId]: response.data.rawText ?? "No extracted text available for this document.",
      }));
    } catch (err) {
      setSourceErrorByDocumentId((prev) => ({
        ...prev,
        [documentId]: err instanceof Error ? err.message : "Failed to load source.",
      }));
    } finally {
      setSourceLoadingByDocumentId((prev) => ({ ...prev, [documentId]: false }));
    }
  }

  function renderHighlightedSource(sourceText: string, snippet: string, rowId: number) {
    const normalizedSource = sourceText ?? "";
    const normalizedSnippet = snippet?.trim() ?? "";
    if (!normalizedSnippet) return normalizedSource;

    const start = normalizedSource.indexOf(normalizedSnippet);
    if (start === -1) return normalizedSource;

    const end = start + normalizedSnippet.length;
    return (
      <>
        {normalizedSource.slice(0, start)}
        <mark
          ref={(el) => {
            highlightRefs.current[rowId] = el;
          }}
          style={{
            background: "linear-gradient(180deg, #fff3a8 0%, #ffe873 100%)",
            padding: "1px 2px",
            borderRadius: "3px",
            scrollMarginTop: "40px",
            boxShadow: "0 0 0 2px rgba(255, 224, 102, 0.5)",
          }}
        >
          {normalizedSource.slice(start, end)}
        </mark>
        {normalizedSource.slice(end)}
      </>
    );
  }

  // Once the source modal is open and its text has loaded, scroll the
  // highlighted snippet into view.
  useEffect(() => {
    if (!activeSourceRow?.citation) return;
    const documentId = activeSourceRow.citation.sourceDocumentId;
    if (sourceLoadingByDocumentId[documentId]) return;
    requestAnimationFrame(() => {
      highlightRefs.current[activeSourceRow.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [activeSourceRow, sourceLoadingByDocumentId, sourceTextByDocumentId]);

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
                  {row.citation ? (
                    <button
                      type="button"
                      className="source-tag source-tag-btn"
                      title="View source"
                      aria-label={`View source for ${row.source}`}
                      onClick={() => openSourceModal(row)}
                    >
                      <FileTextIcon aria-hidden /> Source: {row.source}
                    </button>
                  ) : (
                    <span className="source-tag">Source: {row.source}</span>
                  )}
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

        {activeSourceRow?.citation ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setSourceModalRowId(null)}
          >
            <div
              className="modal-card rp-source-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rp-source-head">
                <div>
                  <span className="rp-source-eyebrow">Source document</span>
                  <h3>{activeSourceRow.citation.sourceDocumentTitle}</h3>
                </div>
                <button
                  type="button"
                  className="rp-source-close"
                  aria-label="Close source"
                  onClick={() => setSourceModalRowId(null)}
                >
                  ×
                </button>
              </div>
              <div className="rp-source-body">
                {sourceLoadingByDocumentId[activeSourceRow.citation.sourceDocumentId] ? (
                  <p className="cfg-empty">Loading source…</p>
                ) : sourceErrorByDocumentId[activeSourceRow.citation.sourceDocumentId] ? (
                  <p className="form-error">
                    {sourceErrorByDocumentId[activeSourceRow.citation.sourceDocumentId]}
                  </p>
                ) : (
                  <div className="rp-source-page">
                    {renderHighlightedSource(
                      sourceTextByDocumentId[activeSourceRow.citation.sourceDocumentId] ??
                        "No extracted text available for this document.",
                      activeSourceRow.citation.sourceSnippet,
                      activeSourceRow.id
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default QuizResultsPage;
