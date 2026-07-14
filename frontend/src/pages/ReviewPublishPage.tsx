import { useEffect, useMemo, useState } from "react";
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
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  useEffect(() => {
    setQuizConfig(loadQuizConfig());

    const quizId = loadGeneratedQuizId();
    if (quizId === null) return;

    apiFetch<GeneratedQuiz>(`/api/quizzes/${quizId}`)
      .then((data) => setQuiz(data))
      .catch(() => setQuiz(null));
  }, []);

  // Prefer the real generated quiz (with real options + correct answers);
  // fall back to the static bank only when no quiz has been generated.
  const questionDetails = useMemo(() => {
    if (quiz && quiz.questionsPayload.length > 0) {
      return quiz.questionsPayload.map((question) => ({
        prompt: question.prompt,
        options: question.options.map((option) => option.text),
        answer: question.options.find((option) => option.isCorrect)?.text ?? "N/A",
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
        options: fromBank.options,
        answer: fromBank.answer,
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
                <strong>{questionDetails.length}</strong>
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
            {questionDetails.map((item, index) => (
              <article className="review-question-card" key={item.prompt}>
                <h3>
                  Q{index + 1}. {item.prompt}
                </h3>
                <ul>
                  {item.options.map((option) => (
                    <li key={option}>{option}</li>
                  ))}
                </ul>
                <p>
                  <strong>Correct Answer:</strong> {item.answer}
                </p>
              </article>
            ))}
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
              disabled={selectedLearners.length === 0}
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
