import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import {
  apiFetch,
  deleteChatConversation,
  getChatConversation,
  getDocumentFileUrl,
  listChatConversations,
  listTeamDocuments,
  sendChatMessage,
  type ChatConversationSummary,
  type ChatSource,
  type DocumentFileUrl,
} from "../api/client";
import { saveModuleProgress } from "../features/quiz/storage";
import type { GeneratedQuiz } from "../features/quiz/types";
import { type SourceKind } from "../features/learner/data";

type Filter = "All" | "Files" | "Confluence" | "Repos";
const FILTERS: Filter[] = ["All", "Files", "Confluence", "Repos"];

// A document as rendered in the library. Backed by a real uploaded document;
// `remoteId` lets "View source" fetch its original file (or extracted text,
// for documents that predate the original-file viewer) on demand.
type DisplayDoc = {
  id: string;
  remoteId: number;
  title: string;
  kind: SourceKind;
  typeLabel: string;
  addedLabel: string;
  // null means the current user uploaded it themselves.
  attribution: string | null;
};

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isViewableInline(mimeType: string | null): boolean {
  return mimeType === PDF_MIME || mimeType === DOCX_MIME;
}

// Microsoft's viewer can render DOCX inline given any internet-reachable
// URL (our Supabase signed URL qualifies) — there's no native browser
// equivalent to an <iframe> PDF for Office formats.
function embedSrcFor(url: string, mimeType: string | null): string {
  if (mimeType === DOCX_MIME) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }
  return url;
}

type ChatMessage = { role: "assistant" | "user"; text: string; sources?: ChatSource[] };

const fileTypeLabel = (title: string): string => {
  const ext = title.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "doc" || ext === "docx") return "Word";
  if (ext === "txt") return "Text";
  if (ext === "md") return "Markdown";
  return "File";
};

const relativeAddedLabel = (createdAt?: string | null): string => {
  if (!createdAt) return "Recently added";
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return "Recently added";
  const days = Math.floor((Date.now() - created.getTime()) / 86_400_000);
  if (days <= 0) return "Added today";
  if (days === 1) return "Added yesterday";
  return `Added ${days} days ago`;
};

// Short relative timestamp for chat history entries, e.g. "5m ago", "Yesterday".
const relativeTimeLabel = (isoDate: string): string => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

function renderDocParagraphs(content: string, highlight?: string) {
  return content.split("\n\n").map((paragraph, index) => {
    const isTitle = index === 0;
    const isHeading = /^\d+(\.\d+)?\.?\s/.test(paragraph) && paragraph.length < 80;
    if (isTitle) return <h3 key={index}>{paragraph}</h3>;
    if (isHeading) return <h4 key={index}>{paragraph}</h4>;
    return <p key={index}>{paragraph}</p>;
  });
}

const GREETING: ChatMessage = {
  role: "assistant",
  text: "Hi, I'm Sage! I can answer questions about these materials. What would you like to know?",
};

function DocIcon({ kind }: { kind: SourceKind }) {
  if (kind === "confluence") {
    return (
      <svg className="doc-icon confluence" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path
          d="M4 16.5c3-4 6-4 9 0 2.6 3.2 5 2.4 7-.5l-3-2c-1 1.4-1.9 1.6-3 .2-3.2-4.2-6.8-4.2-10 .3l3 2z"
          fill="#1868db"
        />
      </svg>
    );
  }
  if (kind === "repo") {
    return (
      <svg className="doc-icon repo" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <path
          fill="#181818"
          d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"
        />
      </svg>
    );
  }
  return (
    <svg className="doc-icon file" viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="#ba0517"
        d="M6 2h8l4 4v16a0 0 0 0 1 0 0H6a0 0 0 0 1 0 0V2Z"
        opacity="0.12"
      />
      <path
        fill="none"
        stroke="#ba0517"
        strokeWidth="1.6"
        d="M6.8 2.8h6.9l3.5 3.5v14.9H6.8z"
      />
      <text x="12" y="16" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#ba0517">
        PDF
      </text>
    </svg>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        fill="#0176d3"
        d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8z"
      />
      <path fill="#0176d3" d="M18.5 14l.9 2.6L22 17.5l-2.6.9L18.5 21l-.9-2.6L15 17.5l2.6-.9z" />
    </svg>
  );
}

function NewChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="#001a66"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="#001a66"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="26"
      height="26"
      fill="none"
      stroke="#fff"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function DeleteChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="#001a66"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function LearnerModulePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Which assigned quiz this module page is for. Falls back to "my latest"
  // (below) when arriving without a quizId, e.g. an old bookmark.
  const quizIdParam = searchParams.get("quizId");
  const [quizId, setQuizId] = useState<number | null>(
    quizIdParam ? Number(quizIdParam) : null
  );
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openDoc, setOpenDoc] = useState<DisplayDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [isConversationLoading, setIsConversationLoading] = useState(true);
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState<number | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const [moduleTitle, setModuleTitle] = useState("");
  const [recentVisible, setRecentVisible] = useState(5);
  const [docs, setDocs] = useState<DisplayDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceText, setSourceText] = useState<Record<number, string>>({});
  const [sourceLoadingId, setSourceLoadingId] = useState<number | null>(null);
  const [sourceError, setSourceError] = useState("");
  // Signed URL (+ mime type) for the document's original file, so the modal
  // can embed the real PDF/DOCX instead of the extracted-text fallback.
  // Fetched fresh every time the modal opens rather than cached, since
  // signed URLs expire after a few minutes.
  const [fileUrlLoadingId, setFileUrlLoadingId] = useState<number | null>(null);
  const [fileUrl, setFileUrl] = useState<DocumentFileUrl | null>(null);
  const [timeLimit, setTimeLimit] = useState<number | null>(null);
  // Distinguishes "haven't heard back from the API yet" (both stay null/false)
  // from "the manager genuinely left this quiz untimed".
  const [hasNoTimeLimit, setHasNoTimeLimit] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Load the team's real uploaded documents — everyone's, not just this
  // user's own uploads, since the library is scoped to the whole team (and
  // the assigned quiz's title + time limit) from the backend. A loading
  // skeleton shows while the request is in flight; if it fails or returns
  // nothing we land on a clean empty state — never demo/fake data.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Team-scoped, not uploader-scoped: the manager uploaded these documents,
    // so /mine (uploadedByUserId === this user) would be empty for a new hire.
    // The new hire should see everything on their team.
    apiFetch<{ data: { id: number; title: string; status: string; createdAt?: string }[] }>(
      "/api/documents/team"
    )
      .then((res) => {
        if (cancelled) return;
        const files = teamDocs
          .filter((doc) => doc.status.toLowerCase() === "ready")
          .map<DisplayDoc>((doc) => ({
            id: `doc-${doc.id}`,
            remoteId: doc.id,
            title: doc.title,
            kind: "file",
            typeLabel: fileTypeLabel(doc.title),
            addedLabel: relativeAddedLabel(doc.createdAt),
            attribution: doc.isMine ? null : doc.uploadedByName,
          }));
        setDocs(files);
      })
      .catch(() => {
        /* land on the empty state rather than showing fake data */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // Prefer the specific quiz this page was opened for (from the new-hire's
    // assigned-quiz list); fall back to "my latest" only when no quizId was
    // passed in, so old links/bookmarks without one still work.
    const quizRequest = quizIdParam
      ? apiFetch<GeneratedQuiz | null>(`/api/quizzes/${quizIdParam}`)
      : apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest");

    quizRequest
      .then((quiz) => {
        if (cancelled || !quiz) return;
        if (quiz.title) setModuleTitle(quiz.title);
        if (quiz.timeLimitMinutes) {
          setTimeLimit(quiz.timeLimitMinutes);
        } else {
          setHasNoTimeLimit(true);
        }
      })
      .catch(() => {
        /* keep default title */
      });
    return () => {
      cancelled = true;
    };
  }, [quizIdParam]);

  // Hydrate the chat panel from the user's most recently active thread, if
  // any. Conversations already come back sorted by updatedAt desc, so the
  // first one is the latest. Any failure (or no threads yet) leaves the
  // plain greeting in place, same "fail quietly" pattern as above. While
  // this is in flight we show a "loading last session" placeholder instead
  // of letting the greeting flash before the real history swaps in (e.g.
  // when returning to this tab).
  useEffect(() => {
    let cancelled = false;
    setIsConversationLoading(true);
    listChatConversations()
      .then((list) => {
        if (cancelled) return;
        setConversations(list);
        const latest = list[0];
        if (!latest) return;
        return getChatConversation(latest.id).then((res) => {
          if (cancelled) return;
          if (res.messages.length === 0) return;
          setMessages(
            res.messages.map((m) => ({
              role: m.role,
              text: m.content,
              sources: m.sources ?? undefined,
            }))
          );
          setConversationId(res.conversation.id);
        });
      })
      .catch(() => {
        /* keep the greeting-only fallback */
      })
      .finally(() => {
        if (!cancelled) setIsConversationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the history dropdown on outside click, same lightweight pattern
  // as the doc-source modal's backdrop click-to-close.
  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(event.target as Node)) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isHistoryOpen]);

  const filterToKind: Record<Exclude<Filter, "All">, SourceKind> = {
    Files: "file",
    Confluence: "confluence",
    Repos: "repo",
  };

  const sections: { label: string; kind: SourceKind }[] = [
    { label: "Files", kind: "file" },
    { label: "Confluence", kind: "confluence" },
    { label: "Repos", kind: "repo" },
  ];

  const visibleSections =
    activeFilter === "All"
      ? sections
      : sections.filter((section) => section.kind === filterToKind[activeFilter]);

  const docsForKind = (kind: SourceKind) => docs.filter((doc) => doc.kind === kind);

  const recentAll = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    addedLabel: doc.addedLabel,
  }));
  const visibleRecent = recentAll.slice(0, recentVisible);
  const hasMoreRecent = recentAll.length > recentVisible;

  const totalDocs = docs.length;
  const readCount = readIds.size;
  const progressPercent = totalDocs ? Math.round((readCount / totalDocs) * 100) : 0;
  const visibleDocCount = visibleSections.reduce(
    (sum, section) => sum + docsForKind(section.kind).length,
    0
  );

  useEffect(() => {
    saveModuleProgress({ read: readCount, total: totalDocs });
  }, [readCount, totalDocs]);

  const loadSource = (remoteId: number) => {
    if (sourceText[remoteId]) return;
    setSourceLoadingId(remoteId);
    setSourceError("");
    apiFetch<{ data: { rawText: string | null } }>(`/api/documents/${remoteId}`)
      .then((res) => {
        setSourceText((prev) => ({
          ...prev,
          [remoteId]: res.data.rawText ?? "No extracted text available for this document.",
        }));
      })
      .catch((err) => {
        setSourceError(err instanceof Error ? err.message : "Failed to load source.");
      })
      .finally(() => setSourceLoadingId(null));
  };

  const openSource = (doc: DisplayDoc) => {
    setOpenDoc(doc);
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(doc.id);
      return next;
    });
    setFileUrl(null);
    setFileUrlLoadingId(doc.remoteId);
    getDocumentFileUrl(doc.remoteId)
      .then((result) => setFileUrl(result))
      .catch(() => setFileUrl({ url: null, mimeType: null }))
      .finally(() => setFileUrlLoadingId(null));
    // Extracted text is still the fallback for legacy documents (no
    // original file stored) and for file types we don't embed inline.
    loadSource(doc.remoteId);
  };

  // Refreshes the history list in the background (e.g. after sending a
  // message, so a brand-new thread or a bumped updatedAt shows up next time
  // the panel is opened). Failures are silently ignored — the list will
  // just be slightly stale until the next successful refresh.
  const refreshConversations = () => {
    listChatConversations()
      .then((list) => setConversations(list))
      .catch(() => {
        /* keep the existing list */
      });
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || isTyping || isConversationLoading) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setIsTyping(true);
    sendChatMessage({ message: text, conversationId: conversationId ?? undefined })
      .then((res) => {
        setConversationId(res.conversationId);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: res.answer, sources: res.sources },
        ]);
        refreshConversations();
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Sorry, I couldn't reach Sage. Please try again.",
          },
        ]);
      })
      .finally(() => setIsTyping(false));
  };

  const toggleHistory = () => {
    setIsHistoryOpen((open) => {
      const next = !open;
      if (next) {
        setHistoryError("");
        setIsHistoryLoading(true);
        listChatConversations()
          .then((list) => setConversations(list))
          .catch(() => setHistoryError("Couldn't load chat history."))
          .finally(() => setIsHistoryLoading(false));
      }
      return next;
    });
  };

  // Starts a fresh thread locally; the backend doesn't create a row for it
  // until the first message is actually sent (conversationId omitted).
  const startNewChat = () => {
    if (isTyping || isConversationLoading) return;
    setIsHistoryOpen(false);
    setConversationId(null);
    setMessages([GREETING]);
  };

  const switchConversation = (id: number) => {
    setIsHistoryOpen(false);
    if (id === conversationId) return;
    setIsConversationLoading(true);
    getChatConversation(id)
      .then((res) => {
        setMessages(
          res.messages.length > 0
            ? res.messages.map((m) => ({
                role: m.role,
                text: m.content,
                sources: m.sources ?? undefined,
              }))
            : [GREETING]
        );
        setConversationId(res.conversation.id);
      })
      .catch(() => {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Sorry, I couldn't load that conversation. Please try again." },
        ]);
      })
      .finally(() => setIsConversationLoading(false));
  };

  const handleDeleteConversation = (id: number, event: ReactMouseEvent) => {
    event.stopPropagation();
    setHistoryError("");
    setDeletingConversationId(id);
    deleteChatConversation(id)
      .then(() => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (id === conversationId) {
          setConversationId(null);
          setMessages([GREETING]);
        }
      })
      .catch(() => setHistoryError("Couldn't delete that conversation."))
      .finally(() => setDeletingConversationId(null));
  };

  // Keep the newest message (or the typing indicator) in view as the chat grows.
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isTyping]);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        {loading && !moduleTitle ? (
          <div className="title-loading loading-line" style={{ maxWidth: 320 }} />
        ) : (
          <h1>{moduleTitle || "Onboarding module"}</h1>
        )}

        {!loading && docs.length > 0 ? (
          <div className="module-progress">
            <span className="module-progress-label">Progress</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="progress-label">
              {readCount} / {totalDocs} read
            </span>
          </div>
        ) : null}

        <section className="module-grid">
          <div className="card lib-card">
            <div className="lib-tabs">
              {FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={`lib-chip ${activeFilter === filter ? "selected" : ""}`}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="lib-loading" aria-busy="true">
                <div className="loading-line" />
                <div className="loading-line" />
                <div className="loading-line" />
                <div className="loading-line short" />
              </div>
            ) : docs.length === 0 ? (
              <p className="lib-empty">
                No documents have been added to this module yet.
              </p>
            ) : (
              <>
                {activeFilter === "All" ? (
                  <>
                    <p className="lib-section-label">Recently added</p>
                    <div className="recent-row">
                      {visibleRecent.map((item) => (
                        <div className="recent-card" key={item.id}>
                          <DocIcon kind="file" />
                          <div>
                            <strong>{item.title}</strong>
                            <span>{item.addedLabel}</span>
                          </div>
                        </div>
                      ))}
                      {hasMoreRecent ? (
                        <button
                          type="button"
                          className="recent-more"
                          aria-label="Show more recently added"
                          title="Show more"
                          onClick={() => setRecentVisible((count) => count + 5)}
                        >
                          →
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {visibleSections.map((section) => {
                  const sectionDocs = docsForKind(section.kind);
                  if (sectionDocs.length === 0) return null;
                  return (
                    <div className="lib-section" key={section.label}>
                      <p className="lib-section-label">{section.label}</p>
                      {sectionDocs.map((doc) => {
                        const isRead = readIds.has(doc.id);
                        return (
                          <div className="doc-row" key={doc.id}>
                            <DocIcon kind={doc.kind} />
                            <div className="doc-info">
                              <strong className="doc-title">{doc.title}</strong>
                              <span className="doc-meta">
                                {doc.typeLabel} · {doc.addedLabel}
                                {doc.attribution ? ` · Uploaded by ${doc.attribution}` : ""}
                              </span>
                            </div>
                            <span className={`read-badge ${isRead ? "read" : "unread"}`}>
                              {isRead ? "✓ Read" : "○ Unread"}
                            </span>
                            <button
                              type="button"
                              className="view-source"
                              onClick={() => openSource(doc)}
                            >
                              View source
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {visibleDocCount === 0 ? (
                  <p className="lib-empty">
                    No {activeFilter.toLowerCase()} documents in this module.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </section>

        <div className="page-actions">
          <button className="secondary-btn" type="button" onClick={() => navigate("/home")}>
            ← Back
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={() => setConfirmStart(true)}
          >
            Take Quiz →
          </button>
        </div>
      </main>

      <button
        type="button"
        className={`chat-fab ${isChatOpen ? "open" : ""}`}
        onClick={() => setIsChatOpen((open) => !open)}
        aria-label={isChatOpen ? "Close Ask Sage chat" : "Open Ask Sage chat"}
      >
        {isChatOpen ? <span className="chat-fab-close" aria-hidden>✕</span> : <ChatBubbleIcon />}
      </button>

      {isChatOpen ? (
        <div className="card ai-card chat-widget-panel">
          <div className="ai-head" ref={historyRef}>
            <Sparkle />
            <h2>Ask Sage</h2>
            <span className="ai-pill">AI</span>
            <div className="ai-head-actions">
              <button
                type="button"
                className="ai-head-btn"
                title="New chat"
                aria-label="Start a new chat"
                onClick={startNewChat}
                disabled={isTyping || isConversationLoading}
              >
                <NewChatIcon />
              </button>
              <button
                type="button"
                className="ai-head-btn"
                title="Chat history"
                aria-label="View chat history"
                onClick={toggleHistory}
              >
                <HistoryIcon />
              </button>
            </div>

            {isHistoryOpen ? (
              <div className="ai-history-panel" role="menu">
                <div className="ai-history-head">
                  <span>Chat history</span>
                  <button
                    type="button"
                    className="ai-history-close"
                    aria-label="Close history"
                    onClick={() => setIsHistoryOpen(false)}
                  >
                    ✕
                  </button>
                </div>
                {isHistoryLoading ? (
                  <p className="subtle ai-history-empty">Loading…</p>
                ) : conversations.length === 0 ? (
                  <p className="subtle ai-history-empty">No past conversations yet.</p>
                ) : (
                  <ul className="ai-history-list">
                    {conversations.map((conv) => (
                      <li key={conv.id}>
                        <button
                          type="button"
                          className={`ai-history-item ${conv.id === conversationId ? "active" : ""}`}
                          onClick={() => switchConversation(conv.id)}
                        >
                          <span className="ai-history-title">
                            {conv.title ?? "Untitled conversation"}
                          </span>
                          <span className="ai-history-time">
                            {relativeTimeLabel(conv.updatedAt)}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="ai-history-delete"
                          title="Delete conversation"
                          aria-label="Delete conversation"
                          onClick={(event) => handleDeleteConversation(conv.id, event)}
                          disabled={deletingConversationId === conv.id}
                        >
                          {deletingConversationId === conv.id ? "…" : <DeleteChatIcon />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {historyError ? <p className="form-error ai-history-empty">{historyError}</p> : null}
              </div>
            ) : null}
          </div>
          <div className="ai-messages" ref={messagesRef}>
            {isConversationLoading ? (
              <div className="ai-loading" aria-live="polite">
                <span className="ai-loading-spinner" aria-hidden />
                Loading Sage's last session…
              </div>
            ) : (
              <>
                {messages.map((message, index) => {
                  const sourceTitles = message.sources
                    ? Array.from(new Set(message.sources.map((s) => s.documentTitle)))
                    : [];
                  return (
                    <div key={index} className={`bubble-row ${message.role}`}>
                      {message.role === "assistant" ? (
                        <span className="bubble-avatar">
                          <Sparkle />
                        </span>
                      ) : null}
                      <div>
                        <div className={`bubble ${message.role}`}>{message.text}</div>
                        {sourceTitles.length > 0 ? (
                          <p className="bubble-sources">Sources: {sourceTitles.join(", ")}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {isTyping ? (
                  <div className="bubble-row assistant">
                    <span className="bubble-avatar">
                      <Sparkle />
                    </span>
                    <div className="bubble assistant typing" aria-label="Sage is typing">
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                      <span className="typing-dot" />
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="ai-input-row">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") sendMessage();
              }}
              placeholder="Ask a question…"
              disabled={isTyping || isConversationLoading}
            />
            <button
              type="button"
              className="primary-btn"
              onClick={sendMessage}
              disabled={isTyping || isConversationLoading}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}

      {openDoc ? (
        <div
          className="doc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Source: ${openDoc.title}`}
          onClick={() => setOpenDoc(null)}
        >
          <div className="doc-modal" onClick={(event) => event.stopPropagation()}>
            <header className="doc-modal-head">
              <DocIcon kind={openDoc.kind} />
              <div className="doc-modal-title">
                <strong>{openDoc.title}</strong>
                <span>{openDoc.typeLabel}</span>
              </div>
              <button
                type="button"
                className="doc-modal-close"
                aria-label="Close"
                onClick={() => setOpenDoc(null)}
              >
                ✕
              </button>
            </header>

            <div className="doc-modal-body">
              {fileUrlLoadingId === openDoc.remoteId ? (
                <p className="subtle">Loading document…</p>
              ) : fileUrl?.url && isViewableInline(fileUrl.mimeType) ? (
                <iframe
                  className="doc-modal-iframe"
                  src={embedSrcFor(fileUrl.url, fileUrl.mimeType)}
                  title={openDoc.title}
                />
              ) : sourceLoadingId === openDoc.remoteId ? (
                <p className="subtle">Loading source…</p>
              ) : sourceError && !sourceText[openDoc.remoteId] ? (
                <p className="form-error">{sourceError}</p>
              ) : (
                <article className="doc-page">
                  {renderDocParagraphs(
                    sourceText[openDoc.remoteId] ??
                      "No extracted text available for this document."
                  )}
                </article>
              )}
            </div>

            <footer className="doc-modal-foot">
              {fileUrl?.url ? (
                <a
                  className="doc-modal-open-original"
                  href={fileUrl.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original
                </a>
              ) : null}
              <button type="button" className="primary-btn" onClick={() => setOpenDoc(null)}>
                Done
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmStart ? (
        <div
          className="doc-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Start quiz"
          onClick={() => setConfirmStart(false)}
        >
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26">
                <circle cx="12" cy="13" r="8" fill="none" stroke="#0176d3" strokeWidth="1.8" />
                <path
                  d="M12 9v4l2.5 2"
                  fill="none"
                  stroke="#0176d3"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path d="M9 2h6" stroke="#0176d3" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2>Ready to start the quiz?</h2>
            <p className="confirm-lead">
              {hasNoTimeLimit ? (
                "This quiz has no time limit — take as long as you need."
              ) : (
                <>
                  You'll have <strong>{timeLimit ?? 30} minutes</strong> to complete it once you
                  begin.
                </>
              )}
            </p>
            <p className="confirm-warn">
              Once you start, you won't be able to return to the learner module until you
              submit. Make sure you've reviewed the materials.
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setConfirmStart(false)}
              >
                Not yet
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  setConfirmStart(false);
                  navigate(quizId ? `/quiz-taking?quizId=${quizId}` : "/quiz-taking");
                }}
              >
                Start quiz →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LearnerModulePage;
