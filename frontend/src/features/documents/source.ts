// Shared helpers for deciding how a document "source" should open.
//
// Markdown docs (chiefly GitHub-imported .md files) read far better on their
// original page than as flattened extracted text, so wherever we surface a
// "source" we link out to the real file instead of the in-app text modal —
// but only when we actually have a URL to link to.

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

// True when a title or URL points at a markdown file. Matches on the path only
// so query strings / fragments (e.g. "...file.md?raw=1") don't defeat it.
export function isMarkdownSource(nameOrUrl: string | null | undefined): boolean {
  if (!nameOrUrl) return false;
  // Strip any query/hash so "file.md#section" or "file.md?x=1" still match.
  const path = nameOrUrl.split(/[?#]/)[0].toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// Opens a source URL in a new tab with the security-hardened rel so the opened
// page can't reach back into our window via window.opener.
export function openSourceUrl(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
