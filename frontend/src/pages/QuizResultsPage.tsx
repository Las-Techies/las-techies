import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoBadge from "../assets/sageforce-logo-badge.png";
import mascot from "../assets/panda-cheer-fullhat.png";
import { apiFetch } from "../api/client";
import { findHighlightSpan } from "../features/quiz/citationMatch";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hoveredCitationQuestionId, setHoveredCitationQuestionId] = useState<number | null>(null);
  const [expandedCitationQuestionId, setExpandedCitationQuestionId] = useState<number | null>(null);
  const [sourceTextByDocumentId, setSourceTextByDocumentId] = useState<Record<number, string>>({});
  const [sourceLoadingByDocumentId, setSourceLoadingByDocumentId] = useState<Record<number, boolean>>(
    {}
  );
  const [sourceErrorByDocumentId, setSourceErrorByDocumentId] = useState<Record<number, string>>({});
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});
  const closePopoverTimerRef = useRef<number | null>(null);

  function openCitationPopover(questionId: number) {
    if (closePopoverTimerRef.current !== null) {
      window.clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
    setHoveredCitationQuestionId(questionId);
  }

  function scheduleCitationPopoverClose() {
    if (closePopoverTimerRef.current !== null) {
      window.clearTimeout(closePopoverTimerRef.current);
    }
    closePopoverTimerRef.current = window.setTimeout(() => {
      setHoveredCitationQuestionId(null);
      closePopoverTimerRef.current = null;
    }, 160);
  }

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

  function renderHighlightedSource(sourceText: string, snippet: string, questionId: number) {
    const source = sourceText ?? "";
    // Falls back to a fuzzy sentence match when the citation isn't a
    // verbatim substring (LLM-written quotes often drift slightly), and to
    // no highlight at all when nothing is close enough to be trustworthy.
    const span = findHighlightSpan(source, snippet);
    if (!span) return source;

    const before = source.slice(0, span.start);
    const match = source.slice(span.start, span.end);
    const after = source.slice(span.end);

    return (
      <>
        {before}
        <mark
          ref={(el) => {
            highlightRefs.current[String(questionId)] = el;
          }}
          style={{
            // Always blue so the "where this came from" highlight reads
            // consistently, whether the snippet matched verbatim or was located
            // by approximate (paraphrase) matching.
            background: "#dbe7fb",
            padding: "0 2px",
          }}
          title={span.matchType === "fuzzy" ? "Approximate match — wording may differ slightly" : undefined}
        >
          {match}
        </mark>
        {after}
      </>
    );
  }

  // Fetches "my most recently generated quiz" from the backend rather than
  // relying on a quizId cached in this browser, so the same account sees the
  // same quiz whichever device it logs in from.
  useEffect(() => {
    setPassingScore(loadQuizConfig().passingScore);
    // With an attempt we already have the questions the new hire answered, so
    // only reach out for the answer key when we don't have one.
    if (attempt) return;
    setLoading(true);
    apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest")
      .then((data) => setQuiz(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load quiz."))
      .finally(() => setLoading(false));
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

            {loading ? <p className="subtle">Loading quiz…</p> : null}
            {error ? <p className="form-error">{error}</p> : null}

            {hasRealData ? (
              <div className="review-scroll">
                {reviewQuestions.map((question, index) => {
                  const correct = question.options.find((option) => option.isCorrect);
                  const chosenId = userAnswers[question.id];
                  const gotItRight = Boolean(correct && chosenId === correct.id);
                  return (
                    <article className="review-question-card" key={question.id}>
                      <h3>
                        Q{index + 1}. {question.prompt}
                        {attempt ? (
                          <span className={`review-status ${gotItRight ? "ok" : "bad"}`}>
                            {gotItRight ? "Correct" : "Incorrect"}
                          </span>
                        ) : null}
                      </h3>
                      <ul>
                        {question.options.map((option) => {
                          const chosen = chosenId === option.id;
                          const optionClass = option.isCorrect
                            ? "opt-correct"
                            : chosen
                              ? "opt-wrong"
                              : "";
                          return (
                            <li key={option.id} className={optionClass}>
                              {option.isCorrect ? "✓ " : chosen ? "✗ " : ""}
                              {option.text}
                              {chosen ? " — your answer" : ""}
                            </li>
                          );
                        })}
                      </ul>
                      <p>
                        <strong>Correct Answer:</strong> {correct?.text ?? "N/A"}
                        {question.citation ? (
                          <span
                            style={{ position: "relative", display: "inline-flex", marginLeft: "8px" }}
                            onMouseEnter={() => openCitationPopover(question.id)}
                            onMouseLeave={scheduleCitationPopoverClose}
                          >
                            <button
                              type="button"
                              aria-label={`View source for ${question.citation.sourceDocumentTitle}`}
                              onFocus={() => openCitationPopover(question.id)}
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "999px",
                                border: "1px solid #d8dde6",
                                background: "#eef4ff",
                                color: "#032d60",
                                fontSize: "13px",
                                lineHeight: "1",
                                cursor: "pointer",
                                padding: 0,
                              }}
                            >
                              📄
                            </button>
                            {hoveredCitationQuestionId === question.id ? (
                              <div
                                className="citation-box"
                                role="tooltip"
                                onMouseEnter={() => openCitationPopover(question.id)}
                                onMouseLeave={scheduleCitationPopoverClose}
                                style={{
                                  position: "absolute",
                                  left: "auto",
                                  right: 0,
                                  top: "100%",
                                  width: "min(460px, calc(100vw - 24px))",
                                  maxWidth: "calc(100vw - 24px)",
                                  zIndex: 20,
                                  background: "#ffffff",
                                  border: "1px solid #d8dde6",
                                  borderRadius: "12px",
                                  boxShadow: "0 10px 24px rgba(0, 0, 0, 0.2)",
                                  color: "#181818",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "10px 14px",
                                    borderBottom: "1px solid #d8dde6",
                                    background: "#f8f9fb",
                                    fontSize: "18px",
                                    lineHeight: "1.25",
                                    fontWeight: 700,
                                  }}
                                >
                                  Document title: {question.citation.sourceDocumentTitle}
                                </div>
                                <div
                                  style={{
                                    padding: "10px 14px",
                                    maxHeight: "140px",
                                    overflowY: "auto",
                                    fontSize: "14px",
                                    lineHeight: "1.45",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {question.citation.sourceSnippet}
                                </div>
                                <div
                                  style={{
                                    padding: "10px 14px",
                                    borderTop: "1px solid #d8dde6",
                                    background: "#f8f9fb",
                                  }}
                                >
                                  <a
                                    href="#"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const documentId = question.citation!.sourceDocumentId;
                                      const willExpand = expandedCitationQuestionId !== question.id;
                                      setExpandedCitationQuestionId((prev) =>
                                        prev === question.id ? null : question.id
                                      );
                                      if (willExpand) {
                                        void loadSourceText(documentId);
                                      }
                                    }}
                                  >
                                    {expandedCitationQuestionId === question.id
                                      ? "Hide source"
                                      : "View source"}
                                  </a>
                                </div>
                                {expandedCitationQuestionId === question.id ? (
                                  <div
                                    style={{
                                      padding: "10px 14px",
                                      borderTop: "1px solid #d8dde6",
                                      background: "#ffffff",
                                      maxHeight: "220px",
                                      overflowY: "auto",
                                      whiteSpace: "pre-wrap",
                                      fontSize: "13px",
                                      lineHeight: "1.45",
                                    }}
                                  >
                                    {sourceLoadingByDocumentId[question.citation.sourceDocumentId]
                                      ? "Loading source..."
                                      : sourceErrorByDocumentId[question.citation.sourceDocumentId]
                                        ? sourceErrorByDocumentId[question.citation.sourceDocumentId]
                                        : renderHighlightedSource(
                                            sourceTextByDocumentId[
                                              question.citation.sourceDocumentId
                                            ] ?? "No extracted text available for this document.",
                                            question.citation.sourceSnippet,
                                            question.id
                                          )}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </span>
                        ) : null}
                      </p>
                      {question.explanation ? (
                        <p className="subtle">{question.explanation}</p>
                      ) : null}
                      {!question.citation ? <p className="subtle">Source unavailable</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : (
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
            )}
          </section>
        </div>

        <div className="results-foot">
          <button
            className="ghost-btn"
            type="button"
            onClick={() =>
              navigate(attempt?.quizId ? `/quiz-taking?quizId=${attempt.quizId}` : "/quiz-taking")
            }
          >
            <RefreshIcon /> Retake
          </button>
          <button
            className="sf-btn"
            type="button"
            onClick={() =>
              navigate(
                attempt?.quizId ? `/learner-module?quizId=${attempt.quizId}` : "/learner-module"
              )
            }
          >
            Back to Module <ArrowRight />
          </button>
        </div>
      </main>
    </div>
  );
}

export default QuizResultsPage;
