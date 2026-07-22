import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { apiFetch } from "../api/client";
import { findHighlightSpan } from "../features/quiz/citationMatch";
import { loadQuizAttempt, loadQuizConfig } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";

function QuizResultsPage() {
  const navigate = useNavigate();
  // The submitted attempt (questions + chosen answers) is the source of truth
  // for scoring. If it's missing (e.g. opened directly), we fall back to the
  // latest generated quiz and just show the answer key without a score.
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
            background: span.matchType === "exact" ? "#cfe3cf" : "#dbe7fb",
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
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load quiz.")
      )
      .finally(() => setLoading(false));
  }, [attempt]);

  const reviewQuestions: QuizQuestion[] =
    attempt?.questions ?? quiz?.questionsPayload ?? [];
  const userAnswers = attempt?.answers ?? {};
  const totalQuestions = reviewQuestions.length;
  const correctCount = reviewQuestions.reduce((count, question) => {
    const correctOption = question.options.find((option) => option.isCorrect);
    return count + (correctOption && userAnswers[question.id] === correctOption.id ? 1 : 0);
  }, 0);
  const incorrectCount = Math.max(totalQuestions - correctCount, 0);
  const score =
    attempt && totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const didPass = score >= passingScore;
  const submittedLabel = attempt
    ? new Date(attempt.submittedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const resultTitle = attempt?.title ?? quiz?.title ?? "OSHA Basics 2026";

  useEffect(() => {
    if (expandedCitationQuestionId === null) return;
    const expandedQuestion = reviewQuestions.find(
      (question) => question.id === expandedCitationQuestionId
    );
    const documentId = expandedQuestion?.citation?.sourceDocumentId;
    if (!documentId || sourceLoadingByDocumentId[documentId]) return;

    requestAnimationFrame(() => {
      highlightRefs.current[String(expandedCitationQuestionId)]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [expandedCitationQuestionId, reviewQuestions, sourceLoadingByDocumentId, sourceTextByDocumentId]);

  useEffect(() => {
    return () => {
      if (closePopoverTimerRef.current !== null) {
        window.clearTimeout(closePopoverTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Quiz Results</h1>
        <p className="subtle">
          {resultTitle} • {attempt ? `Submitted ${submittedLabel}` : "Not yet submitted"}
        </p>

        <section className="results-top">
          <div className="card score-card">
            <h3>SCORE</h3>
            {attempt ? (
              <>
                <div className="score-value">{score}%</div>
                <span className={`status ${didPass ? "success" : "fail"}`}>
                  {didPass ? "PASSED" : "FAILED"}
                </span>
                <p>Passing threshold: {passingScore}%</p>
              </>
            ) : (
              <>
                <div className="score-value">—</div>
                <p>Take the quiz to see your score.</p>
              </>
            )}
          </div>

          <div className="card breakdown-card">
            <h2>Score Breakdown</h2>
            <div className="breakdown-layout">
              <div className="topic-table">
                <div className="topic-header">
                  <span>Result</span>
                  <span>Questions</span>
                </div>
                <div className="topic-row">
                  <span className="topic-cell">
                    <i className="topic-dot dot-1" />
                    Answered correctly
                  </span>
                  <span className="wrong-cell">
                    {correctCount} / {totalQuestions}
                  </span>
                </div>
                <div className="topic-row">
                  <span className="topic-cell">
                    <i className="topic-dot dot-3" />
                    Needs review
                  </span>
                  <span className="wrong-cell">
                    {incorrectCount} / {totalQuestions}
                  </span>
                </div>
              </div>

              <div className="multi-donut">
                <div
                  className="ring ring-1"
                  style={{ "--pct": `${score}%` } as CSSProperties}
                />
                <div className="donut-core">
                  <span>{score}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Question Breakdown</h2>
          {loading ? <p className="subtle">Loading quiz…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}

          {!attempt ? (
            !loading && !error ? (
              <p className="subtle">
                Take the quiz to see the answer key and review explanations for each question.
              </p>
            ) : null
          ) : reviewQuestions.length > 0 ? (
            <div className="review-list">
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
                                      ? sourceErrorByDocumentId[
                                          question.citation.sourceDocumentId
                                        ]
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
          ) : null}
        </section>

        <div className="page-actions">
          <button
            className="secondary-btn"
            type="button"
            onClick={() =>
              navigate(attempt?.quizId ? `/quiz-taking?quizId=${attempt.quizId}` : "/quiz-taking")
            }
          >
            Retake Quiz
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={() =>
              navigate(
                attempt?.quizId ? `/learner-module?quizId=${attempt.quizId}` : "/learner-module"
              )
            }
          >
            Back to Module
          </button>
        </div>
      </main>
    </div>
  );
}

export default QuizResultsPage;
