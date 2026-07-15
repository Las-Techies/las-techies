import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { apiFetch } from "../api/client";
import { loadGeneratedQuizId, loadQuizConfig } from "../features/quiz/storage";
import {
  DEFAULT_QUIZ_CONFIG,
  type GeneratedQuiz,
  type QuizConfig,
} from "../features/quiz/types";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";

const questionBankDefault = [
  {
    prompt: "What is the minimum PPE requirement for Zone A?",
    options: ["Safety glasses only", "Hard hat + safety glasses", "Steel-toe boots only", "No PPE required"],
    answer: "Hard hat + safety glasses",
  },
  {
    prompt: "How often must fire extinguishers be inspected?",
    options: ["Monthly", "Quarterly", "Annually", "Only after incidents"],
    answer: "Monthly",
  },
  {
    prompt: "Which class of extinguisher is used for metal fires?",
    options: ["Class A", "Class B", "Class C", "Class D"],
    answer: "Class D",
  },
  {
    prompt: "What should a new hire do before operating machinery?",
    options: ["Read labels only", "Ask a teammate", "Complete safety checklist and manager sign-off", "Start with low speed"],
    answer: "Complete safety checklist and manager sign-off",
  },
  {
    prompt: "Where should incidents be documented?",
    options: ["Private notes", "Safety incident log in team portal", "Email only", "No formal report needed"],
    answer: "Safety incident log in team portal",
  },
];

const learnerPool = [
  "Ariana Lopez",
  "Daniel Torres",
  "Mia Gonzalez",
  "Carlos Rivera",
  "Sofia Martinez",
  "Isabella Cruz",
];

function ReviewPublishPage() {
  const [quizConfig, setQuizConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [hoveredCitationQuestion, setHoveredCitationQuestion] = useState<string | null>(null);
  const [expandedCitationQuestion, setExpandedCitationQuestion] = useState<string | null>(null);
  const [sourceTextByDocumentId, setSourceTextByDocumentId] = useState<Record<number, string>>({});
  const [sourceLoadingByDocumentId, setSourceLoadingByDocumentId] = useState<Record<number, boolean>>(
    {}
  );
  const [sourceErrorByDocumentId, setSourceErrorByDocumentId] = useState<Record<number, string>>({});
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});
  const closePopoverTimerRef = useRef<number | null>(null);

  function openCitationPopover(questionPrompt: string) {
    if (closePopoverTimerRef.current !== null) {
      window.clearTimeout(closePopoverTimerRef.current);
      closePopoverTimerRef.current = null;
    }
    setHoveredCitationQuestion(questionPrompt);
  }

  function scheduleCitationPopoverClose() {
    if (closePopoverTimerRef.current !== null) {
      window.clearTimeout(closePopoverTimerRef.current);
    }
    closePopoverTimerRef.current = window.setTimeout(() => {
      setHoveredCitationQuestion(null);
      closePopoverTimerRef.current = null;
    }, 160);
  }

  useEffect(() => {
    setQuizConfig(loadQuizConfig());

    const quizId = loadGeneratedQuizId();
    if (quizId === null) return;

    setIsLoadingQuiz(true);
    apiFetch<GeneratedQuiz>(`/api/quizzes/${quizId}`)
      .then((data) => setQuiz(data))
      .catch(() => setQuiz(null))
      .finally(() => setIsLoadingQuiz(false));
  }, []);

  // Prefer the real generated quiz (with real options + correct answers);
  // fall back to the static bank only when no quiz has been generated.
  const questionDetails = useMemo(() => {
    if (quiz && quiz.questionsPayload.length > 0) {
      return quiz.questionsPayload.map((question) => ({
        prompt: question.prompt,
        options: question.options.map((option) => ({
          id: option.id,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
        answer: question.options.find((option) => option.isCorrect)?.text ?? "N/A",
        citation: question.citation,
      }));
    }

    const prompts = (
      quizConfig.generatedQuestions.length > 0
        ? quizConfig.generatedQuestions
        : questionBankDefault.map((q) => q.prompt)
    ).slice(0, quizConfig.questionCount);

    return prompts.map((question, index) => {
      const fromBank = questionBankDefault[index % questionBankDefault.length];
      const cleanPrompt = question.replace(/^Q\d+[\s.:,-]*/i, "").trim();
      return {
        prompt: cleanPrompt,
        options: fromBank.options.map((optionText, optionIndex) => ({
          id: optionIndex + 1,
          text: optionText,
          isCorrect: optionText === fromBank.answer,
        })),
        answer: fromBank.answer,
        citation: undefined,
      };
    });
  }, [quiz, quizConfig.generatedQuestions, quizConfig.questionCount]);

  const toggleLearner = (name: string) => {
    setSelectedLearners((prev) =>
      prev.includes(name) ? prev.filter((value) => value !== name) : [...prev, name]
    );
  };

  const formattedDueDate = useMemo(() => {
    if (!quizConfig.dueDate) return "Not set";
    const parsed = new Date(quizConfig.dueDate);
    if (Number.isNaN(parsed.getTime())) return quizConfig.dueDate;
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }, [quizConfig.dueDate]);

  const selectedLearnerSet = useMemo(() => new Set(selectedLearners), [selectedLearners]);

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

  function renderHighlightedSource(sourceText: string, snippet: string, questionPrompt: string) {
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
            highlightRefs.current[questionPrompt] = el;
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
    if (!expandedCitationQuestion) return;
    const expandedItem = questionDetails.find((item) => item.prompt === expandedCitationQuestion);
    const documentId = expandedItem?.citation?.sourceDocumentId;
    if (!documentId || sourceLoadingByDocumentId[documentId]) return;

    requestAnimationFrame(() => {
      highlightRefs.current[expandedCitationQuestion]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [expandedCitationQuestion, questionDetails, sourceLoadingByDocumentId, sourceTextByDocumentId]);

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
        <h1>Upload + Generate</h1>
        <StepTabs steps={QUIZ_WORKFLOW_STEPS} activeIndex={2} stepRoutes={QUIZ_WORKFLOW_ROUTES} />

        <section className="card review-publish-card">
          <h2>Review &amp; Publish</h2>

          <div className="review-summary">
            <h3>Review Summary</h3>
            <div className="review-summary-grid">
              <div>
                <span>Module</span>
                <strong>{quizConfig.moduleTitle || "Untitled Module"}</strong>
              </div>
              <div>
                <span>Questions</span>
                <strong>{isLoadingQuiz ? "--" : questionDetails.length}</strong>
              </div>
              <div>
                <span>Passing Score</span>
                <strong>{quizConfig.passingScore || "--"}%</strong>
              </div>
              <div>
                <span>Time Limit</span>
                <strong>{quizConfig.timeLimit || "--"} min</strong>
              </div>
              <div>
                <span>Topic</span>
                <strong>{quizConfig.topic || "General"}</strong>
              </div>
              <div>
                <span>Due Date</span>
                <strong>{formattedDueDate}</strong>
              </div>
            </div>
          </div>

          <div className="review-list">
            {isLoadingQuiz ? (
              <p className="review-loading">Loading quiz…</p>
            ) : (
              questionDetails.map((item, index) => (
                <article className="review-question-card" key={item.prompt}>
                  <h3>
                    Q{index + 1}. {item.prompt}
                  </h3>
                  <ul>
                    {item.options.map((option) => (
                      <li key={option.id}>
                        {option.text}
                      </li>
                    ))}
                  </ul>
                  <p>
                    <strong>Correct Answer:</strong> {item.answer}
                    {item.citation ? (
                      <span
                        style={{ position: "relative", display: "inline-flex", marginLeft: "8px" }}
                        onMouseEnter={() => openCitationPopover(item.prompt)}
                        onMouseLeave={scheduleCitationPopoverClose}
                      >
                        <button
                          type="button"
                          aria-label={`View source for ${item.citation.sourceDocumentTitle}`}
                          onFocus={() => openCitationPopover(item.prompt)}
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
                        {hoveredCitationQuestion === item.prompt ? (
                          <div
                            className="citation-box"
                            role="tooltip"
                            onMouseEnter={() => openCitationPopover(item.prompt)}
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
                              Document title: {item.citation.sourceDocumentTitle}
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
                              {item.citation.sourceSnippet}
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
                                  const documentId = item.citation!.sourceDocumentId;
                                  const willExpand = expandedCitationQuestion !== item.prompt;
                                  setExpandedCitationQuestion((prev) =>
                                    prev === item.prompt ? null : item.prompt
                                  );
                                  if (willExpand) {
                                    void loadSourceText(documentId);
                                  }
                                }}
                              >
                                {expandedCitationQuestion === item.prompt
                                  ? "Hide source"
                                  : "View source"}
                              </a>
                            </div>
                            {expandedCitationQuestion === item.prompt ? (
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
                                {sourceLoadingByDocumentId[item.citation.sourceDocumentId]
                                  ? "Loading source..."
                                  : sourceErrorByDocumentId[item.citation.sourceDocumentId]
                                    ? sourceErrorByDocumentId[item.citation.sourceDocumentId]
                                    : renderHighlightedSource(
                                        sourceTextByDocumentId[item.citation.sourceDocumentId] ??
                                          "No extracted text available for this document.",
                                        item.citation.sourceSnippet,
                                        item.prompt
                                      )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </span>
                    ) : null}
                  </p>
                  {!item.citation ? <p className="subtle">Source unavailable</p> : null}
                </article>
              ))
            )}
          </div>

          <div className="assign-learners">
            <h3>Assign Learners</h3>
            <div className="learner-select-box">
              {learnerPool.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={selectedLearnerSet.has(name) ? "selected" : ""}
                  onClick={() => toggleLearner(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="review-actions">
            <Link className="secondary-btn btn-link" to="/configure-quiz">
              Back to Configure Quiz
            </Link>
            <button
              className="primary-btn btn-link"
              type="button"
              disabled={selectedLearners.length === 0 || isLoadingQuiz}
              onClick={() => setIsPublishModalOpen(true)}
            >
              Publish
            </button>
          </div>
        </section>

        {isPublishModalOpen ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3>Publish Module</h3>
              <p>
                Are you ready to publish this module to{" "}
                {selectedLearners.length > 0 ? (
                  <strong>{selectedLearners.join(", ")}</strong>
                ) : (
                  <strong>the selected learners</strong>
                )}
                ?
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setIsPublishModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => setIsPublishModalOpen(false)}
                >
                  Confirm Publish
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default ReviewPublishPage;
