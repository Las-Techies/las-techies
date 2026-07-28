import { useEffect, useMemo, useState } from "react";
import AppNav from "../components/navigation/AppNav";
import { getManagerDashboard, type ManagerDashboardData } from "../api/client";
import { describeError, type FriendlyError } from "../api/errors";
import ApiErrorCard from "../components/ApiErrorCard";
import { CalendarIcon, ChartBarIcon, CheckCircleIcon, ClipboardIcon, PeopleIcon } from "../components/icons";

function formatDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function ManagerDashboardPage() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<FriendlyError | null>(null);
  // Bumped by the Try again button to re-run the loader effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);
    getManagerDashboard()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(describeError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

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

  return (
    <div className="app-shell">
      <AppNav />
      <main className="mgr-page">
        <div className="mgr-hero">
          <div>
            <h1>Team Dashboard</h1>
            <p>See how your new hires are progressing and how each quiz you've published is performing.</p>
          </div>
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
                            {learner.assignments.map((assignment) => (
                              <div className="dash-assignment-row" key={assignment.quizId}>
                                <span className="dash-assignment-title">{assignment.quizTitle}</span>
                                <span className={`dash-status-pill ${assignment.status}`}>
                                  {assignment.status === "completed" ? "Completed" : "Pending"}
                                </span>
                                <span className="dash-assignment-meta">
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
                                  {formatDuration(assignment.timeTakenSeconds)}
                                </span>
                                <span className="dash-assignment-meta muted">
                                  <CalendarIcon /> {formatDate(assignment.dueDate)}
                                </span>
                              </div>
                            ))}
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
                        <th>Avg. time</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.quizzes.map((quiz) => (
                        <tr key={quiz.id}>
                          <td>{quiz.title}</td>
                          <td>
                            <span className={`dash-status-pill ${quiz.status}`}>{quiz.status}</span>
                          </td>
                          <td>{quiz.assignedCount}</td>
                          <td>{quiz.completedCount}</td>
                          <td>{quiz.averageScore !== null ? `${quiz.averageScore}%` : "—"}</td>
                          <td>{formatDuration(quiz.averageTimeTakenSeconds)}</td>
                          <td>{formatDate(quiz.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default ManagerDashboardPage;
