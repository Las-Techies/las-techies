import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import WizardSteps from "../components/navigation/WizardSteps";
import { apiFetch, assignQuiz, listTeamMembers, type TeamMember } from "../api/client";
import { loadQuizConfig } from "../features/quiz/storage";
import {
  DEFAULT_QUIZ_CONFIG,
  type GeneratedQuiz,
  type QuizConfig,
} from "../features/quiz/types";
import { ArrowLeft, ClipboardIcon, FileTextIcon } from "../components/icons";

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

function ReviewPublishPage() {
  const navigate = useNavigate();
  const [quizConfig, setQuizConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false);
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [learnerEmail, setLearnerEmail] = useState("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<number[]>([]);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  // Which question's source document is open in the source modal (keyed by
  // prompt, since that's what identifies a row in questionDetails).
  const [sourceModalPrompt, setSourceModalPrompt] = useState<string | null>(null);
  const [sourceTextByDocumentId, setSourceTextByDocumentId] = useState<Record<number, string>>({});
  const [sourceLoadingByDocumentId, setSourceLoadingByDocumentId] = useState<Record<number, boolean>>(
    {}
  );
  const [sourceErrorByDocumentId, setSourceErrorByDocumentId] = useState<Record<number, string>>({});
  const highlightRefs = useRef<Record<string, HTMLElement | null>>({});

  function openSourceModal(questionPrompt: string, documentId: number) {
    setSourceModalPrompt(questionPrompt);
    void loadSourceText(documentId);
  }

  // Fetches "my most recently generated quiz" from the backend rather than
  // relying on a quizId cached in this browser, so the same account sees the
  // same in-progress quiz whichever device it logs in from.
  useEffect(() => {
    setQuizConfig(loadQuizConfig());

    setIsLoadingQuiz(true);
    apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest")
      .then((data) => setQuiz(data))
      .catch(() => setQuiz(null))
      .finally(() => setIsLoadingQuiz(false));
  }, []);

  // Real roster of new hires on this manager's team, so "Assign Learners"
  // maps to actual accounts (tracked assignments) instead of only free-text
  // email invites.
  useEffect(() => {
    setIsLoadingMembers(true);
    listTeamMembers("new_hire")
      .then((members) => setTeamMembers(members))
      .catch((err) => {
        setMembersError(err instanceof Error ? err.message : "Failed to load team members.");
      })
      .finally(() => setIsLoadingMembers(false));
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

  const addLearnerEmail = () => {
    const email = learnerEmail.trim().toLowerCase();
    if (!email) return;
    setSelectedLearners((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setLearnerEmail("");
  };

  const removeLearner = (email: string) => {
    setSelectedLearners((prev) => prev.filter((value) => value !== email));
  };

  const toggleLearner = (id: number) => {
    setSelectedLearnerIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  // Prefer values actually persisted on the quiz record; only fall back to
  // the locally-cached form state when no quiz has been generated/loaded yet
  // (e.g. this is a brand-new session with nothing saved server-side).
  const displayTitle = quiz?.title || quizConfig.moduleTitle || "Untitled Module";
  const displayPassingScore = quiz?.passingScore ?? quizConfig.passingScore;
  const displayTimeLimit = quiz?.timeLimitMinutes ?? quizConfig.timeLimit;
  const displayDueDateSource = quiz?.dueDate ?? quizConfig.dueDate;

  const formattedDueDate = useMemo(() => {
    if (!displayDueDateSource) return "Not set";
    const parsed = new Date(displayDueDateSource);
    if (Number.isNaN(parsed.getTime())) return displayDueDateSource;
    return parsed.toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }, [displayDueDateSource]);

  const isPublished = quiz?.status === "published";

  async function handleConfirmPublish() {
    if (!quiz) {
      // No real quiz to publish (e.g. still on the static fallback bank) —
      // just close the modal, there's nothing to persist.
      setIsPublishModalOpen(false);
      return;
    }

    setIsPublishing(true);
    setPublishError("");
    try {
      const updated = await apiFetch<GeneratedQuiz>(`/api/quizzes/${quiz.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      });

      // Email each not-yet-registered learner an invite link (tied to the
      // manager's team + this quiz server-side, so accepting auto-creates
      // their assignment). Failures are collected rather than aborting the
      // whole publish (the quiz is already published at this point).
      const inviteResults = await Promise.allSettled(
        selectedLearners.map((email) =>
          apiFetch("/api/invites", {
            method: "POST",
            body: JSON.stringify({ email, quizId: quiz.id }),
          })
        )
      );
      const failedInvites = inviteResults.filter((r) => r.status === "rejected");

      // Real, tracked assignments for learners already on the team — this
      // powers their assigned-quiz list with due dates and completion status.
      let assignmentFailed = false;
      if (selectedLearnerIds.length > 0) {
        try {
          await assignQuiz(quiz.id, selectedLearnerIds);
        } catch {
          assignmentFailed = true;
        }
      }

      setQuiz(updated);
      if (failedInvites.length > 0 || assignmentFailed) {
        // Keep the manager on the page (modal open) so they can see what
        // failed rather than silently moving on.
        const parts: string[] = [];
        if (failedInvites.length > 0) {
          parts.push(
            `${failedInvites.length} of ${selectedLearners.length} invite email(s) could not be sent`
          );
        }
        if (assignmentFailed) {
          parts.push("assigning to the selected team members failed");
        }
        setPublishError(`Quiz published, but ${parts.join(" and ")}.`);
        return;
      }

      // Published cleanly — reset the workflow and head back to the start so
      // the manager can build a brand-new quiz. The just-published quiz stays
      // saved server-side; the resume-latest logic simply skips published
      // quizzes, so Upload/Configure begin fresh.
      setIsPublishModalOpen(false);
      navigate("/upload-content");
    } catch (err) {
      setPublishError(
        err instanceof Error ? err.message : "Failed to publish quiz. Please try again."
      );
    } finally {
      setIsPublishing(false);
    }
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
          style={{
            background: "linear-gradient(180deg, #fff3a8 0%, #ffe873 100%)",
            padding: "1px 2px",
            borderRadius: "3px",
            scrollMarginTop: "40px",
            boxShadow: "0 0 0 2px rgba(255, 224, 102, 0.5)",
          }}
        >
          {match}
        </mark>
        {after}
      </>
    );
  }

  // Once the source modal is open and its text has loaded, scroll the
  // highlighted snippet into view automatically.
  useEffect(() => {
    if (!sourceModalPrompt) return;
    const activeItem = questionDetails.find((item) => item.prompt === sourceModalPrompt);
    const documentId = activeItem?.citation?.sourceDocumentId;
    if (!documentId || sourceLoadingByDocumentId[documentId]) return;

    requestAnimationFrame(() => {
      highlightRefs.current[sourceModalPrompt]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [sourceModalPrompt, questionDetails, sourceLoadingByDocumentId, sourceTextByDocumentId]);

  const activeSourceItem = sourceModalPrompt
    ? questionDetails.find((item) => item.prompt === sourceModalPrompt) ?? null
    : null;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="mgr-page">
        <div className="mgr-hero">
          <div>
            <h1>Upload + Generate</h1>
            <p>Review the module, assign learners, and publish.</p>
          </div>
          <div className="mgr-hero-right">
            <WizardSteps steps={["Upload", "Configure", "Review & Publish"]} activeIndex={2} />
          </div>
        </div>

        <section className="rp-grid">
          <div className="glass cfg-card rp-card">
            <div className="cfg-head">
              <span className="cfg-badge">
                <ClipboardIcon />
              </span>
              <h2>Review &amp; Publish</h2>
            </div>

          <div className="review-summary">
            <h3>Review Summary</h3>
            <div className="review-summary-grid">
              <div>
                <span>Quiz Title</span>
                <strong>{displayTitle}</strong>
              </div>
              <div>
                <span>Questions</span>
                <strong>{isLoadingQuiz ? "--" : questionDetails.length}</strong>
              </div>
              <div>
                <span>Passing Score</span>
                <strong>{displayPassingScore || "--"}%</strong>
              </div>
              <div>
                <span>Time Limit</span>
                <strong>{displayTimeLimit || "--"} min</strong>
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

          <div className="qcards rp-qcards">
            {isLoadingQuiz ? (
              <p className="cfg-empty">Loading quiz…</p>
            ) : (
              questionDetails.map((item, index) => (
                <article className="qcard" key={item.prompt}>
                  <div className="qcard-head">
                    <span className="qcard-num">{index + 1}</span>
                    <h3 className="qcard-prompt">{item.prompt}</h3>
                  </div>
                  <ul className="qopts">
                    {item.options.map((option, optIndex) => (
                      <li key={option.id} className="qopt">
                        <span className="qopt-radio" aria-hidden />
                        <span className="qopt-text">
                          {String.fromCharCode(65 + optIndex)}. {option.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="rp-answer">
                    <span className="rp-answer-label">Correct Answer:</span>
                    <span className="rp-answer-value">{item.answer}</span>
                    {item.citation ? (
                      <button
                        type="button"
                        className="rp-cite-btn"
                        title="View source"
                        aria-label={`View source for ${item.citation.sourceDocumentTitle}`}
                        onClick={() =>
                          openSourceModal(item.prompt, item.citation!.sourceDocumentId)
                        }
                      >
                        <FileTextIcon aria-hidden /> Source
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="assign-learners rp-assign">
            <h3>Assign Learners</h3>

            <p className="rp-assign-label">Already on your team</p>
            {isLoadingMembers ? (
              <p className="cfg-empty">Loading team roster…</p>
            ) : membersError ? (
              <p className="form-error">{membersError}</p>
            ) : teamMembers.length === 0 ? (
              <p className="cfg-empty">No new hires on your team yet — invite one below.</p>
            ) : (
              <div className="learner-roster">
                {teamMembers.map((member) => (
                  <label key={member.id} className="learner-roster-item">
                    <input
                      type="checkbox"
                      checked={selectedLearnerIds.includes(member.id)}
                      onChange={() => toggleLearner(member.id)}
                    />
                    <span className="learner-roster-name">
                      {member.firstName} {member.lastName}
                      <span className="learner-roster-email">{member.email}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <p className="rp-assign-label">Invite someone new</p>
            <div className="learner-email-input">
              <input
                type="email"
                placeholder="Enter learner's email"
                value={learnerEmail}
                onChange={(event) => setLearnerEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addLearnerEmail();
                  }
                }}
              />
              <button type="button" className="sf-btn" onClick={addLearnerEmail}>
                Add
              </button>
            </div>
            {selectedLearners.length > 0 ? (
              <div className="learner-chips">
                {selectedLearners.map((email) => (
                  <span key={email} className="learner-chip">
                    {email}
                    <button
                      type="button"
                      aria-label={`Remove ${email}`}
                      onClick={() => removeLearner(email)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          </div>

          <div className="mgr-foot" style={{ justifyContent: "center", gap: 18 }}>
            <Link className="ghost-btn btn-link" to="/configure-quiz">
              <ArrowLeft /> Back to Configure Quiz
            </Link>
            <button
              className="sf-btn"
              type="button"
              disabled={
                (selectedLearners.length === 0 && selectedLearnerIds.length === 0) ||
                isLoadingQuiz ||
                isPublished
              }
              onClick={() => setIsPublishModalOpen(true)}
            >
              {isPublished ? "Published" : "Publish"}
            </button>
          </div>
        </section>

        {activeSourceItem?.citation ? (
          <div
            className="modal-backdrop"
            role="dialog"
            aria-modal="true"
            onClick={() => setSourceModalPrompt(null)}
          >
            <div className="modal-card rp-source-modal" onClick={(event) => event.stopPropagation()}>
              <div className="rp-source-head">
                <div>
                  <span className="rp-source-eyebrow">Source document</span>
                  <h3>{activeSourceItem.citation.sourceDocumentTitle}</h3>
                </div>
                <button
                  type="button"
                  className="rp-source-close"
                  aria-label="Close source"
                  onClick={() => setSourceModalPrompt(null)}
                >
                  ×
                </button>
              </div>
              <div className="rp-source-body">
                {sourceLoadingByDocumentId[activeSourceItem.citation.sourceDocumentId] ? (
                  <p className="cfg-empty">Loading source…</p>
                ) : sourceErrorByDocumentId[activeSourceItem.citation.sourceDocumentId] ? (
                  <p className="form-error">
                    {sourceErrorByDocumentId[activeSourceItem.citation.sourceDocumentId]}
                  </p>
                ) : (
                  <div className="rp-source-page">
                    {renderHighlightedSource(
                      sourceTextByDocumentId[activeSourceItem.citation.sourceDocumentId] ??
                        "No extracted text available for this document.",
                      activeSourceItem.citation.sourceSnippet,
                      activeSourceItem.prompt
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {isPublishModalOpen ? (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card">
              <h3>Publish Module</h3>
              <p>
                Are you ready to publish this module to{" "}
                <strong>
                  {selectedLearnerIds.length + selectedLearners.length} learner
                  {selectedLearnerIds.length + selectedLearners.length === 1 ? "" : "s"}
                </strong>
                ?
              </p>
              {publishError ? <p className="form-error">{publishError}</p> : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={isPublishing}
                  onClick={() => {
                    setPublishError("");
                    setIsPublishModalOpen(false);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="sf-btn"
                  disabled={isPublishing}
                  onClick={handleConfirmPublish}
                >
                  {isPublishing ? "Publishing…" : "Confirm Publish"}
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
