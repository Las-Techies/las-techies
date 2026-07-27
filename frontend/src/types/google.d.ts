// Single source of truth for the bits of Google's browser SDKs we touch.
//
// At runtime, Google Identity Services (`google.accounts.oauth2`, loaded from
// accounts.google.com/gsi/client) and the Drive Picker (`google.picker`, loaded
// via gapi) hang off the *same* `window.google` object. Declaring `google`
// separately in two modules is a TS2717 error ("subsequent property
// declarations must have the same type"), so both live here instead.
//
// Hand-written and deliberately minimal — only the members actually called.
// No @types/gapi dependency.

/** google.accounts.oauth2 — see features/auth/googleDriveAuth.ts */
type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleTokenClient = {
  requestAccessToken: () => void;
};

type GoogleTokenClientConfig = {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
};

/** google.picker — see handlePickFromGoogleDrive in pages/UploadContentPage.tsx */
type GooglePickerDocsView = {
  setIncludeFolders: (include: boolean) => GooglePickerDocsView;
  setSelectFolderEnabled: (enabled: boolean) => GooglePickerDocsView;
  setMimeTypes: (mimeTypes: string) => GooglePickerDocsView;
};

type GooglePickerPickerBuilder = {
  setDeveloperKey: (key: string) => GooglePickerPickerBuilder;
  setAppId: (appId: string) => GooglePickerPickerBuilder;
  setOAuthToken: (token: string) => GooglePickerPickerBuilder;
  addView: (view: unknown) => GooglePickerPickerBuilder;
  enableFeature: (feature: string) => GooglePickerPickerBuilder;
  setCallback: (
    callback: (data: Record<string, unknown>) => void
  ) => GooglePickerPickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

type GooglePickerNamespace = {
  Action: { PICKED: string; CANCEL: string };
  Feature: { MULTISELECT_ENABLED: string };
  ViewId: { DOCS: string; FOLDERS: string };
  Response: { ACTION: string; DOCUMENTS: string };
  Document: { ID: string; NAME: string; TYPE: string };
  DocsView: new (viewId?: string) => GooglePickerDocsView;
  PickerBuilder: new () => GooglePickerPickerBuilder;
};

interface Window {
  gapi?: {
    load: (library: string, callback: { callback: () => void }) => void;
  };
  // Both namespaces are optional: each is only present once its own script has
  // loaded, and a page may load one without the other.
  google?: {
    accounts?: {
      oauth2: {
        initTokenClient: (config: GoogleTokenClientConfig) => GoogleTokenClient;
      };
    };
    picker?: GooglePickerNamespace;
  };
}
