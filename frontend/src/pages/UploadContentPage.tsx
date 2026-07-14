import type { ChangeEventHandler } from "react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import AppNav from "../components/AppNav";
import StepTabs from "../components/StepTabs";

const steps = ["Upload Content", "Configure Quiz", "Review & Publish"];
const stepRoutes = ["/upload-content", "/configure-quiz", "/review-publish"];

type UploadedItem = {
  id: string;
  name: string;
  meta: string;
  status: "Ready" | "Processing...";
};

const initialUploads: UploadedItem[] = [
  {
    id: "seed-pdf",
    name: "OSHA_2026_Guidelines.pdf",
    meta: "PDF • 2.4 MB",
    status: "Ready",
  },
  {
    id: "seed-mp4",
    name: "SafetyVideo_Q3.mp4",
    meta: "MP4 • 48 MB",
    status: "Processing...",
  },
];

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
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadedItem[]>(initialUploads);

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
    setPickedFileName(nextItems[0].name);
    setUploads((prev) => [...nextItems, ...prev]);
  };

  const onFileChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    if (event.target.files) {
      addFilesToUploadList(event.target.files);
    }
    event.target.value = "";
  };

  return (
    <div className="app-shell">
      <AppNav />
      <main className="page-wrap">
        <h1>Upload + Generate</h1>
        <StepTabs steps={steps} activeIndex={0} stepRoutes={stepRoutes} />

        <section
          className={`card upload-zone ${isDragActive ? "active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragActive(true);
          }}
          onDragLeave={() => setIsDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragActive(false);
            if (event.dataTransfer.files) {
              addFilesToUploadList(event.dataTransfer.files);
            }
          }}
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
          {pickedFileName ? <small>Selected: {pickedFileName}</small> : null}
        </section>

        <section className="card uploads-table">
          <h3>Uploaded Files</h3>
          {uploads.map((upload) => (
            <div className="upload-row" key={upload.id}>
              <div>
                <strong>{upload.name}</strong>
                <p>{upload.meta}</p>
              </div>
              <span className={`status ${upload.status === "Ready" ? "success" : "warning"}`}>
                {upload.status}
              </span>
            </div>
          ))}
        </section>

        <div className="page-actions">
          <button className="secondary-btn" type="button">
            Back
          </button>
          <Link className="primary-btn btn-link" to="/configure-quiz">
            Continue to Configure Quiz
          </Link>
        </div>
      </main>
    </div>
  );
}

export default UploadContentPage;
