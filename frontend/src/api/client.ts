import { supabase } from "../lib/supabaseClient";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";
import { ApiError, logApiError } from "./errors";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

// The backend's origin (scheme + host + port), e.g. "http://localhost:4000".
// Exported so the GitHub OAuth popup handler can verify postMessage events come
// from the backend-served callback page (which posts from THIS origin, not the
// frontend's).
export const API_ORIGIN = new URL(BASE_URL).origin;

/**
 * Fetch wrapper for the backend API.
 * - Attaches the current Supabase JWT as a Bearer token so requireAuth can
 *   identify the user and read their role.
 * - Defaults to JSON, but skips the JSON Content-Type when sending FormData
 *   (e.g. file uploads) so the browser can set the multipart boundary.
 * - Throws with the backend's error message on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const isFormData = options.body instanceof FormData;
  const method = options.method ?? "GET";

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (networkErr) {
    // fetch only rejects when the request never got a response (offline,
    // DNS/CORS, server down). Surface it as a status-0 ApiError so callers
    // can tell "can't reach server" apart from a real HTTP error.
    const error = new ApiError({
      status: 0,
      method,
      path,
      rawMessage:
        networkErr instanceof Error ? networkErr.message : "Network request failed",
    });
    logApiError(error);
    throw error;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${res.status}`;
    const error = new ApiError({ status: res.status, method, path, rawMessage: message });
    logApiError(error);
    throw error;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export type QuizGenerationEvent =
  | {
      type: "progress";
      attempt: number;
      questionsDetected: number;
      totalQuestions: number;
      // Large quizzes are generated in ~10-question batches server-side
      // (backend/src/services/quizGenerator.ts) — batch/totalBatches let
      // the UI show which chunk is in flight, not just an overall count.
      batch: number;
      totalBatches: number;
    }
  | { type: "question"; index: number; question: QuizQuestion }
  | { type: "done"; quiz: GeneratedQuiz }
  | { type: "error"; message: string };

/**
 * Calls POST /api/quizzes/generate and reads the response as a stream of
 * Server-Sent Events, invoking onEvent for each "progress"/"done"/"error"
 * event as it arrives. Resolves with the finished quiz, or throws on an
 * "error" event / non-2xx response.
 */
export async function streamQuizGeneration(
  body: unknown,
  onEvent: (event: QuizGenerationEvent) => void
): Promise<GeneratedQuiz> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(`${BASE_URL}/api/quizzes/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const parsedBody = await res.json().catch(() => ({}));
    const message =
      (parsedBody as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${res.status}`;
    const error = new ApiError({
      status: res.status,
      method: "POST",
      path: "/api/quizzes/generate",
      rawMessage: message,
    });
    logApiError(error);
    throw error;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GeneratedQuiz | null = null;
  let streamError: string | null = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice("data:".length).trim();
      if (!payload) continue;

      let parsed: QuizGenerationEvent;
      try {
        parsed = JSON.parse(payload) as QuizGenerationEvent;
      } catch {
        continue; // ignore malformed SSE fragment
      }

      onEvent(parsed);
      if (parsed.type === "done") result = parsed.quiz;
      if (parsed.type === "error") streamError = parsed.message;
    }
  }

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("Quiz generation ended without a result");
  return result;
}

export type ChatSource = {
  documentId: number;
  documentTitle: string;
  snippet: string;
};

export type ChatMessageDto = {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[] | null;
  createdAt: string;
};

export type ChatResponse = {
  conversationId: number;
  answer: string;
  sources: ChatSource[];
  confidence: "high" | "medium" | "low";
  followUps: string[];
};

export type ChatConversationSummary = {
  id: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

// Sends a message to Sage, the library AI chatbot; omit conversationId to
// start a new thread (the backend returns the new thread's id for follow-ups).
export function sendChatMessage(input: {
  message: string;
  conversationId?: number;
}): Promise<ChatResponse> {
  return apiFetch<ChatResponse>("/api/library/chat", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// Starter questions for a fresh chat, grounded in the team's own documents and
// pre-validated server-side for answerability. May be fewer than 3, or empty
// (no docs / LLM unavailable) — the UI just shows no chips in that case.
export async function getStarterQuestions(): Promise<string[]> {
  const res = await apiFetch<{ data: { questions: string[] } }>(
    "/api/library/chat/starters"
  );
  return res.data.questions;
}

export async function listChatConversations(): Promise<ChatConversationSummary[]> {
  const res = await apiFetch<{ data: ChatConversationSummary[] }>(
    "/api/library/chat/conversations"
  );
  return res.data;
}

export async function getChatConversation(
  conversationId: number
): Promise<{ conversation: ChatConversationSummary; messages: ChatMessageDto[] }> {
  const res = await apiFetch<{
    data: { conversation: ChatConversationSummary; messages: ChatMessageDto[] };
  }>(`/api/library/chat/conversations/${conversationId}`);
  return res.data;
}

export function deleteChatConversation(conversationId: number): Promise<void> {
  return apiFetch<void>(`/api/library/chat/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export type TeamDocument = {
  id: number;
  title: string;
  sourceType: "upload" | "google_drive" | "github" | string;
  status: string;
  createdAt: string;
  uploadedByUserId: number;
  uploadedByName: string;
  isMine: boolean;
};

// All documents visible to the caller's team (not just their own uploads),
// with uploader attribution so a manager can reuse a teammate's upload.
export async function listTeamDocuments(): Promise<TeamDocument[]> {
  const res = await apiFetch<{ data: TeamDocument[] }>("/api/documents/team");
  return res.data;
}

export type MyDocument = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
};

// Only the caller's own uploads. Backs the manager upload dashboard so a
// brand-new manager starts with an empty list instead of seeing every
// document already in the team/database.
export async function listMyDocuments(): Promise<MyDocument[]> {
  const res = await apiFetch<{ data: MyDocument[] }>("/api/documents/mine");
  return res.data;
}

export type DocumentDetail = {
  id: number;
  title: string;
  sourceType: string;
  // The document's original location (GitHub blob URL, Google Drive link, …).
  // Backed by the DB's snake_case `source_url` column. Null for plain uploads.
  sourceUrl: string | null;
  rawText: string | null;
};

// Full detail for a single document, including the extracted text (for the
// in-app source viewer) and its original source URL (so markdown sources can
// link out to the real file instead of showing flattened text).
export async function getDocumentDetail(documentId: number): Promise<DocumentDetail> {
  const res = await apiFetch<{
    data: {
      id: number;
      title: string;
      sourceType: string;
      source_url: string | null;
      rawText: string | null;
    };
  }>(`/api/documents/${documentId}`);
  return {
    id: res.data.id,
    title: res.data.title,
    sourceType: res.data.sourceType,
    sourceUrl: res.data.source_url,
    rawText: res.data.rawText,
  };
}

export type DocumentFileUrl = {
  url: string | null;
  mimeType: string | null;
};

// A fresh, short-lived signed URL for the document's original file (so the
// viewer can embed the real PDF/DOCX). `url` is null for documents uploaded
// before this feature existed, or imported from Google Drive/GitHub — the
// caller should fall back to showing the extracted text instead.
export async function getDocumentFileUrl(documentId: number): Promise<DocumentFileUrl> {
  const res = await apiFetch<{ data: DocumentFileUrl }>(`/api/documents/${documentId}/file-url`);
  return res.data;
}

export type TeamMember = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
};

// Real team roster (id + name + email) for the "assign learners" picker —
// defaults to new hires since managers assign quizzes, not other managers.
export async function listTeamMembers(role: string = "new_hire"): Promise<TeamMember[]> {
  const res = await apiFetch<{ data: TeamMember[] }>(
    `/api/users/team-members?role=${encodeURIComponent(role)}`
  );
  return res.data;
}

export type AssignedQuiz = {
  assignmentId: number;
  quizId: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "pending" | "completed";
  passingScore: number | null;
  // Populated once the assignment is completed; the durable record of the
  // result, independent of the browser-local attempt cache. `score` is the
  // best (highest) score across all attempts; `attemptCount` is how many times
  // the quiz has been submitted.
  score: number | null;
  timeTakenSeconds: number | null;
  completedAt: string | null;
  attemptCount: number;
};

// Assigns a published quiz to a set of new hires on the manager's team.
export function assignQuiz(quizId: number, userIds: number[]): Promise<void> {
  return apiFetch<void>(`/api/quizzes/${quizId}/assignments`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  });
}

export function updateQuizStatus(quizId: number, status: "draft" | "published"): Promise<void> {
  return apiFetch<void>(`/api/quizzes/${quizId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function deleteQuiz(quizId: number): Promise<void> {
  return apiFetch<void>(`/api/quizzes/${quizId}`, {
    method: "DELETE",
  });
}

// Every quiz assigned to the caller, soonest-due-and-pending first.
export function listAssignedQuizzes(): Promise<AssignedQuiz[]> {
  return apiFetch<AssignedQuiz[]>("/api/quizzes/assigned/mine");
}

// Best-effort: marks the caller's own assignment for this quiz complete.
export type CompleteQuizAssignmentResult = {
  updated: boolean;
  // The durable record after this completion, echoed back so the results page
  // can show it on first paint instead of waiting for a follow-up refetch.
  attemptCount: number | null;
  score: number | null;
  timeTakenSeconds: number | null;
  completedAt: string | null;
};

export function completeQuizAssignment(
  quizId: number,
  score?: number,
  timeTakenSeconds?: number
): Promise<CompleteQuizAssignmentResult> {
  const body: Record<string, number> = {};
  if (typeof score === "number") body.score = score;
  if (typeof timeTakenSeconds === "number") body.timeTakenSeconds = timeTakenSeconds;

  return apiFetch<CompleteQuizAssignmentResult>(
    `/api/quizzes/${quizId}/assignments/me/complete`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export type ManagerDashboardQuiz = {
  id: number;
  title: string;
  status: "draft" | "published";
  createdAt: string;
  dueDate: string | null;
  passingScore: number | null;
  assignedCount: number;
  completedCount: number;
  averageScore: number | null;
  averageTimeTakenSeconds: number | null;
};

export type ManagerDashboardLearnerAssignment = {
  quizId: number;
  quizTitle: string;
  status: "pending" | "completed";
  score: number | null;
  timeTakenSeconds: number | null;
  completedAt: string | null;
  attemptCount: number;
  passingScore: number | null;
  dueDate: string | null;
};

export type ManagerDashboardLearner = {
  id: number;
  name: string;
  email: string;
  assignments: ManagerDashboardLearnerAssignment[];
};

export type ManagerDashboardData = {
  quizzes: ManagerDashboardQuiz[];
  learners: ManagerDashboardLearner[];
  // True when the signed-in manager has no active team yet (team setup didn't
  // complete at signup). The dashboard shows a "create your team" prompt rather
  // than treating it as an auth error. Optional for backward compatibility.
  needsTeam?: boolean;
  // The manager's active team id, per the DB (the source of truth — managers
  // switch teams server-side without a session refresh, so the JWT can lag).
  // The dashboard uses this to mark the active team. Absent on the needsTeam
  // placeholder and on older payloads.
  activeTeamId?: number;
  // The active team's display name, so the team switcher can show it on first
  // paint instead of a placeholder while it loads the owned-teams list. Absent
  // on the needsTeam placeholder and on older payloads.
  activeTeamName?: string | null;
};

// One-call payload for the manager dashboard: every quiz on the team with
// aggregated assignment stats, plus every new hire on the team with their
// own assignment history. Team-wide (not scoped to quizzes the caller
// personally created), since new hires are shared across the team.
export async function getManagerDashboard(): Promise<ManagerDashboardData> {
  const res = await apiFetch<{ data: ManagerDashboardData }>("/api/quizzes/manager/dashboard");
  return res.data;
}

export type MyTeam = {
  id: number;
  name: string;
};

// The caller's own team (id + name) — available to any signed-in role, so
// UI like the learner module header can show the team's real name.
export async function getMyTeam(): Promise<MyTeam> {
  const res = await apiFetch<{ data: MyTeam }>("/api/teams/mine");
  return res.data;
}

export type ManagedTeam = {
  id: number;
  name: string;
};

// Every team the calling manager owns, for the dashboard team switcher.
// Newest first (matches the backend ordering).
export async function listManagedTeams(): Promise<ManagedTeam[]> {
  const res = await apiFetch<{ data: ManagedTeam[] }>("/api/teams/managed");
  return res.data;
}

// Switches the manager's active team. The backend authorizes ownership and
// writes the change to the DB (the source of truth for the active team), so it
// takes effect on the next request — no session refresh needed.
export async function activateTeam(teamId: number): Promise<ManagedTeam> {
  const res = await apiFetch<{ data: ManagedTeam }>(`/api/teams/${teamId}/activate`, {
    method: "POST",
  });
  return res.data;
}

export type GithubRepoSummary = {
  full_name: string;
  description: string | null;
  private: boolean;
};

// Thrown by listGithubRepos when the signed-in manager hasn't connected their
// GitHub account (or the stored token was revoked). Lets the caller launch the
// connect flow instead of showing a generic error. Backed by the backend's 409
// `github_not_connected` response.
export class GithubNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubNotConnectedError";
  }
}

// Repositories for the "Pick from GitHub" modal, listed by the backend using
// THIS manager's own stored GitHub OAuth token — so they see their own repos.
// Throws GithubNotConnectedError (backend 409) when no connection exists yet.
export async function listGithubRepos(): Promise<GithubRepoSummary[]> {
  try {
    const res = await apiFetch<{ data: GithubRepoSummary[] }>("/api/documents/github/repos");
    return res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      throw new GithubNotConnectedError(err.message);
    }
    throw err;
  }
}

export type GithubConnectionStatus = {
  connected: boolean;
  githubLogin: string | null;
};

// Whether the signed-in manager has a GitHub account connected, and as whom.
export async function getGithubConnectionStatus(): Promise<GithubConnectionStatus> {
  const res = await apiFetch<{ data: GithubConnectionStatus }>(
    "/api/documents/github/connection"
  );
  return res.data;
}

// The GitHub authorize URL to open (in a popup) so the manager can connect
// their account. The URL carries a signed state binding the flow to this user.
export async function getGithubOauthUrl(): Promise<string> {
  const res = await apiFetch<{ data: { url: string } }>(
    "/api/documents/github/oauth/start"
  );
  return res.data.url;
}
