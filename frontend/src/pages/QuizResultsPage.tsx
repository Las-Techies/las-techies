import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
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
  const score = 80;

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
                    </p>
                    {question.explanation ? (
                      <p className="subtle">{question.explanation}</p>
                    ) : null}
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
