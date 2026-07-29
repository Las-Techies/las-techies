import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import mascot from "../assets/panda-cheer-fullhat.png";
import {
  getDocumentDetail,
  listAssignedQuizzes,
  type AssignedQuiz,
  type CompleteQuizAssignmentResult,
} from "../api/client";
import { isMarkdownSource, openSourceUrl } from "../features/documents/source";
import { findHighlightSpan } from "../features/quiz/citationMatch";
import { useLastNonNull, useModalTransition } from "../hooks/useModalTransition";
import { loadQuizAttempt, loadQuizConfig } from "../features/quiz/storage";
import type { QuizQuestion } from "../features/quiz/types";
import {
  ArrowRight,
  CheckCircleIcon,
  CheckPlain,
  ClockIcon,
  ChartBarIcon,
  FileTextIcon,
  ListIcon,
  RefreshIcon,
  XPlain,
} from "../components/icons";

type Citation = {
  sourceDocumentId: number;
  sourceDocumentTitle: string;
  sourceSnippet: string;
};

type ReviewRow = {
  id: number;
  text: string;
  correct: boolean;
  source: string;
  citation: Citation | null;
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

const CONFETTI = [
  { left: "6%", top: "24%", bg: "#f6c445", rot: "18deg" },
  { left: "14%", top: "60%", bg: "#e0453a", rot: "-12deg" },
  { left: "22%", top: "12%", bg: "#7c5cff", rot: "40deg" },
  { left: "34%", top: "70%", bg: "#2f8fe6", rot: "-24deg" },
  { left: "44%", top: "18%", bg: "#22c081", rot: "10deg" },
  { left: "58%", top: "64%", bg: "#f6c445", rot: "-30deg" },
  { left: "66%", top: "10%", bg: "#e0453a", rot: "22deg" },
  { left: "78%", top: "50%", bg: "#7c5cff", rot: "-16deg" },
  { left: "88%", top: "26%", bg: "#22c081", rot: "34deg" },
  { left: "94%", top: "62%", bg: "#2f8fe6", rot: "-8deg" },
];

// The quiz page navigates here with the completion record it just wrote (see
// QuizTakingPage.submitQuiz). Turn that into a partial AssignedQuiz so the
// results page can render its score/time/"Best of N attempts" immediately,
// before the listAssignedQuizzes() fetch confirms it. Fields this page doesn't
// read (title/description/dueDate/assignmentId) get harmless placeholders.
type QuizResultsNavState = {
  quizId?: number;
  completion?: CompleteQuizAssignmentResult;
};

function seedCompletedQuizFromNav(state: unknown): AssignedQuiz | null {
  const navState = (state ?? null) as QuizResultsNavState | null;
  const completion = navState?.completion;
  const quizId = navState?.quizId;
  if (!completion || !completion.updated || typeof quizId !== "number") return null;

  return {
    assignmentId: -1,
    quizId,
    title: "",
    description: null,
    dueDate: null,
    status: "completed",
    passingScore: null,
    score: completion.score,
    timeTakenSeconds: completion.timeTakenSeconds,
    completedAt: completion.completedAt,
    attemptCount: completion.attemptCount ?? 0,
  };
}

function QuizResultsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const attempt = useMemo(() => loadQuizAttempt(), []);
  const [passingScore, setPassingScore] = useState(70);
  // The most-recently-completed assignment from the backend — the durable
  // source of truth for "did they finish, and how did they do". The local
  // `attempt` above only enriches the per-question review (the backend
  // doesn't store individual answers) and may be missing on another device.
  //
  // Seed it from the router state the quiz page hands us on submit (the record
  // it just wrote), so score/time and especially "Best of N attempts" render on
  // the FIRST paint instead of popping in a beat later once the fetch below
  // resolves. Only the fields this page reads are known here; the rest are
  // placeholders the listAssignedQuizzes() fetch fills in moments later.
  const [completedQuiz, setCompletedQuiz] = useState<AssignedQuiz | null>(() =>
    seedCompletedQuizFromNav(location.state)
  );
  const [isLoadingResult, setIsLoadingResult] = useState(true);
  // Which review row's source document is open in the source modal.
  const [sourceModalRowId, setSourceModalRowId] = useState<number | null>(null);
  const [sourceTextByDocumentId, setSourceTextByDocumentId] = useState<Record<number, string>>({});
  const [sourceLoadingByDocumentId, setSourceLoadingByDocumentId] = useState<
    Record<number, boolean>
  >({});
  const [sourceErrorByDocumentId, setSourceErrorByDocumentId] = useState<Record<number, string>>(
    {}
  );
  const highlightRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    setPassingScore(loadQuizConfig().passingScore);
  }, []);

  // The specific quiz these results are for: the one just submitted (nav state)
  // or, failing that, the local attempt. We fetch this exact quiz's record
  // rather than "whatever was completed most recently" — retakes don't bump
  // `completedAt`, so the most-recent sort can surface a DIFFERENT quiz, which
  // then mismatches the local attempt and wrongly hides the per-question review.
  const navState = location.state as { quizId?: number } | null;
  const targetQuizId = navState?.quizId ?? attempt?.quizId ?? null;

  // Pull the durable result from the backend so a completed quiz still shows
  // its score/time after a refresh or on another device, even if the local
  // attempt cache is gone.
  useEffect(() => {
    let cancelled = false;
    listAssignedQuizzes()
      .then((assigned) => {
        if (cancelled) return;
        const completed = assigned
          .filter((quiz) => quiz.status === "completed" && quiz.completedAt)
          .sort(
            (a, b) =>
              new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
          );
        // Prefer the record for the quiz we're actually showing; fall back to
        // the most recently completed only when we don't know which quiz (e.g.
        // opened directly, no nav state and no local attempt).
        const match =
          (targetQuizId != null
            ? completed.find((quiz) => quiz.quizId === targetQuizId)
            : undefined) ?? completed[0];
        // Don't let an empty/slow fetch clobber the record we seeded from the
        // just-submitted quiz — only replace it when the fetch actually found
        // a completed assignment (the durable, fully-populated version).
        setCompletedQuiz((seeded) => match ?? seeded);
      })
      .catch(() => {
        /* leave null — falls back to the local attempt if present */
      })
      .finally(() => {
        if (!cancelled) setIsLoadingResult(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetQuizId]);

  // Prefer the quiz's own passing score (from the backend) over the local
  // manager config, which may not match the quiz actually taken.
  const effectivePassingScore =
    typeof completedQuiz?.passingScore === "number" ? completedQuiz.passingScore : passingScore;

  // Only enrich the per-question review from the local attempt when it belongs
  // to the completed quiz we're showing — otherwise a stale attempt from a
  // different quiz would render the wrong questions.
  const attemptMatchesCompleted =
    Boolean(attempt) &&
    (completedQuiz == null || attempt?.quizId == null || attempt?.quizId === completedQuiz.quizId);

  // Results reflect a real, completed quiz. We treat the backend's completed
  // assignment as the source of truth; a local attempt only adds the answer
  // breakdown. We must NOT fabricate a "100% — You passed!" from an untaken
  // quiz's answer key.
  const reviewQuestions: QuizQuestion[] =
    attemptMatchesCompleted && attempt ? attempt.questions : [];
  const userAnswers = attemptMatchesCompleted && attempt ? attempt.answers : {};
  const hasRealData = Boolean(completedQuiz) || (Boolean(attempt) && reviewQuestions.length > 0);

  const rows: ReviewRow[] = hasRealData
    ? reviewQuestions.map((question, index) => {
        const correctOption = question.options.find((option) => option.isCorrect);
        const gotItRight = Boolean(correctOption && userAnswers[question.id] === correctOption.id);
        return {
          id: question.id,
          text: `${index + 1}. ${question.prompt}`,
          correct: gotItRight,
          source: question.citation?.sourceDocumentTitle ?? "Course Docs",
          citation: question.citation
            ? {
                sourceDocumentId: question.citation.sourceDocumentId,
                sourceDocumentTitle: question.citation.sourceDocumentTitle,
                sourceSnippet: question.citation.sourceSnippet,
              }
            : null,
        };
      })
    : [];

  const hasReviewRows = rows.length > 0;
  // The score of the attempt just taken, from the local answer breakdown. This
  // drives the headline so the ring never contradicts the questions on screen
  // (e.g. showing 100% after a 2/5 retake).
  const thisAttemptScore = hasReviewRows
    ? Math.round((rows.filter((row) => row.correct).length / rows.length) * 100)
    : null;
  // The best score on record (backend, "best-of-N" policy). Kept as a separate
  // stat so a worse retake doesn't erase that they'd already aced it.
  const bestScore =
    typeof completedQuiz?.score === "number" ? completedQuiz.score : null;
  // Headline reflects this attempt; fall back to the best score only when there
  // is no local breakdown (e.g. viewing on another device / after cache clear).
  const score = thisAttemptScore ?? bestScore ?? 0;
  const didPass = score >= effectivePassingScore;
  // Whether they've cleared this quiz on any attempt — used so we don't nag
  // someone to "retake to pass" when they've already passed on a better run.
  const hasEverPassed = bestScore != null && bestScore >= effectivePassingScore;
  // Show the best-of stat only when it actually beats this attempt (otherwise
  // it's just a redundant restatement of the headline).
  const showBestScore =
    bestScore != null && thisAttemptScore != null && bestScore > thisAttemptScore;

  // The per-question correct/incorrect chips only make sense with the local
  // answer breakdown; without it we show the review as unavailable rather than
  // implying every question was right/wrong.
  const totalQuestions = rows.length;
  const correctCount = rows.filter((row) => row.correct).length;
  const incorrectCount = Math.max(totalQuestions - correctCount, 0);

  // Time taken: prefer the backend record, fall back to the local attempt's
  // start/submit stamps.
  const timeTaken =
    typeof completedQuiz?.timeTakenSeconds === "number"
      ? formatDuration(completedQuiz.timeTakenSeconds)
      : attempt?.startedAt && attempt?.submittedAt
        ? formatDuration(
            Math.max(
              0,
              Math.round(
                (new Date(attempt.submittedAt).getTime() -
                  new Date(attempt.startedAt).getTime()) /
                  1000
              )
            )
          )
        : "—"; // no backend time and attempt predates time tracking

  const activeSourceRow =
    sourceModalRowId != null ? rows.find((row) => row.id === sourceModalRowId) ?? null : null;
  // Frozen copy so the modal keeps showing the last-viewed source while it
  // plays its close animation, instead of the content vanishing the instant
  // `sourceModalRowId` resets to null.
  const frozenSourceRow = useLastNonNull(activeSourceRow?.citation ? activeSourceRow : null);
  const sourceModal = useModalTransition(Boolean(activeSourceRow?.citation));

  // Opening a source: markdown docs read far better on their original page, so
  // if the cited doc is markdown we fetch its URL and link out to the real file
  // in a new tab. Markdown is detected synchronously from the citation title so
  // the common (non-markdown) case still opens the text modal instantly, with
  // no extra round-trip. Markdown with no URL (e.g. a bare .md upload) falls
  // back to the same text modal.
  const openSourceModal = (row: ReviewRow) => {
    if (!row.citation) return;
    const documentId = row.citation.sourceDocumentId;

    if (isMarkdownSource(row.citation.sourceDocumentTitle)) {
      getDocumentDetail(documentId)
        .then((detail) => {
          if (detail.sourceUrl) openSourceUrl(detail.sourceUrl);
          else openTextModal(row);
        })
        .catch(() => openTextModal(row));
      return;
    }

    openTextModal(row);
  };

  const openTextModal = (row: ReviewRow) => {
    if (!row.citation) return;
    setSourceModalRowId(row.id);
    void loadSourceText(row.citation.sourceDocumentId);
  };

  async function loadSourceText(documentId: number) {
    if (sourceTextByDocumentId[documentId] || sourceLoadingByDocumentId[documentId]) return;

    setSourceLoadingByDocumentId((prev) => ({ ...prev, [documentId]: true }));
    setSourceErrorByDocumentId((prev) => {
      const next = { ...prev };
      delete next[documentId];
      return next;
    });

    try {
      const detail = await getDocumentDetail(documentId);
      setSourceTextByDocumentId((prev) => ({
        ...prev,
        [documentId]: detail.rawText ?? "No extracted text available for this document.",
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

  function renderHighlightedSource(sourceText: string, snippet: string, rowId: number) {
    const normalizedSource = sourceText ?? "";
    const normalizedSnippet = snippet?.trim() ?? "";
    if (!normalizedSnippet) return normalizedSource;

    const span = findHighlightSpan(normalizedSource, normalizedSnippet);
    if (!span) return normalizedSource;

    const start = span.start;
    const end = span.end;
    return (
      <>
        {normalizedSource.slice(0, start)}
        <mark
          ref={(el) => {
            highlightRefs.current[rowId] = el;
          }}
          style={{
            background: "linear-gradient(180deg, #fff3a8 0%, #ffe873 100%)",
            padding: "1px 2px",
            borderRadius: "3px",
            scrollMarginTop: "40px",
            boxShadow: "0 0 0 2px rgba(255, 224, 102, 0.5)",
          }}
        >
          {normalizedSource.slice(start, end)}
        </mark>
        {normalizedSource.slice(end)}
      </>
    );
  }

  // Once the source modal is open and its text has loaded, scroll the
  // highlighted snippet into view.
  useEffect(() => {
    if (!activeSourceRow?.citation) return;
    const documentId = activeSourceRow.citation.sourceDocumentId;
    if (sourceLoadingByDocumentId[documentId]) return;
    requestAnimationFrame(() => {
      highlightRefs.current[activeSourceRow.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [activeSourceRow, sourceLoadingByDocumentId, sourceTextByDocumentId]);

  return (
    <div className="app-shell">
      <AppNav />

      <main className="results-stage">
        {isLoadingResult && !hasRealData ? (
          <section className="glass card results-empty">
            <p className="results-eyebrow">YOUR PROGRESS</p>
            <h1>Loading your results…</h1>
          </section>
        ) : !hasRealData ? (
          <section className="glass card results-empty">
            <img className="results-empty-mascot" src={mascot} alt="" aria-hidden />
            <p className="results-eyebrow">YOUR PROGRESS</p>
            <h1>No quiz results yet</h1>
            <p className="results-empty-sub">
              Once you complete an assigned quiz, your score and a breakdown of your
              answers will show up here.
            </p>
            <div className="results-empty-actions">
              <button className="sf-btn" type="button" onClick={() => navigate("/home")}>
                Go to Home <ArrowRight />
              </button>
            </div>
          </section>
        ) : (
          <>
            {CONFETTI.map((bit, index) => (
              <span
                key={index}
                className="confetti-bit"
                style={{ left: bit.left, top: bit.top, background: bit.bg, transform: `rotate(${bit.rot})` }}
              />
            ))}

            <div className="results-hero">
              <div>
                <p className="results-eyebrow">QUIZ RESULTS</p>
                <h1>{didPass ? "You passed!" : "Almost there"}</h1>
                <p>
                  {didPass
                    ? "Great job! You've demonstrated a solid understanding of this topic."
                    : hasEverPassed
                      ? "This attempt came in lower, but your best passing score is still on record."
                      : "Review the questions you missed, then retake the quiz to pass."}
                </p>
              </div>
            </div>

            <div className="results-grid">
          <section className="glass card">
            <h2 className="card-title">
              <ChartBarIcon /> Your Results
            </h2>

            <div className="score-row">
              <div className="score-ring" style={{ "--pct": `${score}%` } as CSSProperties}>
                <div className="score-ring-center">
                  <strong>{score}%</strong>
                  <span>{showBestScore ? "This Attempt" : "Your Score"}</span>
                </div>
              </div>
              <div className="score-meta">
                <span className={`pass-badge ${didPass ? "ok" : "no"}`}>
                  {didPass ? <CheckCircleIcon /> : <XPlain />}
                  {didPass ? "Passed" : "Not yet"}
                </span>
                <p className="score-sub">Passing score: {effectivePassingScore}%</p>
                {showBestScore ? (
                  <p className="score-sub">Best score: {bestScore}%</p>
                ) : null}
                {completedQuiz && completedQuiz.attemptCount > 1 ? (
                  <p className="score-sub">
                    Best of {completedQuiz.attemptCount} attempts
                  </p>
                ) : null}
                <p className="score-breakdown-label">Performance Breakdown</p>
              </div>
            </div>

            <div className="stat-chips">
              {/* Per-question correct/incorrect counts require the local answer
                  breakdown; hide them when we only have the backend score so we
                  don't show a misleading "0 correct". */}
              {hasReviewRows ? (
                <>
                  <div className="stat-chip">
                    <span className="stat-ic good">
                      <CheckPlain />
                    </span>
                    <strong>{correctCount}</strong>
                    <span>Correct</span>
                  </div>
                  <div className="stat-chip">
                    <span className="stat-ic bad">
                      <XPlain />
                    </span>
                    <strong>{incorrectCount}</strong>
                    <span>Incorrect</span>
                  </div>
                </>
              ) : null}
              <div className="stat-chip">
                <span className="stat-ic time">
                  <ClockIcon />
                </span>
                <strong>{timeTaken}</strong>
                <span>Time Taken</span>
              </div>
            </div>
          </section>

          <section className="glass card results-review">
            <img className="results-review-mascot" src={mascot} alt="Celebrating panda" />
            <h2 className="card-title">
              <ListIcon /> Review Your Answers
            </h2>
            <div className="review-scroll">
              {hasReviewRows ? (
                rows.map((row, index) => (
                  <div className="review-item" key={row.id}>
                    <span
                      className={`review-mark t-success-check ${row.correct ? "ok" : "no"}`}
                      data-state="in"
                      style={{ "--stagger": `${Math.min(index, 10) * 45}ms` } as CSSProperties}
                    >
                      {row.correct ? <CheckPlain /> : <XPlain />}
                    </span>
                    <span className="review-q">{row.text}</span>
                    {row.citation ? (
                      <button
                        type="button"
                        className="source-icon-btn"
                        title={`View source: ${row.source}`}
                        aria-label={`View source for ${row.source}`}
                        onClick={() => openSourceModal(row)}
                      >
                        <FileTextIcon aria-hidden />
                      </button>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="cfg-empty">
                  A per-question breakdown isn't available for this attempt
                  {" "}— it was completed on another device or browser. Your score
                  above is still saved.
                </p>
              )}
            </div>
          </section>
            </div>

            <div className="results-foot">
              <button
                className="ghost-btn"
                type="button"
                title={
                  didPass
                    ? "You've already passed — practice runs never lower your recorded score."
                    : "Retake to improve your score. We keep your best result."
                }
                onClick={() =>
                  navigate(
                    completedQuiz
                      ? `/quiz-taking?quizId=${completedQuiz.quizId}`
                      : "/quiz-taking"
                  )
                }
              >
                <RefreshIcon /> {didPass ? "Practice again" : "Retake"}
              </button>
              <button className="sf-btn" type="button" onClick={() => navigate("/learner-module")}>
                Back to Module <ArrowRight />
              </button>
            </div>

        {sourceModal.shouldRender && frozenSourceRow ? (
          <div
            className={`modal-backdrop t-modal-backdrop ${sourceModal.phaseClassName}`}
            role="dialog"
            aria-modal="true"
            onClick={() => setSourceModalRowId(null)}
          >
            <div
              className={`modal-card rp-source-modal t-modal ${sourceModal.phaseClassName}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="rp-source-head">
                <div>
                  <span className="rp-source-eyebrow">Source document</span>
                  <h3>{frozenSourceRow.citation!.sourceDocumentTitle}</h3>
                </div>
                <button
                  type="button"
                  className="rp-source-close"
                  aria-label="Close source"
                  onClick={() => setSourceModalRowId(null)}
                >
                  ×
                </button>
              </div>
              <div className="rp-source-body">
                {sourceLoadingByDocumentId[frozenSourceRow.citation!.sourceDocumentId] ? (
                  <p className="cfg-empty">Loading source…</p>
                ) : sourceErrorByDocumentId[frozenSourceRow.citation!.sourceDocumentId] ? (
                  <p className="form-error">
                    {sourceErrorByDocumentId[frozenSourceRow.citation!.sourceDocumentId]}
                  </p>
                ) : (
                  <div className="rp-source-page">
                    {renderHighlightedSource(
                      sourceTextByDocumentId[frozenSourceRow.citation!.sourceDocumentId] ??
                        "No extracted text available for this document.",
                      frozenSourceRow.citation!.sourceSnippet,
                      frozenSourceRow.id
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
          </>
        )}
      </main>
    </div>
  );
}

export default QuizResultsPage;
