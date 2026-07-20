import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import { apiFetch } from "../api/client";
import { saveModuleProgress } from "../features/quiz/storage";
import type { GeneratedQuiz } from "../features/quiz/types";
import {
  learnerModule,
  libraryDocs,
  recentlyAdded,
  type SourceKind,
} from "../features/learner/data";

type Filter = "All" | "Files" | "Confluence" | "Repos";
const FILTERS: Filter[] = ["All", "Files", "Confluence", "Repos"];

// A document as rendered in the library. Real backend uploads carry a
// `remoteId` (so "View source" can fetch their extracted text on demand);
// demo entries carry inline `content` instead.
type DisplayDoc = {
  id: string;
  remoteId?: number;
  title: string;
  kind: SourceKind;
  typeLabel: string;
  addedLabel: string;
  pages?: number;
  content?: string;
  highlight?: string;
};

type ChatMessage = { role: "assistant" | "user"; text: string };

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

function renderDocParagraphs(content: string, highlight?: string) {
  return content.split("\n\n").map((paragraph, index) => {
    const isTitle = index === 0;
    const isHeading = /^\d+(\.\d+)?\.?\s/.test(paragraph) && paragraph.length < 80;
    if (isTitle) return <h3 key={index}>{paragraph}</h3>;
    if (isHeading) return <h4 key={index}>{paragraph}</h4>;

    if (highlight && paragraph.includes(highlight)) {
      const [before, after] = paragraph.split(highlight);
      return (
        <p key={index}>
          {before}
          <mark>{highlight}</mark>
          {after}
        </p>
      );
    }
    return <p key={index}>{paragraph}</p>;
  });
}

const INITIAL_CHAT: ChatMessage[] = [
  {
    role: "assistant",
    text: "Hello! I can answer questions about these materials. What would you like to know?",
  },
  { role: "user", text: "What PPE is needed in Zone A?" },
  {
    role: "assistant",
    text: "In Zone A, you are required to wear a hard hat, safety glasses with side shields, gloves appropriate to the task, steel-toe boots, and a hi-vis vest. If noise levels exceed 85 dB, you must also wear hearing protection.",
  },
];

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

function LearnerModulePage() {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<Filter>("All");
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openDoc, setOpenDoc] = useState<DisplayDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const [moduleTitle, setModuleTitle] = useState(learnerModule.title);
  const [recentVisible, setRecentVisible] = useState(5);
  const [remoteFiles, setRemoteFiles] = useState<DisplayDoc[] | null>(null);
  const [sourceText, setSourceText] = useState<Record<number, string>>({});
  const [sourceLoadingId, setSourceLoadingId] = useState<number | null>(null);
  const [sourceError, setSourceError] = useState("");

  // Pull the team's real uploaded documents (and the assigned quiz title) from
  // the backend. Falls back silently to the demo library if unauthenticated or
  // empty, so the module is always presentable.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: { id: number; title: string; status: string; createdAt?: string }[] }>(
      "/api/documents/mine"
    )
      .then((res) => {
        if (cancelled) return;
        const files = (res.data ?? []).map<DisplayDoc>((doc) => ({
          id: `doc-${doc.id}`,
          remoteId: doc.id,
          title: doc.title,
          kind: "file",
          typeLabel: fileTypeLabel(doc.title),
          addedLabel: relativeAddedLabel(doc.createdAt),
        }));
        if (files.length > 0) setRemoteFiles(files);
      })
      .catch(() => {
        /* keep demo library */
      });
    apiFetch<GeneratedQuiz | null>("/api/quizzes/mine/latest")
      .then((quiz) => {
        if (!cancelled && quiz?.title) setModuleTitle(quiz.title);
      })
      .catch(() => {
        /* keep default title */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Real uploads replace the demo "Files" when available; Confluence/Repo
  // entries stay as demo sources since the backend only ingests file uploads.
  const fileDocs = remoteFiles ?? libraryDocs.filter((doc) => doc.kind === "file");
  const otherDocs = libraryDocs.filter((doc) => doc.kind !== "file");
  const allDocs = useMemo<DisplayDoc[]>(
    () => [...fileDocs, ...otherDocs],
    [fileDocs, otherDocs]
  );

  const recentAll = remoteFiles
    ? remoteFiles.map((doc) => ({
        id: doc.id,
        title: doc.title,
        addedLabel: doc.addedLabel,
      }))
    : recentlyAdded;
  const visibleRecent = recentAll.slice(0, recentVisible);
  const hasMoreRecent = recentAll.length > recentVisible;

  const totalDocs = allDocs.length;
  const readCount = readIds.size;
  const progressPercent = totalDocs ? Math.round((readCount / totalDocs) * 100) : 0;

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
    if (doc.remoteId != null) loadSource(doc.remoteId);
  };

  const sendMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setIsTyping(true);
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Based on this module's documents, here's what I found. Open a source with \u201cView source\u201d to read the exact passage this comes from.",
        },
      ]);
      setIsTyping(false);
      typingTimerRef.current = null;
    }, 1100);
  };

  // Keep the newest message (or the typing indicator) in view as the chat grows.
  useEffect(() => {
    const node = messagesRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, isTyping]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    };
  }, []);

  const docsForKind = (kind: SourceKind) => allDocs.filter((doc) => doc.kind === kind);

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>{moduleTitle}</h1>
        <p className="subtle">Assigned by: {learnerModule.assignedBy}</p>

        <div className="module-progress">
          <span className="module-progress-label">Progress</span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span className="progress-label">
            {readCount} / {totalDocs} read
          </span>
        </div>

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
              const docs = docsForKind(section.kind);
              if (docs.length === 0) return null;
              return (
                <div className="lib-section" key={section.label}>
                  <p className="lib-section-label">{section.label}</p>
                  {docs.map((doc) => {
                    const isRead = readIds.has(doc.id);
                    return (
                      <div className="doc-row" key={doc.id}>
                        <DocIcon kind={doc.kind} />
                        <div className="doc-info">
                          <strong className="doc-title">{doc.title}</strong>
                          <span className="doc-meta">
                            {doc.typeLabel} · {doc.addedLabel}
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
          </div>

          <div className="card ai-card">
            <div className="ai-head">
              <Sparkle />
              <h2>AI Assistant</h2>
              <span className="ai-pill">AI</span>
            </div>
            <div className="ai-messages" ref={messagesRef}>
              {messages.map((message, index) => (
                <div key={index} className={`bubble-row ${message.role}`}>
                  {message.role === "assistant" ? (
                    <span className="bubble-avatar">
                      <Sparkle />
                    </span>
                  ) : null}
                  <div className={`bubble ${message.role}`}>{message.text}</div>
                </div>
              ))}
              {isTyping ? (
                <div className="bubble-row assistant">
                  <span className="bubble-avatar">
                    <Sparkle />
                  </span>
                  <div className="bubble assistant typing" aria-label="AI is typing">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="ai-input-row">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage();
                }}
                placeholder="Ask a question…"
              />
              <button type="button" className="primary-btn" onClick={sendMessage}>
                Send
              </button>
            </div>
          </div>
        </section>

        <div className="page-actions">
          <button className="secondary-btn" type="button" onClick={() => navigate("/home")}>
            ← Back
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={() => navigate("/quiz-taking")}
          >
            Take Quiz →
          </button>
        </div>
      </main>

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
                <span>
                  {openDoc.typeLabel}
                  {openDoc.pages ? ` · ${openDoc.pages} pages` : ""}
                </span>
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
              {openDoc.remoteId != null ? (
                sourceLoadingId === openDoc.remoteId ? (
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
                )
              ) : (
                <article className="doc-page">
                  {renderDocParagraphs(openDoc.content ?? "")}
                </article>
              )}
            </div>

            <footer className="doc-modal-foot">
              <div className="pager">
                <button type="button" aria-label="Previous page">
                  ‹
                </button>
                <span>Page 1 of {openDoc.pages ?? 1}</span>
                <button type="button" aria-label="Next page">
                  ›
                </button>
              </div>
              <button type="button" className="primary-btn" onClick={() => setOpenDoc(null)}>
                Done
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LearnerModulePage;
