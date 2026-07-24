import type { ChangeEventHandler, DragEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import WizardSteps from "../components/navigation/WizardSteps";
import { apiFetch } from "../api/client";
import {
  loadDeselectedDocumentIds,
  loadUploadedDocuments,
  saveDeselectedDocumentIds,
  saveUploadedDocuments,
} from "../features/quiz/storage";
import {
  loadGoogleDriveAccessToken,
  saveGoogleDriveAccessToken,
} from "../features/auth/googleDriveToken";
import {
  ArrowRight,
  CheckPlain,
  CloudUploadIcon,
  FileTextIcon,
  GithubIcon,
  LinkIcon,
  ShieldIcon,
  TrashIcon,
  XPlain,
} from "../components/icons";
import { supabase } from "../lib/supabaseClient";

const fileExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const extBadge = (name: string): { label: string; cls: string } => {
  const ext = fileExt(name);
  if (ext === "pdf") return { label: "PDF", cls: "pdf" };
  if (ext === "doc" || ext === "docx") return { label: "W", cls: "docx" };
  if (ext === "ppt" || ext === "pptx") return { label: "P", cls: "pptx" };
  return { label: (ext || "file").slice(0, 3).toUpperCase(), cls: "docx" };
};

type UploadStatus = "Processing..." | "Ready" | "Failed";

type UploadedItem = {
  key: string;
  documentId: number | null;
  name: string;
  meta: string;
  status: UploadStatus;
  createdAt: string | null;
};

type UploadResponse = {
  data: { id: number; title: string; status: string; createdAt: string };
};

type MyDocumentsResponse = {
  data: Array<{ id: number; title: string; status: string; createdAt: string }>;
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
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
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
  // rather than "selected" so newly uploaded documents default to checked.
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

    // Snapshot the Google Drive token now, while we can still be sure the
    // session's provider_token is actually Google's — linking GitHub later
    // in this session will overwrite it. If GitHub is already linked, the
    // live token isn't trustworthy anymore, so don't stash it (that would
    // just overwrite an earlier-captured, still-good Google token with a
    // GitHub one).
    if (!hasGithubIdentity && data.session?.provider_token) {
      saveGoogleDriveAccessToken(data.session.provider_token);
    }
  };

  useEffect(() => {
    const hydrateUploads = async () => {
      try {
        await refreshGithubConnectionStatus();
        const res = await apiFetch<MyDocumentsResponse>("/api/documents/mine");
        const serverUploads: UploadedItem[] = res.data.map((document) => ({
          key: `saved-${document.id}`,
          documentId: document.id,
          name: document.title,
          meta: "SAVED",
          status: mapStoredStatus(document.status),
          createdAt: document.createdAt ?? null,
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
        { key, documentId: null, name: file.name, meta, status: "Processing...", createdAt: null },
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
      // Prefer the token snapshotted right after Google sign-in over the
      // live session's provider_token — if GitHub has been connected since
      // then, the live one is a GitHub token now, not Google's (Supabase
      // only keeps one provider_token slot). Falls back to the live session
      // for anyone who hasn't connected GitHub yet, so nothing changes for
      // the common case.
      const { data } = await supabase.auth.getSession();
      const googleAccessToken = loadGoogleDriveAccessToken() ?? data.session?.provider_token;
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
      <main className="mgr-page">
        <div className="mgr-hero">
          <div>
            <h1>Upload + Generate</h1>
            <p>Upload your content and let SageForce create high-quality Salesforce-ready knowledge.</p>
          </div>
          <div className="mgr-hero-right">
            <WizardSteps steps={["Upload", "Configure", "Review & Publish"]} activeIndex={0} />
          </div>
        </div>

        <section
          className={`dropzone ${isDragActive ? "active" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={onPickFile}
          role="button"
          tabIndex={0}
        >
          <div className="dropzone-cloud">
            <CloudUploadIcon />
          </div>
          <div className="dropzone-body">
            <h2>
              Drag files here or <span className="accent">browse</span>
            </h2>
            <p>Upload documents, presentations, or other content to get started.</p>
            <div className="filetype-chips">
              <span className="filetype-chip">
                <span className="tag pdf">PDF</span> PDF
              </span>
              <span className="filetype-chip">
                <span className="tag docx">W</span> DOCX
              </span>
              <span className="filetype-chip">
                <span className="tag pptx">P</span> PPTX
              </span>
            </div>
            <span className="dropzone-secure">
              <ShieldIcon /> Secure upload. Your data is encrypted and protected.
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={onFileChange}
            onClick={(event) => event.stopPropagation()}
            accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx"
            multiple
          />
        </section>

        <section className="glass import-bar">
          <span className="import-bar-icon">
            <LinkIcon />
          </span>
          <span className="import-bar-text">
            <strong>Import from link</strong>
            <span>Pull content from a public URL or repository.</span>
          </span>
          <button
            className="import-connect"
            type="button"
            onClick={() => void handleConnectGithub()}
            disabled={isGithubConnected || isConnectingGithub}
          >
            <GithubIcon />
            {isGithubConnected ? "Connected" : isConnectingGithub ? "Connecting…" : "Connect GitHub"}
          </button>
          <input
            type="text"
            value={linkInput}
            onChange={(event) => setLinkInput(event.target.value)}
            placeholder="https://example.com/docs or https://github.com/owner/repo"
            className="import-url"
          />
          <button
            className="sf-btn"
            type="button"
            onClick={() => void handleImportFromLink()}
            disabled={isImportingLink}
          >
            {isImportingLink ? "Importing…" : "Import"}
          </button>
        </section>

        <section className="glass files-card">
          <h3 className="files-card-title">
            <FileTextIcon /> Uploaded Files
          </h3>
          <p className="files-card-hint">
            Check the documents you want to use for your next quiz — everything stays here
            either way, unless you delete it.
          </p>
          {isLoadingDocuments ? (
            <p className="cfg-empty">Loading documents…</p>
          ) : uploads.length === 0 ? (
            <p className="cfg-empty">No files uploaded yet.</p>
          ) : (
            uploads.map((upload) => {
              const badge = extBadge(upload.name);
              const isSelectable = upload.status === "Ready" && upload.documentId !== null;
              const isSelected =
                isSelectable && !deselectedDocumentIds.has(upload.documentId as number);
              const addedDate = formatAddedDate(upload.createdAt);
              return (
                <div className="file-row" key={upload.key}>
                  <button
                    type="button"
                    className={`file-check ${isSelected ? "selected" : ""}`}
                    disabled={!isSelectable}
                    aria-pressed={isSelectable ? isSelected : false}
                    title={isSelectable ? "Use this document for the next quiz" : "Not ready yet"}
                    aria-label={`Use ${upload.name} for quiz generation`}
                    onClick={() =>
                      isSelectable && toggleDocumentSelected(upload.documentId as number)
                    }
                  >
                    <CheckPlain />
                  </button>
                  <span className={`file-ic tag ${badge.cls}`}>{badge.label}</span>
                  <span className="file-info">
                    <span className="file-name" title={upload.name}>
                      {upload.name}
                    </span>
                    <span className="file-attribution">
                      Uploaded by you{addedDate ? ` · ${addedDate}` : ""}
                    </span>
                  </span>
                  <span
                    className={`file-status ${
                      upload.status === "Ready"
                        ? "ready"
                        : upload.status === "Failed"
                          ? "failed"
                          : "processing"
                    }`}
                  >
                    {upload.status === "Ready" ? (
                      <>
                        <CheckPlain /> Ready
                      </>
                    ) : upload.status === "Failed" ? (
                      <>
                        <XPlain /> Failed
                      </>
                    ) : (
                      <>
                        <span className="spin" /> Processing
                      </>
                    )}
                  </span>
                  {upload.documentId !== null ? (
                    <button
                      type="button"
                      className="file-del"
                      aria-label={`Delete ${upload.name}`}
                      title="Delete"
                      disabled={deletingKeys.has(upload.key)}
                      onClick={() => void handleDelete(upload)}
                    >
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </section>

        {error ? <p className="form-error">{error}</p> : null}
        {hasReadyDocument && !hasSelectedDocument ? (
          <p className="form-error">Check at least one document above to continue.</p>
        ) : null}

        <div className="mgr-foot">
          {hasSelectedDocument ? (
            <Link className="sf-btn btn-link" to="/configure-quiz">
              Continue to Configure <ArrowRight />
            </Link>
          ) : (
            <button className="sf-btn" type="button" disabled>
              Continue to Configure <ArrowRight />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default UploadContentPage;
