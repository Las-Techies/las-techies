import { supabase } from "../lib/supabaseClient";
import type { GeneratedQuiz, QuizQuestion } from "../features/quiz/types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

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

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      (body as { error?: { message?: string } })?.error?.message ??
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export type QuizGenerationEvent =
  | { type: "progress"; attempt: number; questionsDetected: number; totalQuestions: number }
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
    throw new Error(message);
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
