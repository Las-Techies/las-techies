import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { apiFetch, streamQuizGeneration } from "../api/client";
import { loadUploadedDocuments, saveQuizConfig } from "../features/quiz/storage";
import type { GeneratedQuiz, QuizDifficulty, QuizQuestion } from "../features/quiz/types";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";
import { PencilIcon, RegenerateIcon } from "../components/icons/QuizIcons";

const DIFFICULTY_VALUES: QuizDifficulty[] = ["Easy", "Medium", "Hard"];

function toDifficultyLabel(value: unknown): QuizDifficulty | null {
  if (typeof value !== "string") return null;
  return DIFFICULTY_VALUES.find((d) => d.toLowerCase() === value.toLowerCase()) ?? null;
}

type QuizFormState = {
  moduleTitle: string;
  topic: string;
  passingScore: string;
  timeLimit: string;
  questionCount: string;
  dueDate: string;
  difficulty: QuizDifficulty;
};

// Mirrors the difficulty guidance the backend gives the AI (see buildPrompt
// in backend/src/utils/prompts.ts), reworded for a manager reading it here
// instead of an AI following it.
const DIFFICULTY_DESCRIPTIONS: Record<QuizDifficulty, string> = {
  Easy: "Straightforward, fact-based questions about a single detail stated directly in the document — a name, step, tool, or definition.",
  Medium:
    "Questions that test understanding of how or why something works — connecting two steps, or applying a rule to a described scenario.",
  Hard: "Questions requiring reasoning across multiple parts of the document — edge cases, or the consequence of doing something incorrectly.",
};

function ConfigureQuizPage() {
  const [form, setForm] = useState<QuizFormState>({
    moduleTitle: "",
    topic: "",
    passingScore: "",
    timeLimit: "",
    questionCount: "",
    dueDate: "",
    difficulty: "Medium",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  // Whether we're still checking the backend for a previously generated
  // quiz to restore, on first mount only.
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(true);
  const [generationStatus, setGenerationStatus] = useState("");
  const [error, setError] = useState("");
  // Inline click-to-edit: at most one field (a question's prompt, or a
  // single option's text) is being edited at a time. Editing a field saves
  // automatically on blur/Enter — there's no separate edit form/Save button.
  const [editingField, setEditingField] = useState<
    | { questionId: number; kind: "prompt" }
    | { questionId: number; kind: "option"; optionId: number }
    | null
  >(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [savingQuestionId, setSavingQuestionId] = useState<number | null>(null);
  const [fieldErrorByQuestionId, setFieldErrorByQuestionId] = useState<Record<number, string>>(
    {}
  );
  const [regeneratingQuestionId, setRegeneratingQuestionId] = useState<number | null>(null);
  const [regenerateErrorByQuestionId, setRegenerateErrorByQuestionId] = useState<
    Record<number, string>
  >({});
  // Questions start collapsed (prompt only). Clicking the pencil icon
  // expands a question to show its options for viewing/editing.
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const updateForm = <K extends keyof QuizFormState>(field: K, value: QuizFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  // Restore whatever this manager most recently generated, so navigating
  // away (e.g. to Upload Content to add more documents) and back doesn't
  // wipe the settings and preview. The quiz is already saved server-side
  // the moment "Done" is clicked — this just looks it up, the same way
  // ReviewPublishPage and QuizResultsPage resume "my latest quiz".
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const latest = await apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest");
        if (!isMounted || !latest) return;

        setQuiz(latest);
        setForm((current) => ({
          moduleTitle: latest.title || current.moduleTitle,
          topic: latest.generationConfig?.topic ?? current.topic,
          passingScore:
            latest.passingScore != null ? String(latest.passingScore) : current.passingScore,
          timeLimit:
            latest.timeLimitMinutes != null
              ? String(latest.timeLimitMinutes)
              : current.timeLimit,
          questionCount:
            latest.questionsPayload.length > 0
              ? String(latest.questionsPayload.length)
              : current.questionCount,
          dueDate: latest.dueDate ? latest.dueDate.slice(0, 10) : current.dueDate,
          difficulty: toDifficultyLabel(latest.generationConfig?.difficulty) ?? current.difficulty,
        }));
      } catch {
        // Best-effort restore — no quiz yet, or the request failed. Either
        // way, just leave the form at its blank starting state.
      } finally {
        if (isMounted) setIsLoadingQuiz(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Topic Focus and Time Limit are intentionally excluded here — both are
  // optional. Leaving Topic Focus blank pulls questions from the whole
  // document; leaving Time Limit blank means the quiz has no time limit.
  const isFormValid = Boolean(
    form.moduleTitle.trim() &&
      form.passingScore &&
      form.questionCount &&
      form.dueDate
  );

  const handleGenerate = async () => {
    if (!isFormValid) {
      setError("Please fill all fields before generating AI questions.");
      return;
    }

    const documents = loadUploadedDocuments();
    const documentIds = documents.map((doc) => doc.id);
    if (documentIds.length === 0) {
      setError("Please upload a document first before generating questions.");
      return;
    }

    setError("");
    setQuiz(null);
    setGenerationStatus("Starting generation…");
    setIsGenerating(true);

    const count = Number.parseInt(form.questionCount, 10) || 3;

    try {
      const generatedQuiz = await streamQuizGeneration(
        {
          documentIds,
          config: {
            numQuestions: count,
            difficulty: form.difficulty.toLowerCase(),
            questionTypes: ["multiple_choice"],
            topic: form.topic.trim(),
          },
          metadata: {
            moduleTitle: form.moduleTitle.trim(),
            passingScore: Number.parseInt(form.passingScore, 10),
            ...(form.timeLimit
              ? { timeLimitMinutes: Number.parseInt(form.timeLimit, 10) }
              : {}),
            dueDate: form.dueDate,
          },
        },
        (event) => {
          if (event.type === "progress") {
            setGenerationStatus(
              event.attempt > 1
                ? `Retrying (attempt ${event.attempt})… generated ${event.questionsDetected} of ${event.totalQuestions} questions`
                : `Generating question ${Math.min(
                    event.questionsDetected + 1,
                    event.totalQuestions
                  )} of ${event.totalQuestions}…`
            );
          }
        }
      );

      setQuiz(generatedQuiz);
      saveQuizConfig({
        moduleTitle: form.moduleTitle.trim(),
        topic: form.topic.trim(),
        passingScore: Number.parseInt(form.passingScore, 10),
        // 0 means "no time limit" — see QuizConfig.timeLimit in features/quiz/types.ts.
        timeLimit: form.timeLimit ? Number.parseInt(form.timeLimit, 10) : 0,
        questionCount: count,
        dueDate: form.dueDate,
        difficulty: form.difficulty,
        generatedQuestions: generatedQuiz.questionsPayload.map((question) => question.prompt),
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate quiz. Please try again."
      );
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  const isMutatingQuestion = savingQuestionId !== null || regeneratingQuestionId !== null;

  const handleNext = () => {
    if (!quiz || quiz.questionsPayload.length === 0) {
      setError("Please click Done and generate questions before continuing.");
      return;
    }
    if (isMutatingQuestion) {
      setError("Please wait for your question edit to finish saving before continuing.");
      return;
    }
    setError("");
    navigate("/review-publish");
  };

  function startEditPrompt(question: QuizQuestion) {
    setEditingField({ questionId: question.id, kind: "prompt" });
    setFieldDraft(question.prompt);
  }

  function startEditOption(question: QuizQuestion, optionId: number, currentText: string) {
    setEditingField({ questionId: question.id, kind: "option", optionId });
    setFieldDraft(currentText);
  }

  function cancelFieldEdit() {
    setEditingField(null);
    setFieldDraft("");
  }

  // Sends the whole question object back (prompt + options + explanation +
  // citation) since that's what the PATCH endpoint expects, but only the one
  // field the user clicked into actually changes.
  //
  // Applies the change to local state immediately (optimistic update) so the
  // UI doesn't flicker back to the old value while the request is in
  // flight — this matters especially for the "mark correct" radio, since a
  // controlled input would otherwise visibly snap back to the old selection
  // for a moment. Rolls back to `previousQuiz` if the save fails.
  async function saveQuestion(previousQuiz: GeneratedQuiz, updatedQuestion: QuizQuestion) {
    setQuiz({
      ...previousQuiz,
      questionsPayload: previousQuiz.questionsPayload.map((existing) =>
        existing.id === updatedQuestion.id ? updatedQuestion : existing
      ),
    });

    setSavingQuestionId(updatedQuestion.id);
    setFieldErrorByQuestionId((prev) => {
      const next = { ...prev };
      delete next[updatedQuestion.id];
      return next;
    });
    try {
      const updated = await apiFetch<GeneratedQuiz>(
        `/api/quizzes/${previousQuiz.id}/questions/${updatedQuestion.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            prompt: updatedQuestion.prompt,
            options: updatedQuestion.options,
            explanation: updatedQuestion.explanation,
            citation: updatedQuestion.citation,
          }),
        }
      );
      setQuiz(updated);
    } catch (err) {
      setQuiz(previousQuiz);
      setFieldErrorByQuestionId((prev) => ({
        ...prev,
        [updatedQuestion.id]: err instanceof Error ? err.message : "Failed to save.",
      }));
    } finally {
      setSavingQuestionId(null);
    }
  }

  async function commitFieldEdit(question: QuizQuestion) {
    if (!quiz || !editingField || editingField.questionId !== question.id) return;

    const trimmed = fieldDraft.trim();
    if (trimmed === "") {
      cancelFieldEdit();
      return;
    }

    let updatedQuestion: QuizQuestion;
    if (editingField.kind === "prompt") {
      if (trimmed === question.prompt) {
        cancelFieldEdit();
        return;
      }
      updatedQuestion = { ...question, prompt: trimmed };
    } else {
      const original = question.options.find((option) => option.id === editingField.optionId);
      if (!original || trimmed === original.text) {
        cancelFieldEdit();
        return;
      }
      updatedQuestion = {
        ...question,
        options: question.options.map((option) =>
          option.id === editingField.optionId ? { ...option, text: trimmed } : option
        ),
      };
    }

    cancelFieldEdit();
    await saveQuestion(quiz, updatedQuestion);
  }

  async function setCorrectOption(question: QuizQuestion, optionId: number) {
    if (!quiz || question.options.find((option) => option.id === optionId)?.isCorrect) return;

    const updatedQuestion: QuizQuestion = {
      ...question,
      options: question.options.map((option) => ({
        ...option,
        isCorrect: option.id === optionId,
      })),
    };
    await saveQuestion(quiz, updatedQuestion);
  }

  function toggleExpanded(questionId: number) {
    setExpandedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return next;
    });
  }

  // Pressing Enter while editing a field means "I'm done" — collapse the
  // whole card back to its compact view, not just close the text box.
  function collapseQuestion(questionId: number) {
    setExpandedQuestionIds((prev) => {
      if (!prev.has(questionId)) return prev;
      const next = new Set(prev);
      next.delete(questionId);
      return next;
    });
  }

  async function handleRegenerate(questionId: number) {
    if (!quiz) return;

    // Regeneration replaces the question outright with no undo, so confirm
    // first — unlike the inline text edits, this isn't a quick "click to
    // fix a typo" action.
    const confirmed = window.confirm(
      "Replace this question with a new AI-generated one? This can't be undone."
    );
    if (!confirmed) return;

    setRegenerateErrorByQuestionId((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setRegeneratingQuestionId(questionId);
    try {
      const updated = await apiFetch<GeneratedQuiz>(
        `/api/quizzes/${quiz.id}/questions/${questionId}/regenerate`,
        { method: "POST" }
      );
      setQuiz(updated);
    } catch (err) {
      setRegenerateErrorByQuestionId((prev) => ({
        ...prev,
        [questionId]: err instanceof Error ? err.message : "Failed to regenerate question.",
      }));
    } finally {
      setRegeneratingQuestionId(null);
    }
  }

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={QUIZ_WORKFLOW_STEPS} activeIndex={1} stepRoutes={QUIZ_WORKFLOW_ROUTES} />

        <section className="two-col">
          <div className="card quiz-settings-card">
            <h2>Quiz Settings</h2>
            <div className="settings-fields">
              <label>
                Module Title
                <input
                  value={form.moduleTitle}
                  onChange={(event) => updateForm("moduleTitle", event.target.value)}
                />
              </label>

              <label>
                Passing Score (%)
                <select
                  value={form.passingScore}
                  onChange={(event) => updateForm("passingScore", event.target.value)}
                >
                  <option value="">Select score</option>
                  <option value="60">60</option>
                  <option value="70">70</option>
                  <option value="80">80</option>
                  <option value="90">90</option>
                  <option value="100">100</option>
                </select>
              </label>

              <label>
                Time Limit (minutes, optional)
                <select
                  value={form.timeLimit}
                  onChange={(event) => updateForm("timeLimit", event.target.value)}
                >
                  <option value="">No time limit</option>
                  <option value="15">15</option>
                  <option value="20">20</option>
                  <option value="30">30</option>
                  <option value="45">45</option>
                  <option value="60">60</option>
                </select>
              </label>

              <label>
                Number of Questions
                <select
                  value={form.questionCount}
                  onChange={(event) => updateForm("questionCount", event.target.value)}
                >
                  <option value="">Select quantity</option>
                  <option value="5">5 questions</option>
                  <option value="10">10 questions</option>
                  <option value="15">15 questions</option>
                  <option value="20">20 questions</option>
                </select>
              </label>

              <label>
                Due Date
                <input
                  type="date"
                  value={form.dueDate}
                  min={todayIso}
                  onChange={(event) => updateForm("dueDate", event.target.value)}
                />
              </label>

              <label>
                Topic Focus (optional)
                <input
                  value={form.topic}
                  onChange={(event) => updateForm("topic", event.target.value)}
                  placeholder="Leave blank for a general quiz, or e.g. &quot;password policy&quot;"
                />
              </label>

              <label>Difficulty Mix</label>
              <div className="difficulty-chips">
                {(["Easy", "Medium", "Hard"] as const).map((value) => (
                  <span className="difficulty-chip-wrap" key={value}>
                    <button
                      type="button"
                      className={form.difficulty === value ? "selected" : ""}
                      onClick={() => updateForm("difficulty", value)}
                    >
                      {value}
                    </button>
                    <span className="difficulty-tooltip" role="tooltip">
                      {DIFFICULTY_DESCRIPTIONS[value]}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="settings-done-row">
              <button type="button" className="done-icon-btn" onClick={handleGenerate}>
                <span aria-hidden>✓</span> Done
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <div className="card ai-preview-card">
            <h2>AI-Generated Questions Preview</h2>
            <div className="ai-preview-body">
              {isGenerating ? (
                <div className="ai-loading">
                  <div className="loading-line" />
                  <div className="loading-line" />
                  <div className="loading-line short" />
                  <p className="ai-loading-status">{generationStatus}</p>
                </div>
              ) : isLoadingQuiz ? (
                <p className="ai-loading-status">Checking for your last generated quiz…</p>
              ) : quiz && quiz.questionsPayload.length > 0 ? (
                <div className="review-list">
                  {quiz.questionsPayload.map((question, index) => {
                    const isEditingPrompt =
                      editingField?.questionId === question.id &&
                      editingField.kind === "prompt";
                    const isRegeneratingThisQuestion = regeneratingQuestionId === question.id;
                    const isSavingThisQuestion = savingQuestionId === question.id;
                    const isExpanded = expandedQuestionIds.has(question.id);

                    return (
                      <article className="review-question-card" key={question.id}>
                        <div className="review-question-header">
                          {isEditingPrompt ? (
                            <textarea
                              className="inline-edit-input prompt-edit-input"
                              autoFocus
                              value={fieldDraft}
                              onChange={(event) => setFieldDraft(event.target.value)}
                              onBlur={() => void commitFieldEdit(question)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void commitFieldEdit(question);
                                  collapseQuestion(question.id);
                                } else if (event.key === "Escape") {
                                  cancelFieldEdit();
                                }
                              }}
                            />
                          ) : isExpanded ? (
                            <h3
                              className="editable-text"
                              title="Click to edit"
                              onClick={() => startEditPrompt(question)}
                            >
                              Q{index + 1}. {question.prompt}
                            </h3>
                          ) : (
                            <h3>
                              Q{index + 1}. {question.prompt}
                            </h3>
                          )}
                          <div className="review-question-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              title={isExpanded ? "Collapse" : "Edit question"}
                              aria-label={isExpanded ? "Collapse question" : "Edit question"}
                              onClick={() => toggleExpanded(question.id)}
                            >
                              <PencilIcon aria-hidden />
                            </button>
                            <button
                              type="button"
                              className={`icon-btn ${isRegeneratingThisQuestion ? "spinning" : ""}`}
                              title="Regenerate question"
                              aria-label="Regenerate question"
                              disabled={isRegeneratingThisQuestion}
                              onClick={() => void handleRegenerate(question.id)}
                            >
                              <RegenerateIcon aria-hidden />
                            </button>
                          </div>
                        </div>

                        {regenerateErrorByQuestionId[question.id] ? (
                          <p className="form-error">{regenerateErrorByQuestionId[question.id]}</p>
                        ) : null}
                        {fieldErrorByQuestionId[question.id] ? (
                          <p className="form-error">{fieldErrorByQuestionId[question.id]}</p>
                        ) : null}

                        {isExpanded ? (
                          <>
                            <p className="options-hint">
                              Click <span aria-hidden>○</span> to mark the correct answer · click
                              the text to edit its wording
                            </p>
                            <ul className="editable-options">
                              {question.options.map((option) => {
                                const isEditingThisOption =
                                  editingField?.questionId === question.id &&
                                  editingField.kind === "option" &&
                                  editingField.optionId === option.id;

                                return (
                                  <li className="editable-option-row" key={option.id}>
                                    <input
                                      type="radio"
                                      name={`correct-option-${question.id}`}
                                      checked={option.isCorrect}
                                      title="Mark as the correct answer"
                                      aria-label="Mark as the correct answer"
                                      onChange={() => void setCorrectOption(question, option.id)}
                                    />
                                    {isEditingThisOption ? (
                                      <input
                                        type="text"
                                        className="inline-edit-input"
                                        autoFocus
                                        value={fieldDraft}
                                        onChange={(event) => setFieldDraft(event.target.value)}
                                        onBlur={() => void commitFieldEdit(question)}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void commitFieldEdit(question);
                                            collapseQuestion(question.id);
                                          } else if (event.key === "Escape") {
                                            cancelFieldEdit();
                                          }
                                        }}
                                      />
                                    ) : (
                                      <span
                                        className="editable-text"
                                        title="Click to edit"
                                        onClick={() =>
                                          startEditOption(question, option.id, option.text)
                                        }
                                      >
                                        {option.text}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </>
                        ) : null}
                        {isSavingThisQuestion ? <p className="subtle">Saving…</p> : null}
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="page-actions">
          <Link className="secondary-btn btn-link" to="/upload-content">
            Back
          </Link>
          <button
            className="primary-btn btn-link"
            type="button"
            disabled={isMutatingQuestion}
            title={isMutatingQuestion ? "Waiting for your question edit to save…" : undefined}
            onClick={handleNext}
          >
            {isMutatingQuestion ? "Saving…" : "Next: Review & Publish"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default ConfigureQuizPage;
