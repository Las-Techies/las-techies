import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/AppNav";
import StepTabs from "../components/StepTabs";

const steps = ["Upload Content", "Configure Quiz", "Review & Publish"];
const stepRoutes = ["/upload-content", "/configure-quiz", "/review-publish"];

function ConfigureQuizPage() {
  const [moduleTitle, setModuleTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [passingScore, setPassingScore] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [questionCount, setQuestionCount] = useState("");
  const [difficulty, setDifficulty] = useState<"Easy" | "Medium" | "Hard">("Medium");
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (!isGenerating) return;

    const timeout = setTimeout(() => {
      const topicLabel = topic.trim() || "workplace safety";
      setGeneratedQuestions([
        `Q1 What is the first policy managers should explain in ${topicLabel}?`,
        `Q2 Which checklist item is most critical before starting ${topicLabel} tasks?`,
        `Q3 What is the best response when a teammate reports a ${topicLabel} concern?`,
      ]);
      setIsGenerating(false);
    }, 1400);

    return () => clearTimeout(timeout);
  }, [isGenerating, topic]);

  const handleGenerate = () => {
    setGeneratedQuestions([]);
    setIsGenerating(true);
  };

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={steps} activeIndex={1} stepRoutes={stepRoutes} />

        <section className="two-col">
          <div className="card quiz-settings-card">
            <h2>Quiz Settings</h2>
            <div className="settings-fields">
              <label>
                Module Title
                <input
                  value={moduleTitle}
                  onChange={(event) => setModuleTitle(event.target.value)}
                />
              </label>

              <label>
                Passing Score (%)
                <select
                  value={passingScore}
                  onChange={(event) => setPassingScore(event.target.value)}
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
                  value={timeLimit}
                  onChange={(event) => setTimeLimit(event.target.value)}
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
                  value={questionCount}
                  onChange={(event) => setQuestionCount(event.target.value)}
                >
                  <option value="">Select quantity</option>
                  <option value="5 questions">5 questions</option>
                  <option value="10 questions">10 questions</option>
                  <option value="15 questions">15 questions</option>
                  <option value="20 questions">20 questions</option>
                </select>
              </label>

              <label>
                Topic Focus
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. OSHA safety basics, PPE rules, fire safety"
                />
              </label>

              <label>Difficulty Mix</label>
              <div className="difficulty-chips">
                {(["Easy", "Medium", "Hard"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={difficulty === value ? "selected" : ""}
                    onClick={() => setDifficulty(value)}
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
              ) : (
                <p className="ai-empty">Click Done to generate questions from your settings.</p>
              )}
            </div>
            <input
              className="ai-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask AI what question topics you want to generate..."
            />
          </div>
        </section>

        <div className="page-actions">
          <Link className="secondary-btn btn-link" to="/upload-content">
            Back
          </Link>
          <Link className="primary-btn btn-link" to="/review-publish">
            Next: Review &amp; Publish
          </Link>
        </div>
      </main>
    </div>
  );
}

export default ConfigureQuizPage;
