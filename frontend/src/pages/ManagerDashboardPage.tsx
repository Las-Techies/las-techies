import { useEffect, useMemo, useRef, useState } from "react";
import AppNav from "../components/navigation/AppNav";
import {
  apiFetch,
  assignQuiz,
  getManagerDashboard,
  listTeamMembers,
  type ManagerDashboardData,
  type ManagerDashboardQuiz,
  type TeamMember,
} from "../api/client";
import { describeError, type FriendlyError } from "../api/errors";
import ApiErrorCard from "../components/ApiErrorCard";
import {
  CalendarIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClipboardIcon,
  PeopleIcon,
  UserPlusIcon,
} from "../components/icons";
import type { GeneratedQuiz } from "../features/quiz/types";
import { useLastNonNull, useModalTransition } from "../hooks/useModalTransition";
import { useAuth } from "../context/AuthContext";
import TeamSwitcher from "../components/TeamSwitcher";
import { supabase } from "../lib/supabaseClient";

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTakenDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(totalSeconds: number | null): string {
  if (totalSeconds === null) return "—";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "•";
}

function getAssignmentStatusDisplay(assignment: {
  status: "pending" | "completed";
  score: number | null;
  passingScore: number | null;
}): { label: string; className: string } {
  if (assignment.status !== "completed") {
    return { label: "Pending", className: "pending" };
  }
  if (typeof assignment.score === "number" && typeof assignment.passingScore === "number") {
    return assignment.score >= assignment.passingScore
      ? { label: "Completed - Passed", className: "completed-passed" }
      : { label: "Completed - Not passed", className: "completed-not-passed" };
  }
  return { label: "Completed", className: "completed" };
}

function ManagerDashboardPage() {
  const { session } = useAuth();
  // The manager's active team. The DB is the source of truth (they switch teams
  // server-side without a session refresh, so the JWT's team_id can be stale) —
  // we seed from the JWT for the very first render, then reconcile with the id
  // the dashboard payload echoes back, and set it optimistically on switch so
  // the switcher marks the new team instantly.
  const [activeTeamId, setActiveTeamId] = useState<number | null>(() => {
    const raw = session?.user.user_metadata?.team_id;
    return Number.isInteger(Number(raw)) ? Number(raw) : null;
  });
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  const [selectedQuiz, setSelectedQuiz] = useState<GeneratedQuiz | null>(null);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isQuizModalLoading, setIsQuizModalLoading] = useState(false);
  const [quizModalError, setQuizModalError] = useState("");

  // "Add users" modal: assign an already-published quiz to more learners (or
  // invite brand-new ones by email). `assignTarget` is the quiz being assigned.
  const [assignTarget, setAssignTarget] = useState<ManagerDashboardQuiz | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  // Team roster is loaded lazily the first time the modal opens, then cached.
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState("");
  const [hasLoadedMembers, setHasLoadedMembers] = useState(false);
  // Team members newly ticked in the picker (already-assigned ones render
  // checked-and-disabled and are never in here).
  const [selectedLearnerIds, setSelectedLearnerIds] = useState<number[]>([]);
  // Free-text email invites for people not yet on the team.
  const [selectedLearners, setSelectedLearners] = useState<string[]>([]);
  const [learnerEmail, setLearnerEmail] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  // "Create your first team" prompt, shown when a manager has no active team
  // yet (team setup didn't complete at signup). Creating one here recovers the
  // account without needing to sign up again.
  const [firstTeamName, setFirstTeamName] = useState("");
  const [isCreatingFirstTeam, setIsCreatingFirstTeam] = useState(false);
  const [firstTeamError, setFirstTeamError] = useState("");

  // Bumped by retry/refresh actions to re-run dashboard loading.
  const [reloadKey, setReloadKey] = useState(0);

  // Per-team cache of the last dashboard payload, so switching back to a team
  // you've already viewed shows instantly instead of flashing a loader. Kept in
  // a ref (not state) since it's a side cache, not render state — reads/writes
  // shouldn't themselves trigger re-renders.
  const dashboardCacheRef = useRef<Map<number, ManagerDashboardData>>(new Map());

  useEffect(() => {
    let cancelled = false;

    // Show cached data for this team immediately if we have it (no flash);
    // otherwise fall back to whatever's already on screen. We only show the
    // full-page "Loading…" state on the very first load, when there's nothing
    // to display yet — a switch keeps the current view up until fresh data
    // arrives, so it never blanks.
    const cached = activeTeamId !== null ? dashboardCacheRef.current.get(activeTeamId) : undefined;
    if (cached) {
      setData(cached);
      setIsLoading(false);
    } else {
      setData((prev) => {
        if (prev === null) setIsLoading(true);
        return prev;
      });
    }
    setLoadError(null);

    getManagerDashboard()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        // Reconcile our active-team id with the DB source of truth the payload
        // echoes back — covers the first load (JWT seed may lag) and any case
        // where our optimistic value drifted from the server.
        if (typeof result.activeTeamId === "number") {
          setActiveTeamId(result.activeTeamId);
        }
        // Only cache real team data (not the "needs team" placeholder). Key on
        // the payload's own team id when present so an out-of-date activeTeamId
        // never caches under the wrong key.
        const cacheKey = result.activeTeamId ?? activeTeamId;
        if (cacheKey !== null && cacheKey !== undefined && !result.needsTeam) {
          dashboardCacheRef.current.set(cacheKey, result);
        }
      })
      .catch((err) => {
        // Keep any stale/cached data visible on error rather than wiping it;
        // only surface the error card when we have nothing to show.
        if (!cancelled && !cached) setLoadError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, activeTeamId]);

  // Called after the manager switches or creates a team, with the now-active
  // team id. Setting activeTeamId is what makes the loader effect refetch (and
  // read any cached payload) for the new team — and it marks the right row in
  // the switcher immediately. The roster cache is team-scoped, so drop it too
  // (forcing a reload on the next "Add users" open).
  function handleTeamChanged(teamId: number) {
    setTeamMembers([]);
    setHasLoadedMembers(false);
    setActiveTeamId(teamId);
  }

  // Creates the manager's first team from the "needs team" prompt. Same
  // endpoint signup uses: it creates the team owned by this manager, makes it
  // active, and updates their JWT metadata — so we refresh the session before
  // reloading the dashboard for the now-active team.
  async function handleCreateFirstTeam() {
    const name = firstTeamName.trim();
    if (!name || isCreatingFirstTeam) return;
    setIsCreatingFirstTeam(true);
    setFirstTeamError("");
    try {
      const created = await apiFetch<{ data: { id: number; name: string } }>("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await supabase.auth.refreshSession();
      setFirstTeamName("");
      handleTeamChanged(created.data.id);
    } catch (err) {
      setFirstTeamError(
        err instanceof Error ? err.message : "Couldn't create your team. Please try again."
      );
    } finally {
      setIsCreatingFirstTeam(false);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const allAssignments = data.learners.flatMap((learner) => learner.assignments);
    const completed = allAssignments.filter((assignment) => assignment.status === "completed");
    const scores = completed
      .map((assignment) => assignment.score)
      .filter((score): score is number => typeof score === "number");
    const publishedCount = data.quizzes.filter((quiz) => quiz.status === "published").length;
    const completionRate =
      allAssignments.length > 0 ? Math.round((completed.length / allAssignments.length) * 100) : null;
    const averageScore =
      scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

    return {
      learnerCount: data.learners.length,
      publishedCount,
      completionRate,
      averageScore,
    };
  }, [data]);

  const quizModal = useModalTransition(isQuizModalOpen);
  const frozenSelectedQuiz = useLastNonNull(selectedQuiz);

  async function openQuizModal(quizId: number) {
    setIsQuizModalOpen(true);
    setIsQuizModalLoading(true);
    setQuizModalError("");
    setSelectedQuiz(null);
    try {
      const quiz = await apiFetch<GeneratedQuiz>(`/api/quizzes/${quizId}`);
      setSelectedQuiz(quiz);
    } catch (err) {
      setQuizModalError(err instanceof Error ? err.message : "Failed to load quiz details.");
    } finally {
      setIsQuizModalLoading(false);
    }
  }

  const quizToShow = selectedQuiz ?? frozenSelectedQuiz;

  const assignModal = useModalTransition(isAssignModalOpen);
  const frozenAssignTarget = useLastNonNull(assignTarget);
  const assignQuizToShow = assignTarget ?? frozenAssignTarget;

  // Which team members are ALREADY assigned to the quiz being added to, derived
  // from the dashboard's per-learner assignment data (no extra fetch). These
  // render checked-and-disabled so the manager only adds new people. Matching
  // is by email because dashboard learners and team-member rows are different
  // shapes but share the email as a stable key.
  const alreadyAssignedEmails = useMemo(() => {
    if (!data || !assignQuizToShow) return new Set<string>();
    const emails = data.learners
      .filter((learner) =>
        learner.assignments.some((assignment) => assignment.quizId === assignQuizToShow.id)
      )
      .map((learner) => learner.email.toLowerCase());
    return new Set(emails);
  }, [data, assignQuizToShow]);

  function openAssignModal(quiz: ManagerDashboardQuiz) {
    setAssignTarget(quiz);
    setIsAssignModalOpen(true);
    setAssignError("");
    setSelectedLearnerIds([]);
    setSelectedLearners([]);
    setLearnerEmail("");

    // Load the roster once, then reuse it for subsequent opens.
    if (hasLoadedMembers) return;
    setIsLoadingMembers(true);
    setMembersError("");
    listTeamMembers("new_hire")
      .then((members) => {
        setTeamMembers(members);
        setHasLoadedMembers(true);
      })
      .catch((err) => {
        setMembersError(err instanceof Error ? err.message : "Failed to load team members.");
      })
      .finally(() => setIsLoadingMembers(false));
  }

  function toggleLearner(id: number) {
    setSelectedLearnerIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  }

  function addLearnerEmail() {
    const email = learnerEmail.trim().toLowerCase();
    if (!email) return;
    setSelectedLearners((prev) => (prev.includes(email) ? prev : [...prev, email]));
    setLearnerEmail("");
  }

  function removeLearner(email: string) {
    setSelectedLearners((prev) => prev.filter((value) => value !== email));
  }

  async function handleConfirmAssign() {
    if (!assignTarget) return;

    setIsAssigning(true);
    setAssignError("");
    try {
      // Tracked assignments for team members just ticked (already-assigned ones
      // are disabled in the UI, so they can't reach here). Idempotent server-
      // side, but we skip the call entirely when nothing new was selected.
      let assignmentFailed = false;
      if (selectedLearnerIds.length > 0) {
        try {
          await assignQuiz(assignTarget.id, selectedLearnerIds);
        } catch {
          assignmentFailed = true;
        }
      }

      // Email invites for people not yet on the team (accepting the invite
      // auto-creates their assignment server-side). Collected, not aborted.
      const inviteResults = await Promise.allSettled(
        selectedLearners.map((email) =>
          apiFetch("/api/invites", {
            method: "POST",
            body: JSON.stringify({ email, quizId: assignTarget.id }),
          })
        )
      );
      const failedInvites = inviteResults.filter((r) => r.status === "rejected");

      if (assignmentFailed || failedInvites.length > 0) {
        const parts: string[] = [];
        if (assignmentFailed) parts.push("assigning to the selected team members failed");
        if (failedInvites.length > 0) {
          parts.push(
            `${failedInvites.length} of ${selectedLearners.length} invite email(s) could not be sent`
          );
        }
        setAssignError(`${parts.join(" and ")}. Please try again.`);
        // Refresh so any assignments that DID succeed are reflected.
        setReloadKey((k) => k + 1);
        return;
      }

      // Clean success — close and refresh the dashboard counts.
      setIsAssignModalOpen(false);
      setReloadKey((k) => k + 1);
    } finally {
      setIsAssigning(false);
    }
  }

  const assignSelectionCount = selectedLearnerIds.length + selectedLearners.length;

  return (
    <div className="app-shell">
      <AppNav />
      <main className="mgr-page">
        <div className="mgr-hero">
          <div>
            <h1>Team Dashboard</h1>
            <p>See how your new hires are progressing and how each quiz you've published is performing.</p>
          </div>
          {data && !data.needsTeam ? (
            <div className="mgr-hero-actions">
              <TeamSwitcher
                activeTeamId={activeTeamId}
                activeTeamName={data.activeTeamName ?? null}
                onTeamChanged={handleTeamChanged}
              />
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <section className="glass dash-card">
            <p className="cfg-empty">Loading dashboard…</p>
          </section>
        ) : loadError ? (
          <section className="glass dash-card">
            <ApiErrorCard error={loadError} onRetry={() => setReloadKey((k) => k + 1)} />
          </section>
        ) : !data ? (
          <section className="glass dash-card">
            <p className="cfg-empty">Couldn't load your dashboard. Try refreshing the page.</p>
          </section>
        ) : data.needsTeam ? (
          <section className="glass dash-card">
            <div className="dash-needs-team">
              <span className="dash-needs-team-icon" aria-hidden>
                <PeopleIcon />
              </span>
              <h3>Create your first team</h3>
              <p>
                You don't have a team yet. Name the team you'll be managing to set up your
                dashboard — you can add new hires and create more teams afterward.
              </p>
              <div className="dash-needs-team-form">
                <input
                  type="text"
                  placeholder="e.g. Frontline Ops Team"
                  value={firstTeamName}
                  onChange={(event) => setFirstTeamName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateFirstTeam();
                    }
                  }}
                />
                <button
                  type="button"
                  className="sf-btn"
                  disabled={isCreatingFirstTeam || !firstTeamName.trim()}
                  onClick={() => void handleCreateFirstTeam()}
                >
                  {isCreatingFirstTeam ? "Creating…" : "Create team"}
                </button>
              </div>
              {firstTeamError ? <p className="form-error">{firstTeamError}</p> : null}
            </div>
          </section>
        ) : (
          <>
            <div className="dash-stats">
              <div className="glass dash-stat-card">
                <span className="dash-stat-icon">
                  <PeopleIcon />
                </span>
                <div>
                  <span className="dash-stat-value">{stats?.learnerCount ?? 0}</span>
                  <span className="dash-stat-label">New hires</span>
                </div>
              </div>
              <div className="glass dash-stat-card">
                <span className="dash-stat-icon">
                  <ClipboardIcon />
                </span>
                <div>
                  <span className="dash-stat-value">{stats?.publishedCount ?? 0}</span>
                  <span className="dash-stat-label">Published quizzes</span>
                </div>
              </div>
              <div className="glass dash-stat-card">
                <span className="dash-stat-icon">
                  <CheckCircleIcon />
                </span>
                <div>
                  <span className="dash-stat-value">
                    {stats?.completionRate !== null ? `${stats?.completionRate}%` : "—"}
                  </span>
                  <span className="dash-stat-label">Completion rate</span>
                </div>
              </div>
              <div className="glass dash-stat-card">
                <span className="dash-stat-icon">
                  <ChartBarIcon />
                </span>
                <div>
                  <span className="dash-stat-value">
                    {stats?.averageScore !== null ? `${stats?.averageScore}%` : "—"}
                  </span>
                  <span className="dash-stat-label">Average score</span>
                </div>
              </div>
            </div>

            <section className="glass dash-card">
              <h3 className="dash-card-title">
                <PeopleIcon /> Team Progress
              </h3>
              <p className="dash-card-hint">
                Every new hire on your team and how they're doing on each quiz assigned to them.
              </p>

              {data.learners.length === 0 ? (
                <p className="cfg-empty">No new hires on your team yet.</p>
              ) : (
                <div className="dash-learner-list">
                  {data.learners.map((learner) => {
                    const completedCount = learner.assignments.filter(
                      (assignment) => assignment.status === "completed"
                    ).length;
                    return (
                      <div className="dash-learner-card" key={learner.id}>
                        <div className="dash-learner-head">
                          <span className="dash-avatar">{initialsOf(learner.name)}</span>
                          <div className="dash-learner-info">
                            <strong>{learner.name || learner.email}</strong>
                            <span className="muted">{learner.email}</span>
                          </div>
                          <span className="dash-learner-summary">
                            {completedCount}/{learner.assignments.length} completed
                          </span>
                        </div>

                        {learner.assignments.length === 0 ? (
                          <p className="dash-empty-hint">No quizzes assigned yet.</p>
                        ) : (
                          <div className="dash-assignment-list">
                            {learner.assignments.map((assignment) => {
                              const statusDisplay = getAssignmentStatusDisplay(assignment);
                              return (
                              <div className="dash-assignment-row" key={assignment.quizId}>
                                <span className="dash-assignment-title">{assignment.quizTitle}</span>
                                <span className={`dash-status-pill ${statusDisplay.className}`}>
                                  {statusDisplay.label}
                                </span>
                                <span className="dash-assignment-meta">
                                  Score{" "}
                                  {assignment.status === "completed" && typeof assignment.score === "number"
                                    ? `${assignment.score}%`
                                    : "—"}
                                  {assignment.attemptCount > 1 ? (
                                    <span
                                      className="dash-attempt-badge"
                                      title={`Best of ${assignment.attemptCount} attempts`}
                                    >
                                      ×{assignment.attemptCount}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="dash-assignment-meta">
                                  Time {formatDuration(assignment.timeTakenSeconds)}
                                </span>
                                <span className="dash-assignment-meta muted">
                                  <CalendarIcon /> Due {formatDate(assignment.dueDate)}
                                </span>
                                <span className="dash-assignment-meta muted">
                                  <CalendarIcon /> Taken {formatTakenDate(assignment.completedAt)}
                                </span>
                              </div>
                            );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="glass dash-card">
              <h3 className="dash-card-title">
                <ClipboardIcon /> Past Quizzes
              </h3>
              <p className="dash-card-hint">Every quiz your team has created, published or not.</p>

              {data.quizzes.length === 0 ? (
                <p className="cfg-empty">You haven't created any quizzes yet.</p>
              ) : (
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Quiz</th>
                        <th>Status</th>
                        <th>Assigned</th>
                        <th>Completed</th>
                        <th>Avg. score</th>
                        <th>Avg. time taken</th>
                        <th>Due date</th>
                        <th>Created</th>
                        <th className="dash-actions-col">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.quizzes.map((quiz) => (
                        <tr key={quiz.id}>
                          <td>
                            <button
                              type="button"
                              className="dash-quiz-link"
                              onClick={() => void openQuizModal(quiz.id)}
                            >
                              {quiz.title}
                            </button>
                          </td>
                          <td>
                            <span className={`dash-status-pill ${quiz.status}`}>{quiz.status}</span>
                          </td>
                          <td>{quiz.assignedCount}</td>
                          <td>{quiz.completedCount}</td>
                          <td>{quiz.averageScore !== null ? `${quiz.averageScore}%` : "—"}</td>
                          <td>{formatDuration(quiz.averageTimeTakenSeconds)}</td>
                          <td>{formatDate(quiz.dueDate)}</td>
                          <td>{formatDate(quiz.createdAt)}</td>
                          <td className="dash-actions-cell">
                            {quiz.status === "published" ? (
                              <button
                                type="button"
                                className="dash-assign-btn"
                                title="Add users to this quiz"
                                aria-label={`Add users to ${quiz.title}`}
                                onClick={() => openAssignModal(quiz)}
                              >
                                <UserPlusIcon />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {quizModal.shouldRender ? (
          <div
            className={`modal-backdrop t-modal-backdrop ${quizModal.phaseClassName}`}
            role="dialog"
            aria-modal="true"
            onClick={() => setIsQuizModalOpen(false)}
          >
            <div
              className={`modal-card dash-quiz-modal t-modal ${quizModal.phaseClassName}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dash-quiz-modal-head">
                <div>
                  <span className="dash-quiz-modal-eyebrow">Past quiz details</span>
                  <h3>{quizToShow?.title ?? "Quiz details"}</h3>
                </div>
                <button
                  type="button"
                  className="rp-source-close"
                  aria-label="Close quiz details"
                  onClick={() => setIsQuizModalOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="dash-quiz-modal-body">
                {isQuizModalLoading ? (
                  <p className="cfg-empty">Loading quiz…</p>
                ) : quizModalError ? (
                  <p className="form-error">{quizModalError}</p>
                ) : !quizToShow ? (
                  <p className="cfg-empty">Quiz details unavailable.</p>
                ) : (
                  <div className="qcards rp-qcards">
                    {quizToShow.questionsPayload.map((item, index) => (
                      <article className="qcard" key={`${item.id}-${index}`}>
                        <div className="qcard-head">
                          <span className="qcard-num">{index + 1}</span>
                          <h3 className="qcard-prompt">{item.prompt}</h3>
                        </div>
                        <ul className="qopts">
                          {item.options.map((option, optIndex) => (
                            <li key={option.id} className={`qopt ${option.isCorrect ? "is-correct" : ""}`}>
                              <span className="qopt-radio" aria-hidden />
                              <span className="qopt-text">
                                {String.fromCharCode(65 + optIndex)}. {option.text}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="rp-answer">
                          <span className="rp-answer-label">Correct Answer:</span>
                          <span className="rp-answer-value">
                            {item.options.find((option) => option.isCorrect)?.text ?? "N/A"}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {assignModal.shouldRender ? (
          <div
            className={`modal-backdrop t-modal-backdrop ${assignModal.phaseClassName}`}
            role="dialog"
            aria-modal="true"
            onClick={() => setIsAssignModalOpen(false)}
          >
            <div
              className={`modal-card dash-assign-modal t-modal ${assignModal.phaseClassName}`}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="dash-quiz-modal-head">
                <div>
                  <span className="dash-quiz-modal-eyebrow">Add users</span>
                  <h3>{assignQuizToShow?.title ?? "Add users"}</h3>
                </div>
                <button
                  type="button"
                  className="rp-source-close"
                  aria-label="Close add users"
                  onClick={() => setIsAssignModalOpen(false)}
                >
                  ×
                </button>
              </div>

              <div className="dash-quiz-modal-body">
                <div className="assign-learners">
                  <p className="rp-assign-label">Already on your team</p>
                  {isLoadingMembers ? (
                    <p className="cfg-empty">Loading team roster…</p>
                  ) : membersError ? (
                    <p className="form-error">{membersError}</p>
                  ) : teamMembers.length === 0 ? (
                    <p className="cfg-empty">No new hires on your team yet — invite one below.</p>
                  ) : (
                    <div className="learner-roster">
                      {teamMembers.map((member) => {
                        const isAssigned = alreadyAssignedEmails.has(member.email.toLowerCase());
                        const checked = isAssigned || selectedLearnerIds.includes(member.id);
                        return (
                          <label
                            key={member.id}
                            className={`learner-roster-item ${isAssigned ? "is-assigned" : ""}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isAssigned}
                              onChange={() => toggleLearner(member.id)}
                            />
                            <span className="learner-roster-name">
                              {member.firstName} {member.lastName}
                              <span className="learner-roster-email">{member.email}</span>
                            </span>
                            {isAssigned ? (
                              <span className="learner-assigned-tag">Assigned</span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <p className="rp-assign-label">Invite someone new</p>
                  <div className="learner-email-input">
                    <input
                      type="email"
                      placeholder="Enter learner's email or Google Group email"
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

                  {assignError ? <p className="form-error">{assignError}</p> : null}

                  <div className="dash-assign-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setIsAssignModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="sf-btn"
                      disabled={assignSelectionCount === 0 || isAssigning}
                      onClick={() => void handleConfirmAssign()}
                    >
                      {isAssigning
                        ? "Adding…"
                        : `Add ${assignSelectionCount} ${
                            assignSelectionCount === 1 ? "user" : "users"
                          }`}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export default ManagerDashboardPage;
