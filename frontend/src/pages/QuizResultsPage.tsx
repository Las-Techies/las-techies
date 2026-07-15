import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import AppNav from "../components/navigation/AppNav";
import { apiFetch } from "../api/client";
import { loadGeneratedQuizId, loadQuizConfig } from "../features/quiz/storage";
import type { GeneratedQuiz } from "../features/quiz/types";

const breakdownRows = [
  { topic: "PPE Requirements", wrong: "0 / 3", ringPercent: 100, dotClass: "dot-1" },
  { topic: "Fire Safety", wrong: "1 / 3", ringPercent: 66, dotClass: "dot-2" },
  { topic: "Hazmat Procedures", wrong: "1 / 4", ringPercent: 75, dotClass: "dot-3" },
];

function QuizResultsPage() {
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
  const score = 80;

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
    const normalizedSource = sourceText ?? "";
    const normalizedSnippet = snippet?.trim() ?? "";
    if (!normalizedSnippet) return normalizedSource;

    const start = normalizedSource.indexOf(normalizedSnippet);
    if (start === -1) return normalizedSource;

    const end = start + normalizedSnippet.length;
    const before = normalizedSource.slice(0, start);
    const match = normalizedSource.slice(start, end);
    const after = normalizedSource.slice(end);

    return (
      <>
        {before}
        <mark
          ref={(el) => {
            highlightRefs.current[String(questionId)] = el;
          }}
          style={{ background: "#cfe3cf", padding: "0 2px" }}
        >
          {match}
        </mark>
        {after}
      </>
    );
  }

  useEffect(() => {
    setPassingScore(loadQuizConfig().passingScore);

    const quizId = loadGeneratedQuizId();
    if (quizId === null) return;

    setLoading(true);
    apiFetch<GeneratedQuiz>(`/api/quizzes/${quizId}`)
      .then((data) => setQuiz(data))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load quiz.")
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (expandedCitationQuestionId === null || !quiz) return;
    const expandedQuestion = quiz.questionsPayload.find(
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
  }, [expandedCitationQuestionId, quiz, sourceLoadingByDocumentId, sourceTextByDocumentId]);

  useEffect(() => {
    return () => {
      if (closePopoverTimerRef.current !== null) {
        window.clearTimeout(closePopoverTimerRef.current);
      }
    };
  }, []);

  const didPass = score >= passingScore;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Quiz Results</h1>
        <p className="subtle">{quiz?.title ?? "OSHA Basics 2026"} • Submitted Jul 2, 2026</p>

        <section className="results-top">
          <div className="card score-card">
            <h3>SCORE</h3>
            <div className="score-value">{score}%</div>
            <span className={`status ${didPass ? "success" : "fail"}`}>
              {didPass ? "PASSED" : "FAILED"}
            </span>
            <p>Passing threshold: {passingScore}%</p>
          </div>

          <div className="card breakdown-card">
            <h2>Score Breakdown</h2>
            <div className="breakdown-layout">
              <div className="topic-table">
                <div className="topic-header">
                  <span>Topic</span>
                  <span>Wrong</span>
                </div>
                {breakdownRows.map((row) => (
                  <div className="topic-row" key={row.topic}>
                    <span className="topic-cell">
                      <i className={`topic-dot ${row.dotClass}`} />
                      {row.topic}
                    </span>
                    <span className="wrong-cell">{row.wrong}</span>
                  </div>
                ))}
              </div>

              <div className="multi-donut">
                <div
                  className="ring ring-1"
                  style={{ "--pct": `${breakdownRows[0].ringPercent}%` } as CSSProperties}
                >
                  <span className="ring-label">100%</span>
                </div>
                <div
                  className="ring ring-2"
                  style={{ "--pct": `${breakdownRows[1].ringPercent}%` } as CSSProperties}
                >
                  <span className="ring-label">66%</span>
                </div>
                <div
                  className="ring ring-3"
                  style={{ "--pct": `${breakdownRows[2].ringPercent}%` } as CSSProperties}
                >
                  <span className="ring-label">75%</span>
                </div>
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

          {quiz ? (
            <div className="review-list">
              {quiz.questionsPayload.map((question, index) => {
                const correct = question.options.find((option) => option.isCorrect);
                return (
                  <article className="review-question-card" key={question.id}>
                    <h3>
                      Q{index + 1}. {question.prompt}
                    </h3>
                    <ul>
                      {question.options.map((option) => (
                        <li key={option.id}>
                          {option.isCorrect ? "✓ " : ""}
                          {option.text}
                        </li>
                      ))}
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
          ) : !loading && !error ? (
            <>
              <p className="ok">✓ What is the minimum PPE requirement for Zone A?</p>
              <p className="bad">
                ✕ How often must fire extinguishers be inspected according to OSHA 2026 guidelines?
              </p>
              <p className="ok">
                ✓ Which class of fire extinguisher is required for chemical fires involving metals?
              </p>
            </>
          ) : null}
        </section>

        <div className="page-actions">
          <button className="secondary-btn" type="button">
            Retake Quiz
          </button>
          <button className="primary-btn" type="button">
            Download Certificate
          </button>
        </div>
      </main>
    </div>
  );
}

export default QuizResultsPage;
