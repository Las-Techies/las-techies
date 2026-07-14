import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { saveQuizConfig } from "../features/quiz/storage";
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
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  useEffect(() => {
    if (!isGenerating) return;

    const timeout = setTimeout(() => {
      const topicLabel = form.topic.trim() || "workplace safety";
      const count = Number.parseInt(form.questionCount, 10) || 3;
      const generated = Array.from({ length: count }, (_, index) => {
        if (index % 3 === 0) {
          return `What is the first policy managers should explain in ${topicLabel}?`;
        }
        if (index % 3 === 1) {
          return `Which checklist item is most critical before starting ${topicLabel} tasks?`;
        }
        return `What is the best response when a teammate reports a ${topicLabel} concern?`;
      });

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
      setIsGenerating(false);
    }, 1400);

    return () => clearTimeout(timeout);
  }, [form, isGenerating]);

  const updateForm = <K extends keyof QuizFormState>(field: K, value: QuizFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const isFormValid = Boolean(
    form.moduleTitle.trim() &&
      form.topic.trim() &&
      form.passingScore &&
      form.timeLimit &&
      form.questionCount &&
      form.dueDate
  );

  const handleGenerate = () => {
    if (!isFormValid) {
      setError("Please fill all fields before generating AI questions.");
      return;
    }
    setError("");
    setGeneratedQuestions([]);
    setIsGenerating(true);
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
                Topic Focus
                <input
                  value={form.topic}
                  onChange={(event) => updateForm("topic", event.target.value)}
                  placeholder="Quiz should focus on..."
                />
              </label>

              <label>Difficulty Mix</label>
              <div className="difficulty-chips">
                {(["Easy", "Medium", "Hard"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={form.difficulty === value ? "selected" : ""}
                    onClick={() => updateForm("difficulty", value)}
                  >
                    {value}
                  </button>
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
