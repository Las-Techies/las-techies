import type { ChangeEventHandler, DragEventHandler } from "react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { apiFetch } from "../api/client";
import { loadUploadedDocuments, saveUploadedDocuments } from "../features/quiz/storage";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";

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

function UploadContentPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const hydrateUploads = async () => {
      try {
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
        saveUploadedDocuments(
          res.data.map((document) => ({
            id: document.id,
            title: document.title,
            status: document.status,
            createdAt: document.createdAt,
          }))
        );
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

          const readyDocs = nextUploads
            .filter((item) => item.status === "Ready" && item.documentId !== null)
            .map((item) => ({
              id: item.documentId as number,
              title: item.name,
              status: "ready",
              createdAt: item.createdAt,
            }));

          saveUploadedDocuments(readyDocs);
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

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={QUIZ_WORKFLOW_STEPS} activeIndex={0} stepRoutes={QUIZ_WORKFLOW_ROUTES} />

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

        <section className="card uploads-table">
          <h3>Uploaded Files</h3>
          {isLoadingDocuments ? (
            <p className="uploads-empty">Loading documents...</p>
          ) : uploads.length === 0 ? (
            <p className="uploads-empty">No files uploaded yet.</p>
          ) : (
            uploads.map((upload) => (
              <div className="upload-row" key={upload.key}>
                <div>
                  <strong>{upload.name}</strong>
                  <p>{upload.meta}</p>
                  {formatAddedDate(upload.createdAt) ? (
                    <p>Added {formatAddedDate(upload.createdAt)}</p>
                  ) : null}
                </div>
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
              </div>
            ))
          )}
        </section>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="page-actions">
          <span />
          {hasReadyDocument ? (
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
