import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import WizardSteps from "../components/navigation/WizardSteps";
import mascot from "../assets/panda-peek.png";
import {
  apiFetch,
  listTeamDocuments,
  streamQuizGeneration,
  type TeamDocument,
} from "../api/client";
import { loadDeselectedDocumentIds, saveQuizConfig } from "../features/quiz/storage";
import { useSlidingPill } from "../hooks/useSlidingPill";
import type { GeneratedQuiz, QuizDifficulty, QuizQuestion } from "../features/quiz/types";
import { PencilIcon, RegenerateIcon } from "../components/icons/QuizIcons";
import {
  ArrowLeft,
  ArrowRight,
  CalendarIcon,
  ChartBarIcon,
  CheckPlain,
  ChevronDown,
  ClockIcon,
  GearIcon,
  InfoIcon,
  ListIcon,
  SparkleIcon,
  TagIcon,
  TargetIcon,
  TitleIcon,
} from "../components/icons";

const DIFFICULTY_VALUES: QuizDifficulty[] = ["Easy", "Medium", "Hard"];

// Kept in sync with the backend's own cap (quizzes.controller.ts) — this is
// just the UI-facing half of it (input max + a friendly error instead of
// silently clamping); the backend still enforces it independently since a
// request could otherwise bypass this.
const MAX_QUIZ_QUESTIONS = 30;

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
    passingScore: "70",
    timeLimit: "",
    questionCount: "",
    dueDate: "",
    difficulty: "Medium",
  });
  const difficultyPill = useSlidingPill<HTMLSpanElement, HTMLSpanElement>(form.difficulty);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  // Questions revealed one-by-one as the model streams them, before the final
  // saved quiz arrives. Cleared when a new generation starts / finishes.
  const [streamingQuestions, setStreamingQuestions] = useState<QuizQuestion[]>([]);
  // Whether we're still checking the backend for a previously generated
  // quiz to restore, on first mount only.
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(true);
  const [generationStatus, setGenerationStatus] = useState("");
  // Real progress from the backend's SSE "progress" events (questions
  // detected so far in the LLM's streamed output vs. how many were asked
  // for) — drives the progress bar's fill %, not a fake/timed animation.
  const [generationProgress, setGenerationProgress] = useState<{
    questionsDetected: number;
    totalQuestions: number;
  } | null>(null);
  // True for a few seconds right after a generation this session finishes
  // successfully — powers the one-off mascot cameo below. Deliberately not
  // tied to just "hasQuestions", so restoring a previously-saved quiz on
  // page load doesn't replay the celebration every time.
  const [justGenerated, setJustGenerated] = useState(false);
  const [error, setError] = useState("");
  // Live team document library (every manager's uploads), pulled from the
  // backend so the manager generates from the same source set the deployed
  // app uses — not just a local cache.
  const [teamDocuments, setTeamDocuments] = useState<TeamDocument[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [documentsError, setDocumentsError] = useState("");
  // Which documents are unchecked for quiz generation (managed on the Upload
  // page). Read once on mount; stored as "deselected" so new uploads default
  // to checked.
  const [deselectedDocumentIds] = useState<Set<number>>(() => loadDeselectedDocumentIds());
  // The source-documents list collapses into an expandable row so the
  // settings card stays compact when many documents are selected.
  const [isDocsExpanded, setIsDocsExpanded] = useState(false);
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

  // Auto-dismisses the mascot cameo a few seconds after it appears, same as
  // a toast — it's a one-off celebration, not a permanent fixture.
  useEffect(() => {
    if (!justGenerated) return;
    const timer = window.setTimeout(() => setJustGenerated(false), 3200);
    return () => window.clearTimeout(timer);
  }, [justGenerated]);

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
        // A published quiz is finalized — don't resume it into the editor, so
        // that after publishing, starting the workflow again begins a fresh
        // (blank) quiz instead of reopening the one that was just published.
        if (!isMounted || !latest || latest.status === "published") return;

        setQuiz(latest);
        setForm((current) => ({
          moduleTitle: latest.title || current.moduleTitle,
          topic: latest.generationConfig?.topic ?? current.topic,
          passingScore:
            latest.passingScore != null ? String(latest.passingScore) : current.passingScore,
          timeLimit:
            latest.timeLimitMinutes != null
              ? String(latest.timeLimitMinutes)
              : latest.generationConfig
                ? "none"
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

  // Loads every "ready" document visible to the team (any manager's uploads)
  // from the backend, so this manager generates from the same live library
  // the deployed app does, then narrows to the checked subset.
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const documents = await listTeamDocuments();
        if (!isMounted) return;
        setTeamDocuments(documents.filter((doc) => doc.status.toLowerCase() === "ready"));
      } catch (err) {
        if (isMounted) {
          setDocumentsError(
            err instanceof Error ? err.message : "Failed to load your team's documents."
          );
        }
      } finally {
        if (isMounted) setIsLoadingDocuments(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // The documents this quiz will actually generate from — every "ready" team
  // document except the ones unchecked on the Upload Content page.
  const selectedDocuments = teamDocuments.filter((doc) => !deselectedDocumentIds.has(doc.id));

  // Topic Focus is intentionally excluded here — it's optional. Leaving it
  // blank just means the AI pulls questions from the whole document instead
  // of narrowing in on one topic.
  const isFormValid = Boolean(
    form.moduleTitle.trim() &&
      form.passingScore &&
      form.timeLimit &&
      form.questionCount &&
      form.dueDate
  );

  const handleGenerate = async () => {
    // Double-click guard: once a generation starts, ignore additional clicks
    // until the current streaming request finishes.
    if (isGenerating) return;

    if (!isFormValid) {
      setError("Please fill all fields before generating AI questions.");
      return;
    }

    // Respect the "use for quiz" checkboxes from the Upload page — generate
    // only from the live team documents the manager left checked.
    const documentIds = selectedDocuments.map((doc) => doc.id);
    if (documentIds.length === 0) {
      setError(
        teamDocuments.length === 0
          ? "Please upload a document first before generating questions."
          : "Please go back to Upload Content and check at least one document before generating questions."
      );
      return;
    }

    const parsedCount = Number.parseInt(form.questionCount, 10);
    const count = Number.isFinite(parsedCount) ? parsedCount : 3;
    if (count < 1 || count > MAX_QUIZ_QUESTIONS) {
      setError(`Number of questions must be between 1 and ${MAX_QUIZ_QUESTIONS}.`);
      return;
    }

    setError("");
    setQuiz(null);
    setStreamingQuestions([]);
    setGenerationStatus("Starting generation…");
    setGenerationProgress(null);
    setJustGenerated(false);
    setIsGenerating(true);

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
            timeLimitMinutes: form.timeLimit === "none" ? null : Number.parseInt(form.timeLimit, 10),
            dueDate: form.dueDate,
          },
        },
        (event) => {
          if (event.type === "progress") {
            const batchLabel =
              event.totalBatches > 1 ? ` (batch ${event.batch} of ${event.totalBatches})` : "";
            setGenerationStatus(
              event.attempt > 1
                ? `Retrying${batchLabel} (attempt ${event.attempt})… generating questions…`
                : `Generating questions…${batchLabel}`
            );
            setGenerationProgress({
              questionsDetected: event.questionsDetected,
              totalQuestions: event.totalQuestions,
            });
          } else if (event.type === "question") {
            // Place each question at its index so a retry (which re-streams
            // from index 0) overwrites rather than appends.
            setStreamingQuestions((prev) => {
              const next = prev.slice();
              next[event.index] = event.question;
              return next;
            });
          }
        }
      );

      setQuiz(generatedQuiz);
      setJustGenerated(true);
      saveQuizConfig({
        moduleTitle: form.moduleTitle.trim(),
        topic: form.topic.trim(),
        passingScore: Number.parseInt(form.passingScore, 10),
        timeLimit: form.timeLimit === "none" ? 0 : Number.parseInt(form.timeLimit, 10),
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
      setGenerationProgress(null);
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

  const hasQuestions = Boolean(quiz && quiz.questionsPayload.length > 0);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="mgr-page">
        <div className="mgr-hero">
          <div>
            <h1>Configure Quiz</h1>
            <p>Step 2 of 3</p>
          </div>
          <div className="mgr-hero-right">
            <WizardSteps steps={["Create", "Configure", "Review"]} activeIndex={1} />
          </div>
        </div>

        <section className="cfg-grid">
          <div className="glass cfg-card">
            <div className="cfg-head">
              <span className="cfg-badge">
                <GearIcon />
              </span>
              <h2>Quiz Settings</h2>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <TitleIcon />
              </span>
              <span className="cfg-field-label">Title</span>
              <span className="cfg-field-control">
                <input
                  style={{ flex: 1 }}
                  placeholder="Salesforce Security Best Practices"
                  value={form.moduleTitle}
                  onChange={(event) => updateForm("moduleTitle", event.target.value)}
                />
              </span>
            </div>

            <div className="cfg-field cfg-field-docs">
              <div className="cfg-docs-head">
                <span className="cfg-field-ic">
                  <ListIcon />
                </span>
                <span className="cfg-field-label">Source documents</span>
                <span className="cfg-field-control">
                  {isLoadingDocuments ? (
                    <span className="cfg-doc-summary">Loading your team's documents…</span>
                  ) : documentsError ? (
                    <span className="cfg-doc-summary error">{documentsError}</span>
                  ) : teamDocuments.length === 0 ? (
                    <span className="cfg-doc-summary">
                      No documents yet — <Link to="/upload-content">upload one first</Link>.
                    </span>
                  ) : selectedDocuments.length === 0 ? (
                    <span className="cfg-doc-summary error">
                      Nothing checked — <Link to="/upload-content">check a document</Link>.
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="cfg-doc-toggle"
                      aria-expanded={isDocsExpanded}
                      onClick={() => setIsDocsExpanded((open) => !open)}
                    >
                      <span className="cfg-doc-toggle-label">
                        {selectedDocuments.length}{" "}
                        {selectedDocuments.length === 1 ? "document" : "documents"}
                      </span>
                      <ChevronDown
                        className={`cfg-doc-chevron${isDocsExpanded ? " open" : ""}`}
                        aria-hidden
                      />
                    </button>
                  )}
                </span>
              </div>

              {selectedDocuments.length > 0 && isDocsExpanded ? (
                <div className="cfg-doc-panel">
                  <ul className="cfg-doc-list">
                    {selectedDocuments.map((doc) => (
                      <li key={doc.id} className="cfg-doc-item" title={doc.title}>
                        {doc.title}
                      </li>
                    ))}
                  </ul>
                  <Link className="cfg-doc-change" to="/upload-content">
                    Change selection
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <TargetIcon />
              </span>
              <span className="cfg-field-label">Passing score (%)</span>
              <span className="cfg-field-control">
                <input
                  type="range"
                  className="cfg-slider"
                  min={0}
                  max={100}
                  step={5}
                  value={Number(form.passingScore) || 0}
                  onChange={(event) => updateForm("passingScore", event.target.value)}
                />
                <span className="cfg-score-box">
                  <input
                    type="number"
                    className="cfg-score-input"
                    min={0}
                    max={100}
                    value={form.passingScore}
                    onChange={(event) => {
                      const raw = event.target.value;
                      if (raw === "") {
                        updateForm("passingScore", "");
                        return;
                      }
                      const clamped = Math.max(0, Math.min(100, Math.round(Number(raw))));
                      updateForm("passingScore", String(clamped));
                    }}
                  />
                  <span className="cfg-score-pct">%</span>
                </span>
              </span>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <ClockIcon />
              </span>
              <span className="cfg-field-label">Time limit</span>
              <span className="cfg-field-control">
                <select
                  style={{ flex: 1 }}
                  value={form.timeLimit}
                  onChange={(event) => updateForm("timeLimit", event.target.value)}
                >
                  <option value="" disabled>
                    Select…
                  </option>
                  <option value="none">None</option>
                  <option value="15">15 minutes</option>
                  <option value="20">20 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </span>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <ListIcon />
              </span>
              <span className="cfg-field-label">Number of questions</span>
              <span className="cfg-field-control">
                <input
                  type="number"
                  min={1}
                  max={MAX_QUIZ_QUESTIONS}
                  placeholder="e.g. 10"
                  style={{ width: 90 }}
                  value={form.questionCount}
                  onChange={(event) => updateForm("questionCount", event.target.value)}
                />
              </span>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <CalendarIcon />
              </span>
              <span className="cfg-field-label">Due date</span>
              <span className="cfg-field-control">
                <input
                  type="date"
                  value={form.dueDate}
                  min={todayIso}
                  onChange={(event) => updateForm("dueDate", event.target.value)}
                />
              </span>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <TagIcon />
              </span>
              <span className="cfg-field-label">Topic</span>
              <span className="cfg-field-control">
                <input
                  style={{ flex: 1 }}
                  placeholder="e.g. Salesforce Security"
                  value={form.topic}
                  onChange={(event) => updateForm("topic", event.target.value)}
                />
              </span>
            </div>

            <div className="cfg-field">
              <span className="cfg-field-ic">
                <ChartBarIcon />
              </span>
              <span className="cfg-field-label">Difficulty</span>
              <span className="cfg-field-control">
                <span className="diff-seg" ref={difficultyPill.containerRef}>
                  <span className="diff-seg-pill" ref={difficultyPill.pillRef} aria-hidden="true" />
                  {(["Easy", "Medium", "Hard"] as const).map((value) => (
                    <span className="diff-opt" key={value}>
                      <button
                        type="button"
                        ref={difficultyPill.setItemRef(value)}
                        className={form.difficulty === value ? "on" : ""}
                        onClick={() => updateForm("difficulty", value)}
                      >
                        {value}
                      </button>
                      <span className="diff-tip" role="tooltip">
                        <span className="diff-tip-card">
                          <span className="diff-tip-head">
                            <span className="diff-tip-ic">
                              <InfoIcon />
                            </span>
                            <span className="diff-tip-title">{value}</span>
                          </span>
                          <span className="diff-tip-body">
                            {DIFFICULTY_DESCRIPTIONS[value]}
                          </span>
                          <span className="diff-tip-arrow" aria-hidden />
                        </span>
                      </span>
                    </span>
                  ))}
                </span>
              </span>
            </div>

            <div className="cfg-done-row">
              <button
                type="button"
                className="sf-btn"
                onClick={handleGenerate}
                disabled={isGenerating}
                aria-busy={isGenerating}
              >
                <CheckPlain /> {hasQuestions ? "Regenerate" : "Generate"}
              </button>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </div>

          <div className="cfg-ai-col">
            <img
              className={`mgr-peek ${justGenerated ? "mgr-peek-celebrate" : ""}`}
              src={mascot}
              alt=""
              aria-hidden
            />
            {justGenerated && hasQuestions ? (
              <div className="gen-complete-bubble gen-complete-bubble-peek" role="status">
                All {quiz!.questionsPayload.length} question
                {quiz!.questionsPayload.length === 1 ? "" : "s"}{" "}
                {quiz!.questionsPayload.length === 1 ? "is" : "are"} ready!
              </div>
            ) : null}
            <div className="glass cfg-card">
            <div className="cfg-head">
              <span className="cfg-badge ai">
                <SparkleIcon />
              </span>
              <h2>AI-Generated Questions</h2>
              <span className="ai-tag">AI</span>
            </div>

            {isLoadingQuiz && !isGenerating ? (
              <p className="cfg-empty">Checking for your last generated quiz…</p>
            ) : null}

            {!isLoadingQuiz && !hasQuestions && !isGenerating ? (
              <p className="cfg-empty">
                Fill in the settings and click Generate to create AI questions from your uploaded
                content.
              </p>
            ) : null}

            <div className="qcards">
              {hasQuestions
                ? quiz!.questionsPayload.map((question, index) => {
                    const isEditingPrompt =
                      editingField?.questionId === question.id && editingField.kind === "prompt";
                    const isRegeneratingThisQuestion = regeneratingQuestionId === question.id;
                    const isSavingThisQuestion = savingQuestionId === question.id;
                    const isExpanded = !expandedQuestionIds.has(question.id);

                    return (
                      <article className="qcard" key={question.id}>
                        <div className="qcard-head">
                          <span className="qcard-num">{index + 1}</span>
                          {isEditingPrompt ? (
                            <textarea
                              className="inline-edit-input qcard-prompt"
                              autoFocus
                              value={fieldDraft}
                              onChange={(event) => setFieldDraft(event.target.value)}
                              onBlur={() => void commitFieldEdit(question)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  void commitFieldEdit(question);
                                } else if (event.key === "Escape") {
                                  cancelFieldEdit();
                                }
                              }}
                            />
                          ) : (
                            <h3
                              className="qcard-prompt editable-text"
                              title="Click to edit"
                              onClick={() => startEditPrompt(question)}
                            >
                              {question.prompt}
                            </h3>
                          )}
                          <div className="qcard-actions">
                            <button
                              type="button"
                              className="qcard-icon-btn"
                              title="Edit question"
                              aria-label="Edit question"
                              onClick={() => startEditPrompt(question)}
                            >
                              <PencilIcon aria-hidden />
                            </button>
                            <button
                              type="button"
                              className={`qcard-icon-btn ${isRegeneratingThisQuestion ? "spinning" : ""}`}
                              title="Regenerate question"
                              aria-label="Regenerate question"
                              disabled={isRegeneratingThisQuestion}
                              onClick={() => void handleRegenerate(question.id)}
                            >
                              <RegenerateIcon aria-hidden />
                            </button>
                            <button
                              type="button"
                              className="qcard-icon-btn"
                              title={isExpanded ? "Collapse" : "Expand"}
                              aria-label={isExpanded ? "Collapse question" : "Expand question"}
                              onClick={() => toggleExpanded(question.id)}
                              style={{
                                transform: isExpanded ? "rotate(180deg)" : undefined,
                              }}
                            >
                              <ChevronDown aria-hidden />
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
                          <ul className="qopts">
                            {question.options.map((option, optIndex) => {
                              const isEditingThisOption =
                                editingField?.questionId === question.id &&
                                editingField.kind === "option" &&
                                editingField.optionId === option.id;
                              const letter = String.fromCharCode(65 + optIndex);

                              return (
                                <li
                                  key={option.id}
                                  className={`qopt ${option.isCorrect ? "correct" : ""}`}
                                >
                                  <button
                                    type="button"
                                    className="qopt-radio"
                                    title="Mark as the correct answer"
                                    aria-label="Mark as the correct answer"
                                    onClick={() => void setCorrectOption(question, option.id)}
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
                                        } else if (event.key === "Escape") {
                                          cancelFieldEdit();
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="qopt-text editable-text"
                                      title="Click to edit"
                                      onClick={() => startEditOption(question, option.id, option.text)}
                                    >
                                      {letter}. {option.text}
                                    </span>
                                  )}
                                  {option.isCorrect ? <CheckPlain className="qopt-check" /> : null}
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                        {isSavingThisQuestion ? <p className="subtle">Saving…</p> : null}
                      </article>
                    );
                  })
                : null}

              {isGenerating
                ? streamingQuestions.map((question, index) =>
                    question ? (
                      <article className="qcard qcard-stream" key={question.id ?? index}>
                        <div className="qcard-head">
                          <span className="qcard-num">{index + 1}</span>
                          <h3 className="qcard-prompt">{question.prompt}</h3>
                        </div>
                        <ul className="qopts">
                          {question.options.map((option, optIndex) => (
                            <li
                              key={option.id ?? optIndex}
                              className={`qopt ${option.isCorrect ? "correct" : ""}`}
                            >
                              <span className="qopt-radio" aria-hidden />
                              <span className="qopt-text">
                                {String.fromCharCode(65 + optIndex)}. {option.text}
                              </span>
                              {option.isCorrect ? <CheckPlain className="qopt-check" /> : null}
                            </li>
                          ))}
                        </ul>
                      </article>
                    ) : null
                  )
                : null}

              {isGenerating ? (
                <div className="qcard-generating">
                  <SparkleIcon style={{ width: 18, height: 18 }} />
                  <div className="gen-progress-track">
                    <div
                      className="gen-progress-fill"
                      style={{
                        width: `${
                          generationProgress
                            ? Math.min(
                                100,
                                Math.round(
                                  (generationProgress.questionsDetected /
                                    Math.max(1, generationProgress.totalQuestions)) *
                                    100
                                )
                              )
                            : 4
                        }%`,
                      }}
                    />
                  </div>
                  <span style={{ whiteSpace: "nowrap" }}>
                    {generationStatus || "Generating questions…"}
                    {generationProgress
                      ? ` (${generationProgress.questionsDetected} of ${generationProgress.totalQuestions})`
                      : ""}
                  </span>
                </div>
              ) : null}
            </div>
            </div>
          </div>
        </section>

        <div className="mgr-foot" style={{ justifyContent: "center", gap: 18 } as CSSProperties}>
          <Link className="ghost-btn btn-link" to="/upload-content">
            <ArrowLeft /> Back
          </Link>
          <button
            className="sf-btn"
            type="button"
            disabled={isMutatingQuestion}
            title={isMutatingQuestion ? "Waiting for your question edit to save…" : undefined}
            onClick={handleNext}
          >
            {isMutatingQuestion ? "Saving…" : "Next: Review"} <ArrowRight />
          </button>
        </div>
      </main>
    </div>
  );
}

export default ConfigureQuizPage;
