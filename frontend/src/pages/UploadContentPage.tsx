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
  markPendingOAuthProvider,
} from "../features/auth/googleDriveToken";
import {
  isGoogleDriveAuthConfigured,
  preloadGoogleDriveAuth,
  requestGoogleDriveAccessToken,
} from "../features/auth/googleDriveAuth";
import { useAuth } from "../context/AuthContext";
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
const GOOGLE_API_SCRIPT_ID = "google-api-js";
const GOOGLE_DOC_URL_PREFIX = "https://docs.google.com/document/d/";
const GOOGLE_PICKER_API_KEY = import.meta.env.VITE_GOOGLE_PICKER_API_KEY ?? "";
const GOOGLE_PICKER_APP_ID = import.meta.env.VITE_GOOGLE_PICKER_APP_ID ?? "";

// `window.gapi` / `window.google` (Picker + GIS) are declared in
// src/types/google.d.ts.
type PickerDocumentPayload = Record<string, unknown> & {
  id?: string;
  mimeType?: string;
  type?: string;
};

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
// The backend surfaces Google's rejection verbatim, e.g. "Google Drive API
// request failed (401). ..." from googleDriveRequest in documentProcessor.ts.
const isGoogleAuthFailure = (message: string) =>
  /Google Drive API request failed \((401|403)\)/i.test(message) ||
  /Google access token is required/i.test(message);

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
  const { user, signInWithGoogle } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState<UploadedItem[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(true);
  const [error, setError] = useState("");
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());
  const [linkInput, setLinkInput] = useState("");
  const [isImportingLink, setIsImportingLink] = useState(false);
  const [isGooglePickerLoading, setIsGooglePickerLoading] = useState(false);
  const [isGithubConnected, setIsGithubConnected] = useState(false);
  const [isConnectingGithub, setIsConnectingGithub] = useState(false);
  // Set when Google's token is missing or Google itself rejected it, so the
  // error can offer a one-click reconnect instead of telling the user to sign
  // out and back in.
  const [needsGoogleReconsent, setNeedsGoogleReconsent] = useState(false);
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

  // Google's access token is no longer snapshotted here — capturing it on the
  // Upload page was always too late, since it's already gone from the session
  // by the time the JWT has refreshed once. AuthContext now grabs it in
  // onAuthStateChange, the one moment Supabase emits it.
  const refreshGithubConnectionStatus = async () => {
    const { data } = await supabase.auth.getSession();
    const identities = data.session?.user?.identities ?? [];
    setIsGithubConnected(
      identities.some((identity) => identity.provider === "github")
    );
  };

  useEffect(() => {
    // Fetch Google's script now, not at click time, so the popup opens
    // directly off the user's gesture instead of after a network round-trip.
    preloadGoogleDriveAuth();
  }, []);

  useEffect(() => {
    const hydrateUploads = async () => {
      // Deliberately not in the same try as the document fetch — a failure
      // reading the session used to skip the document list entirely and drop
      // silently to the local cache.
      try {
        await refreshGithubConnectionStatus();
      } catch {
        setIsGithubConnected(false);
      }

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
      // linkIdentity (not signInWithOAuth) — this user is already signed in
      // via Google, and we're attaching GitHub as a second identity on that
      // same account. signInWithOAuth would instead run a brand-new sign-in
      // exchange and hand back a freshly minted session/JWT that isn't
      // guaranteed to carry this account's custom user_metadata (like
      // team_id), which previously reset managers back to the default demo
      // team the moment they connected GitHub.
      //
      // Mark the provider so the token this redirect brings back isn't
      // mistaken for a Google one and stashed as the Drive credential.
      markPendingOAuthProvider("github");
      const { error: oauthError } = await supabase.auth.linkIdentity({
        provider: "github",
        options: {
          // Come back to /login (which forwards a signed-in user on to their
          // dashboard), not "/", the marketing landing page that has no
          // session redirect and would strand the manager after linking.
          redirectTo: `${window.location.origin}/login`,
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

  // Gets a Drive access token for the import about to run.
  //
  // Preferred path asks Google directly (see features/auth/googleDriveAuth) —
  // fresh token per use, nothing stored, and the Supabase session is left
  // alone. The Supabase provider_token path below is kept only so behaviour is
  // unchanged until VITE_GOOGLE_CLIENT_ID is set, and can be deleted (along
  // with googleDriveToken.ts) once the Google path is confirmed working.
  const resolveGoogleDriveToken = async (): Promise<string> => {
    if (isGoogleDriveAuthConfigured()) {
      return requestGoogleDriveAccessToken();
    }

    const { data } = await supabase.auth.getSession();
    const liveProviderToken = isGithubConnected
      ? undefined
      : data.session?.provider_token;
    const token = loadGoogleDriveAccessToken(user?.id) ?? liveProviderToken;

    if (!token) {
      setNeedsGoogleReconsent(true);
      throw new Error(
        "Your Google Drive access has expired. Reconnect Google to import from Drive."
      );
    }

    return token;
  };

  // Re-runs the Google consent screen to mint a fresh Drive token. Reuses
  // AuthContext's signInWithGoogle so the scopes and the redirect target stay
  // in one place (redirectTo is always `${window.location.origin}/login` —
  // never built from anything user-supplied). Must stay click-triggered:
  // firing this from an effect would bounce the user through OAuth on every
  // render.
  const handleReconnectGoogle = async () => {
    try {
      setError("");
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reconnect Google.");
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const loadGoogleApiScript = async () => {
    if (window.gapi) return;

    await new Promise<void>((resolve, reject) => {
      const existingScript = document.getElementById(
        GOOGLE_API_SCRIPT_ID
      ) as HTMLScriptElement | null;
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener(
          "error",
          () => reject(new Error("Failed to load Google API script.")),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.id = GOOGLE_API_SCRIPT_ID;
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Google API script."));
      document.body.appendChild(script);
    });
  };

  const ensureGooglePickerReady = async () => {
    await loadGoogleApiScript();
    await new Promise<void>((resolve, reject) => {
      window.gapi?.load("picker", {
        callback: () => resolve(),
      });

      window.setTimeout(() => {
        if (!window.google?.picker) {
          reject(new Error("Google Picker failed to initialize."));
        }
      }, 5000);
    });
  };

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

  // presetToken lets a caller that already holds a Drive token reuse it. The
  // Picker flow needs this: requesting a token opens a Google popup, and by the
  // time the Picker's callback runs we're no longer inside the user's click, so
  // a second popup would be blocked.
  const handleGoogleDriveImport = async (url: string, presetToken?: string) => {
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
      // Authorize this request when we can. Previously it always went out
      // unauthenticated, so a link the manager could open themselves would
      // fail — or worse, Google would serve its HTML sign-in page with a 200
      // and the backend would store that as the document's text.
      const googleAccessToken =
        presetToken ??
        (isGoogleDriveAuthConfigured()
          ? await requestGoogleDriveAccessToken()
          : undefined);

      const res = await apiFetch<UploadResponse>("/api/documents/import/google-drive", {
        method: "POST",
        body: JSON.stringify({ url: trimmedUrl, googleAccessToken }),
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

  // See handleGoogleDriveImport for why presetToken exists.
  const handleGoogleDriveFolderImport = async (
    folderInputRaw: string,
    presetToken?: string
  ) => {
    const folderInput = folderInputRaw.trim();
    if (!folderInput) {
      setError("Please paste a Google Drive folder URL or folder ID.");
      return;
    }

    setError("");
    setNeedsGoogleReconsent(false);
    setIsImportingLink(true);

    try {
      const googleAccessToken = presetToken ?? (await resolveGoogleDriveToken());

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
      const message =
        err instanceof Error ? err.message : "Google Drive folder import failed.";
      // A token can also be present but already rejected by Google — we can't
      // know its real expiry, so treat Google's own 401/403 as the signal.
      if (isGoogleAuthFailure(message)) {
        setNeedsGoogleReconsent(true);
        setError(
          "Your Google Drive access has expired. Reconnect Google to import this folder."
        );
      } else {
        setError(message);
      }
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

  const handlePickFromGoogleDrive = async () => {
    if (!GOOGLE_PICKER_API_KEY || !GOOGLE_PICKER_APP_ID) {
      setError(
        "Google Picker is not configured. Set VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_PICKER_APP_ID in frontend .env."
      );
      return;
    }

    setError("");
    setIsGooglePickerLoading(true);

    try {
      // Must be the first await in this handler: with GIS this opens Google's
      // popup, and browsers only allow that while the click is still being
      // handled. Loading the Picker scripts first would get it blocked.
      // Some browser/account chooser paths can fail to ever call Google's
      // callback when the popup is dismissed, which leaves this promise hanging
      // forever. Time it out so "Opening Drive…" always recovers.
      const googleAccessToken = await Promise.race<string>([
        resolveGoogleDriveToken(),
        new Promise<string>((_, reject) =>
          window.setTimeout(
            () =>
              reject(
                new Error(
                  "Google sign-in timed out. Please try again and complete the account chooser."
                )
              ),
            3500
          )
        ),
      ]);

      await ensureGooglePickerReady();
      const googlePicker = window.google?.picker;
      if (!googlePicker) {
        throw new Error("Google Picker failed to initialize.");
      }

      await new Promise<void>((resolve) => {
        let settled = false;
        let pickerVisible = false;
        let timeoutId: number | null = null;
        let focusTimeoutId: number | null = null;
        const cleanup = () => {
          if (timeoutId !== null) window.clearTimeout(timeoutId);
          if (focusTimeoutId !== null) window.clearTimeout(focusTimeoutId);
          window.removeEventListener("focus", handleWindowFocus);
        };
        const resolveOnce = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const handleWindowFocus = () => {
          // Some browsers close the Picker without ever firing CANCEL/PICKED.
          // When focus returns to this window and the picker was visible, treat
          // that as a closed dialog and release the loading state quickly.
          if (!pickerVisible || settled) return;
          focusTimeoutId = window.setTimeout(() => {
            if (!settled) resolveOnce();
          }, 50);
        };
        window.addEventListener("focus", handleWindowFocus);
        const docsView = new googlePicker.DocsView(googlePicker.ViewId.DOCS)
          .setMimeTypes("application/vnd.google-apps.document")
          .setIncludeFolders(true);

        const folderView = new googlePicker.DocsView(googlePicker.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true);

        const picker = new googlePicker.PickerBuilder()
          .setDeveloperKey(GOOGLE_PICKER_API_KEY)
          .setAppId(GOOGLE_PICKER_APP_ID)
          .setOAuthToken(googleAccessToken)
          .addView(docsView)
          .addView(folderView)
          .enableFeature(googlePicker.Feature.MULTISELECT_ENABLED)
          .setCallback((pickerData: Record<string, unknown>) => {
            const action = pickerData[googlePicker.Response.ACTION] as string | undefined;
            if (action === googlePicker.Action.CANCEL) {
              resolveOnce();
              return;
            }
            if (action !== googlePicker.Action.PICKED) {
              resolveOnce();
              return;
            }

            const pickedDocs = ((pickerData[googlePicker.Response.DOCUMENTS] as
              | PickerDocumentPayload[]
              | undefined) ?? []) as PickerDocumentPayload[];

            const pickedFolders = pickedDocs
              .filter((doc) => {
                const mimeType =
                  String(doc.mimeType ?? doc[googlePicker.Document.TYPE] ?? "").trim();
                return mimeType === "application/vnd.google-apps.folder";
              })
              .map((doc) => String(doc.id ?? doc[googlePicker.Document.ID] ?? "").trim())
              .filter(Boolean);

            const pickedGoogleDocs = pickedDocs
              .filter((doc) => {
                const mimeType =
                  String(doc.mimeType ?? doc[googlePicker.Document.TYPE] ?? "").trim();
                return mimeType === "application/vnd.google-apps.document";
              })
              .map((doc) => String(doc.id ?? doc[googlePicker.Document.ID] ?? "").trim())
              .filter(Boolean)
              .map((docId) => `${GOOGLE_DOC_URL_PREFIX}${docId}`);

            void (async () => {
              if (pickedFolders.length === 0 && pickedGoogleDocs.length === 0) {
                setError(
                  "No supported Google Docs or folders were selected. Please pick a Google Doc or Drive folder."
                );
                resolveOnce();
                return;
              }
              // Reuse the token we already got — see presetToken's comment.
              if (pickedFolders.length > 0) {
                await handleGoogleDriveFolderImport(
                  pickedFolders[0],
                  googleAccessToken
                );
              }
              for (const docUrl of pickedGoogleDocs) {
                await handleGoogleDriveImport(docUrl, googleAccessToken);
              }
              resolveOnce();
            })().catch((err) => {
              setError(
                err instanceof Error ? err.message : "Google Drive Picker import failed."
              );
              resolveOnce();
            });
          })
          .build();

        picker.setVisible(true);
        pickerVisible = true;
        timeoutId = window.setTimeout(() => {
          if (!settled) {
            setError("Google Drive Picker timed out. Please try again.");
            resolveOnce();
          }
        }, 5000);
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to open Google Drive Picker.";
      // Google rejecting the token here means the grant is gone, not that the
      // Picker is broken — offer the reconnect affordance instead.
      if (isGoogleAuthFailure(message)) {
        setNeedsGoogleReconsent(true);
      }
      setError(message);
    } finally {
      setIsGooglePickerLoading(false);
    }
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
          <button
            className="import-connect"
            type="button"
            onClick={() => void handlePickFromGoogleDrive()}
            disabled={isGooglePickerLoading || isImportingLink}
          >
            {isGooglePickerLoading ? "Opening Drive…" : "Pick from Google Drive"}
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
                  />
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

        {error ? (
          <p className="form-error">
            {error}
            {needsGoogleReconsent ? (
              <>
                {" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void handleReconnectGoogle()}
                >
                  Reconnect Google
                </button>
              </>
            ) : null}
          </p>
        ) : null}
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
