import type { ChangeEventHandler, DragEventHandler } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/navigation/AppNav";
import StepTabs from "../components/navigation/StepTabs";
import { QUIZ_WORKFLOW_ROUTES, QUIZ_WORKFLOW_STEPS } from "../features/quiz/workflow";

type UploadedItem = {
  id: string;
  name: string;
  meta: string;
  status: "Ready" | "Processing...";
};

const formatBytes = (size: number) => {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const fileTypeLabel = (file: File) => {
  const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
  return extension;
};

function UploadContentPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);

  const onPickFile = () => fileInputRef.current?.click();

  const addFilesToUploadList = (files: FileList | File[]) => {
    const nextItems = Array.from(files).map((file) => {
      const type = fileTypeLabel(file);
      const size = formatBytes(file.size);
      const isVideo = file.type.startsWith("video/") || type === "MP4";
      return {
        id: `${file.name}-${file.size}-${Date.now()}`,
        name: file.name,
        meta: `${type} • ${size}`,
        status: isVideo ? "Processing..." : "Ready",
      } satisfies UploadedItem;
    });

    if (nextItems.length === 0) return;
    setUploads((prev) => [...nextItems, ...prev]);
  };

  const onFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files) {
      addFilesToUploadList(event.target.files);
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
      addFilesToUploadList(event.dataTransfer.files);
    }
  };

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
          <p>Drop PDF, DOCX, or MP4 here</p>
          <button className="secondary-btn" type="button" onClick={onPickFile}>
            Select Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={onFileChange}
            accept=".pdf,.doc,.docx,.mp4"
            multiple
          />
        </section>

        <section className="card uploads-table">
          <h3>Uploaded Files</h3>
          {uploads.length === 0 ? (
            <p className="uploads-empty">No files uploaded yet.</p>
          ) : (
            uploads.map((upload) => (
              <div className="upload-row" key={upload.id}>
                <div>
                  <strong>{upload.name}</strong>
                  <p>{upload.meta}</p>
                </div>
                <span className={`status ${upload.status === "Ready" ? "success" : "warning"}`}>
                  {upload.status}
                </span>
              </div>
            ))
          )}
        </section>

        <div className="page-actions">
          <span />
          <Link className="primary-btn btn-link" to="/configure-quiz">
            Continue to Configure Quiz
          </Link>
        </div>
      </main>
    </div>
  );
}

export default UploadContentPage;
