import type { ChangeEventHandler, DragEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import AlertBanner from "../components/AlertBanner";
import { apiFetch, listMyDocuments } from "../api/client";
import {
  loadDeselectedDocumentIds,
  loadUploadedDocuments,
  saveDeselectedDocumentIds,
  saveUploadedDocuments,
} from "../features/quiz/storage";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";
import trashIcon from "../assets/trash-icon.png";
import { supabase } from "../lib/supabaseClient";
import { CircleCheckIcon } from "../components/icons/QuizIcons";

type UploadStatus = "Processing..." | "Ready" | "Failed";

type UploadedItem = {
  key: string;
  documentId: number | null;
  name: string;
  meta: string;
  status: UploadStatus;
  createdAt: string | null;
  attribution: string | null;
  isMine: boolean;
};

type UploadResponse = {
  data: { id: number; title: string; status: string; createdAt: string };
};

type GoogleDriveFolderImportResponse = {
  data: {
    folderId: string;
    imported: number;
    failed: number;
    skipped: number;
    items: Array<{
      documentId: number | null;
      title: string;
      status: "ready" | "failed";
      createdAt: string | null;
    }>;
  };
};

type GithubRepoImportResponse = {
  data: {
    owner: string;
    repo: string;
    branch: string;
    imported: number;
    failed: number;
    skipped: number;
    items: Array<{
      documentId: number | null;
      title: string;
      status: "ready" | "failed";
      createdAt: string | null;
    }>;
  };
};

type LinkKind = "google_doc" | "google_folder" | "github_repo" | "unsupported";

const formatBytes = (size: number) => {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const fileTypeLabel = (file: File) => file.name.split(".").pop()?.toUpperCase() ?? "FILE";
const mapStoredStatus = (status: string): UploadStatus =>
  status.toLowerCase() === "ready"
    ? "Ready"
    : status.toLowerCase() === "failed"
      ? "Failed"
      : "Processing...";
const formatAddedDate = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const detectLinkKind = (value: string): LinkKind => {
  const trimmed = value.trim();
  if (!trimmed) return "unsupported";

  if (/^https:\/\/docs\.google\.com\/document\/d\/[^/]+/i.test(trimmed)) {
    return "google_doc";
  }

  if (
    /^https:\/\/drive\.google\.com\/drive\/folders\/[^/]+/i.test(trimmed) ||
    /^[A-Za-z0-9_-]{10,}$/.test(trimmed)
  ) {
    return "google_folder";
  }

  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(trimmed)) {
    return "github_repo";
  }

  return "unsupported";
};

function UploadContentPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [error, setError] = useState("");
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [linkInput, setLinkInput] = useState("");
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  // Which documents are unchecked for quiz generation. Stored as "deselected"
  // rather than "selected" so every document — including ones uploaded after
  // this was first set — defaults to checked. Nothing here ever removes a
  // document from this page; that only happens via explicit delete.
  const [deselectedDocumentIds, setDeselectedDocumentIds] = useState<Set<number>>(() =>
    loadDeselectedDocumentIds()
  );

  const toggleDocumentSelected = (documentId: number) => {
    setDeselectedDocumentIds((prev) => {
      const next = new Set(prev);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      saveDeselectedDocumentIds(next);
      return next;
    });
  };

  const persistReadyDocs = (items: UploadedItem[]) => {
    const readyDocs = items
      .filter((item) => item.status === "Ready" && item.documentId !== null)
      .map((item) => ({
        id: item.documentId as number,
        title: item.name,
        status: "ready",
        createdAt: item.createdAt,
      }));
    saveUploadedDocuments(readyDocs);
  };

  const refreshGithubConnectionStatus = async () => {
    const { data } = await supabase.auth.getSession();
    const identities = data.session?.user?.identities ?? [];
    const hasGithubIdentity = identities.some(
      (identity) => identity.provider === "github"
    );
    setIsGithubConnected(hasGithubIdentity);
  };

  useEffect(() => {
    const hydrateUploads = async () => {
      try {
        await refreshGithubConnectionStatus();
        // Only this manager's own uploads — a brand-new manager should start
        // with an empty dashboard, not every document already in the team/DB.
        const documents = await listMyDocuments();
        const serverUploads: UploadedItem[] = documents.map((document) => ({
          key: `saved-${document.id}`,
          documentId: document.id,
          name: document.title,
          meta: "SAVED",
          status: mapStoredStatus(document.status),
          createdAt: document.createdAt ?? null,
          attribution: null,
          isMine: true,
        }));
        setUploads(serverUploads);
        persistReadyDocs(serverUploads);
      } catch {
        // Fallback to local cache if the API request fails.
        const savedDocuments = loadUploadedDocuments();
        if (savedDocuments.length === 0) return;
        const hydratedUploads: UploadedItem[] = savedDocuments.map((document) => ({
          key: `saved-${document.id}`,
          documentId: document.id,
          name: document.title,
          meta: "SAVED",
          status: mapStoredStatus(document.status),
          createdAt: document.createdAt ?? null,
          attribution: null,
          isMine: true,
        }));
        setUploads(hydratedUploads);
      } finally {
        setIsLoadingDocuments(false);
      }
    };

    void hydrateUploads();
  }, []);

  const handleConnectGithub = async () => {
    try {
      setError("");
      setIsConnectingGithub(true);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (oauthError) {
        throw oauthError;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect GitHub.");
      setIsConnectingGithub(false);
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setError("");

    for (const file of fileArray) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const meta = `${fileTypeLabel(file)} • ${formatBytes(file.size)}`;

      setUploads((prev) => [
        {
          key,
          documentId: null,
          name: file.name,
          meta,
          status: "Processing...",
          createdAt: null,
          attribution: null,
          isMine: true,
        },
        ...prev,
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch<UploadResponse>("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        setUploads((prev) => {
          const nextUploads: UploadedItem[] = prev.map((item) =>
            item.key === key
              ? { ...item, documentId: res.data.id, status: "Ready" as const, createdAt: res.data.createdAt }
              : item
          );
          persistReadyDocs(nextUploads);
          return nextUploads;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setUploads((prev) =>
          prev.map((item) =>
            item.key === key ? { ...item, status: "Failed" } : item
          )
        );
      }
    }

  };

  const handleGoogleDriveImport = async (url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError("Please paste a Google Docs link.");
      return;
    }

    setError("");
    setIsImportingLink(true);

    const key = `gdrive-${Date.now()}-${Math.random()}`;
    setUploads((prev) => [
      {
        key,
        documentId: null,
        name: "Google Drive Import",
        meta: "GOOGLE DRIVE",
        status: "Processing...",
        createdAt: null,
        attribution: null,
        isMine: true,
      },
      ...prev,
    ]);

    try {
      const res = await apiFetch<UploadResponse>("/api/documents/import/google-drive", {
        method: "POST",
        body: JSON.stringify({ url: trimmedUrl }),
      });

      setUploads((prev) => {
        const nextUploads: UploadedItem[] = prev.map((item) =>
          item.key === key
            ? {
                ...item,
                documentId: res.data.id,
                name: res.data.title,
                status: "Ready" as const,
                createdAt: res.data.createdAt,
              }
            : item
        );

        persistReadyDocs(nextUploads);
        return nextUploads;
      });
      setLinkInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Drive import failed.");
      setUploads((prev) =>
        prev.map((item) =>
          item.key === key ? { ...item, status: "Failed" } : item
        )
      );
    } finally {
      setIsImportingLink(false);
    }
  };

  const handleGoogleDriveFolderImport = async (folderInputRaw: string) => {
    const folderInput = folderInputRaw.trim();
    if (!folderInput) {
      setError("Please paste a Google Drive folder URL or folder ID.");
      return;
    }

    setError("");
    setIsImportingLink(true);

    try {
      const { data } = await supabase.auth.getSession();
      const googleAccessToken = data.session?.provider_token;
      if (!googleAccessToken) {
        throw new Error(
          "Missing Google provider token. Please sign out and sign in with Google again."
        );
      }

      const res = await apiFetch<GoogleDriveFolderImportResponse>(
        "/api/documents/import/google-drive-folder",
        {
          method: "POST",
          body: JSON.stringify({
            folderId: folderInput,
            googleAccessToken,
            maxFiles: 25,
          }),
        }
      );

      const importedItems: UploadedItem[] = res.data.items.map((item, index) => ({
        key: `gdrive-folder-${Date.now()}-${index}-${Math.random()}`,
        documentId: item.documentId,
        name: item.title,
        meta: "GOOGLE DRIVE FOLDER",
        status: item.status === "ready" ? "Ready" : "Failed",
        createdAt: item.createdAt,
        attribution: null,
        isMine: true,
      }));

      setUploads((prev) => {
        const nextUploads = [...importedItems, ...prev];
        persistReadyDocs(nextUploads);
        return nextUploads;
      });

      setLinkInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Drive folder import failed.");
    } finally {
      setIsImportingLink(false);
    }
  };

  const handleGithubRepoImport = async (repoUrlRaw: string) => {
    const repoUrl = repoUrlRaw.trim();
    if (!repoUrl) {
      setError("Please paste a GitHub repository URL.");
      return;
    }

    setError("");
    setIsImportingLink(true);

    try {
      const { data } = await supabase.auth.getSession();
      const res = await apiFetch<GithubRepoImportResponse>(
        "/api/documents/import/github-repo",
        {
          method: "POST",
          body: JSON.stringify({
            repoUrl,
            githubAccessToken: data.session?.provider_token,
            maxFiles: 25,
          }),
        }
      );

      const importedItems: UploadedItem[] = res.data.items.map((item, index) => ({
        key: `github-repo-${Date.now()}-${index}-${Math.random()}`,
        documentId: item.documentId,
        name: item.title,
        meta: "GITHUB REPO",
        status: item.status === "ready" ? "Ready" : "Failed",
        createdAt: item.createdAt,
        attribution: null,
        isMine: true,
      }));

      setUploads((prev) => {
        const nextUploads = [...importedItems, ...prev];
        persistReadyDocs(nextUploads);
        return nextUploads;
      });

      setLinkInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub repository import failed.");
    } finally {
      setIsImportingLink(false);
    }
  };

  const handleImportFromLink = async () => {
    const link = linkInput.trim();
    const kind = detectLinkKind(link);

    if (kind === "google_doc") {
      await handleGoogleDriveImport(link);
      return;
    }

    if (kind === "google_folder") {
      await handleGoogleDriveFolderImport(link);
      return;
    }

    if (kind === "github_repo") {
      await handleGithubRepoImport(link);
      return;
    }

    setError(
      "Unsupported link. Paste a Google Doc URL, Google Drive folder URL/ID, or GitHub repo URL."
    );
  };

  const handleDelete = async (upload: UploadedItem) => {
    if (upload.documentId === null) return;
    if (!window.confirm(`Delete "${upload.name}"? This can't be undone.`)) return;

    setError("");
    setDeletingKeys((prev) => new Set(prev).add(upload.key));

    try {
      await apiFetch(`/api/documents/${upload.documentId}`, { method: "DELETE" });

      setUploads((prev) => {
        const nextUploads = prev.filter((item) => item.key !== upload.key);
        persistReadyDocs(nextUploads);
        return nextUploads;
      });
      setDeselectedDocumentIds((prev) => {
        if (!prev.has(upload.documentId as number)) return prev;
        const next = new Set(prev);
        next.delete(upload.documentId as number);
        saveDeselectedDocumentIds(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete document.");
    } finally {
      setDeletingKeys((prev) => {
        const next = new Set(prev);
        next.delete(upload.key);
        return next;
      });
    }
  };

  const onFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files) {
      void uploadFiles(event.target.files);
    }
    event.target.value = "";
  };

  const handleDragOver: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault();
    if (!isDragActive) setIsDragActive(true);
  };

  const handleDragLeave = () => {
    if (isDragActive) setIsDragActive(false);
  };

  const handleDrop: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault();
    if (isDragActive) setIsDragActive(false);
    if (event.dataTransfer.files) {
      void uploadFiles(event.dataTransfer.files);
    }
  };

  const hasReadyDocument = uploads.some((item) => item.status === "Ready");
  const hasSelectedDocument = uploads.some(
    (item) =>
      item.status === "Ready" &&
      item.documentId !== null &&
      !deselectedDocumentIds.has(item.documentId)
  );

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={QUIZ_WORKFLOW_STEPS} activeIndex={0} stepRoutes={QUIZ_WORKFLOW_ROUTES} />

        {error ? <AlertBanner message={error} onDismiss={() => setError("")} /> : null}

        <section
          className={`card upload-zone ${isDragActive ? "active" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <h2>Drag &amp; drop content</h2>
          <p>Drop PDF, DOCX, TXT, or MD here</p>
          <button className="secondary-btn" type="button" onClick={onPickFile}>
            Select Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={onFileChange}
            accept=".pdf,.doc,.docx,.txt,.md"
            multiple
          />
        </section>

        <section className="card link-import-zone">
          <h2>Import from Link</h2>
          <p>Paste a Google Doc, Drive folder, or GitHub repo link.</p>
          <div className="link-import-connection-row">
            <span>
              GitHub: {isGithubConnected ? "Connected" : "Not connected"}
            </span>
            <button
              className="secondary-btn"
              type="button"
              onClick={() => void handleConnectGithub()}
              disabled={isGithubConnected || isConnectingGithub}
            >
              {isGithubConnected
                ? "Connected"
                : isConnectingGithub
                  ? "Connecting..."
                  : "Connect GitHub"}
            </button>
          </div>
          <input
            type="text"
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            placeholder="https://docs.google.com/... or https://drive.google.com/drive/folders/... or https://github.com/org/repo"
            className="text-input"
          />
          <button
            className="secondary-btn"
            type="button"
            onClick={() => void handleImportFromLink()}
            disabled={isImportingLink}
          >
            {isImportingLink ? "Importing..." : "Import Link"}
          </button>
        </section>

        <section className="card uploads-table">
          <h3>Uploaded Files</h3>
          <p className="uploads-hint">
            Check the documents you want to use for your next quiz — everything stays here
            either way, unless you delete it.
          </p>
          {isLoadingDocuments ? (
            <p className="uploads-empty">Loading documents...</p>
          ) : uploads.length === 0 ? (
            <p className="uploads-empty">No files uploaded yet.</p>
          ) : (
            uploads.map((upload) => {
              const isSelectable = upload.status === "Ready" && upload.documentId !== null;
              const isSelected = isSelectable && !deselectedDocumentIds.has(upload.documentId as number);

              return (
                <div className="upload-row" key={upload.key}>
                  <div className="upload-row-main">
                    <button
                      type="button"
                      className={`upload-select-toggle${isSelected ? " selected" : ""}`}
                      disabled={!isSelectable}
                      aria-pressed={isSelectable ? isSelected : false}
                      title={isSelectable ? "Use this document for the next quiz" : "Not ready yet"}
                      aria-label={`Use ${upload.name} for quiz generation`}
                      onClick={() => toggleDocumentSelected(upload.documentId as number)}
                    >
                      <CircleCheckIcon aria-hidden />
                    </button>
                    <div>
                      <strong>{upload.name}</strong>
                      <p>{upload.meta}</p>
                      <p className="upload-attribution">
                        {upload.isMine ? "Uploaded by you" : `Uploaded by ${upload.attribution ?? "a teammate"}`}
                        {formatAddedDate(upload.createdAt) ? ` · ${formatAddedDate(upload.createdAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="upload-row-actions">
                    <span
                      className={`status ${
                        upload.status === "Ready"
                          ? "success"
                          : upload.status === "Failed"
                            ? "fail"
                            : "warning"
                      }`}
                    >
                      {upload.status}
                    </span>
                    {upload.documentId !== null && upload.isMine ? (
                      <button
                        type="button"
                        className={`delete-icon-btn${
                          deletingKeys.has(upload.key) ? " is-deleting" : ""
                        }`}
                        aria-label={
                          deletingKeys.has(upload.key)
                            ? `Deleting ${upload.name}…`
                            : `Delete ${upload.name}`
                        }
                        aria-busy={deletingKeys.has(upload.key)}
                        title={deletingKeys.has(upload.key) ? "Deleting…" : "Delete"}
                        disabled={deletingKeys.has(upload.key)}
                        onClick={() => void handleDelete(upload)}
                      >
                        {deletingKeys.has(upload.key) ? (
                          <span className="delete-spinner" aria-hidden="true" />
                        ) : (
                          <img src={trashIcon} alt="" className="delete-icon" />
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </section>

        {hasReadyDocument && !hasSelectedDocument ? (
          <p className="form-error">Check at least one document above to continue.</p>
        ) : null}

        <div className="page-actions">
          <span />
          {hasSelectedDocument ? (
            <Link className="primary-btn btn-link" to="/configure-quiz">
              Continue to Configure Quiz
            </Link>
          ) : (
            <button className="primary-btn" type="button" disabled>
              Continue to Configure Quiz
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default UploadContentPage;
