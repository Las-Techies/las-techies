import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { streamQuizGeneration } from "../api/client";
import { loadUploadedDocuments, saveQuizConfig } from "../features/quiz/storage";
import type { QuizDifficulty } from "../features/quiz/types";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";

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
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);
  const [generationStatus, setGenerationStatus] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const updateForm = <K extends keyof QuizFormState>(field: K, value: QuizFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

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
    setGeneratedQuestions([]);
    setGenerationStatus("Starting generation…");
    setIsGenerating(true);

    const count = Number.parseInt(form.questionCount, 10) || 3;

    try {
      const quiz = await streamQuizGeneration(
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
            timeLimitMinutes: Number.parseInt(form.timeLimit, 10),
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

      const generated = quiz.questionsPayload.map((question) => question.prompt);
      setGeneratedQuestions(generated);
      saveQuizConfig({
        moduleTitle: form.moduleTitle.trim(),
        topic: form.topic.trim(),
        passingScore: Number.parseInt(form.passingScore, 10),
        timeLimit: Number.parseInt(form.timeLimit, 10),
        questionCount: count,
        dueDate: form.dueDate,
        difficulty: form.difficulty,
        generatedQuestions: generated,
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

  const handleNext = () => {
    if (generatedQuestions.length === 0) {
      setError("Please click Done and generate questions before continuing.");
      return;
    }
    setError("");
    navigate("/review-publish");
  };

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
                Time Limit (minutes)
                <select
                  value={form.timeLimit}
                  onChange={(event) => updateForm("timeLimit", event.target.value)}
                >
                  <option value="">Select time</option>
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
              ) : generatedQuestions.length > 0 ? (
                <div className="generated-questions">
                  {generatedQuestions.map((question) => (
                    <button key={question} type="button" className="question-chip selected">
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <div className="page-actions">
          <Link className="secondary-btn btn-link" to="/upload-content">
            Back
          </Link>
          <button className="primary-btn btn-link" type="button" onClick={handleNext}>
            Next: Review &amp; Publish
          </button>
        </div>
      </main>
    </div>
  );
}

export default ConfigureQuizPage;
