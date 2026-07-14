import type { ChangeEventHandler, DragEventHandler } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { apiFetch } from "../api/client";
import { saveUploadedDocuments } from "../features/quiz/storage";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";

type UploadStatus = "Processing..." | "Ready" | "Failed";

type UploadedItem = {
  key: string;
  documentId: number | null;
  name: string;
  meta: string;
  status: UploadStatus;
};

type UploadResponse = {
  data: { id: number; title: string; status: string; createdAt: string };
};

const formatBytes = (size: number) => {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const fileTypeLabel = (file: File) => file.name.split(".").pop()?.toUpperCase() ?? "FILE";

function UploadContentPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [error, setError] = useState("");

  const onPickFile = () => fileInputRef.current?.click();

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setError("");

    for (const file of fileArray) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      const meta = `${fileTypeLabel(file)} • ${formatBytes(file.size)}`;

      setUploads((prev) => [
        { key, documentId: null, name: file.name, meta, status: "Processing..." },
        ...prev,
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch<UploadResponse>("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        setUploads((prev) =>
          prev.map((item) =>
            item.key === key
              ? { ...item, documentId: res.data.id, status: "Ready" }
              : item
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setUploads((prev) =>
          prev.map((item) =>
            item.key === key ? { ...item, status: "Failed" } : item
          )
        );
      }
    }

    // Persist the ready documents so the Configure step can generate from them.
    setUploads((current) => {
      const readyDocs = current
        .filter((item) => item.status === "Ready" && item.documentId !== null)
        .map((item) => ({
          id: item.documentId as number,
          title: item.name,
          status: "ready",
        }));
      saveUploadedDocuments(readyDocs);
      return current;
    });
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
          {uploads.length === 0 ? (
            <p className="uploads-empty">No files uploaded yet.</p>
          ) : (
            uploads.map((upload) => (
              <div className="upload-row" key={upload.key}>
                <div>
                  <strong>{upload.name}</strong>
                  <p>{upload.meta}</p>
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
