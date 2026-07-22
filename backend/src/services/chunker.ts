const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 200;

// Headings (e.g. "OVERVIEW") are short, single-line paragraphs that don't end
// in sentence punctuation. Used to give each chunk a bit of section context
// (see documentEmbedder.ts) so retrieval can bridge vague/meta questions
// ("give me an overview of my team") that share little vocabulary with the
// chunk's own body text but do relate to the section title.
const HEADING_MAX_CHARS = 80;

export type TextChunk = {
  index: number;
  content: string;
  // Nearest preceding heading-like paragraph, if any. Undefined for chunks
  // that appear before the first heading in the document (or in headingless
  // documents).
  heading?: string;
};

// Splits on blank lines first so paragraph boundaries are respected where
// possible, only falling back to a hard character split for a single
// paragraph that's longer than maxChars on its own (e.g. a wall-of-text doc).
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function hardSplit(text: string, maxChars: number): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    parts.push(text.slice(i, i + maxChars));
  }
  return parts;
}

// Heuristic only: a short, single-line paragraph with no sentence-ending
// punctuation reads like a heading ("OVERVIEW", "1. Getting Started") rather
// than body text. False positives (e.g. a short standalone sentence) just
// mean that chunk's "heading" is slightly noisy — harmless, since it's only
// ever used as extra embedding context, never shown to the user.
function isHeadingLike(paragraph: string): boolean {
  if (paragraph.includes("\n")) return false;
  const trimmed = paragraph.trim();
  return trimmed.length > 0 && trimmed.length <= HEADING_MAX_CHARS && !/[.!?]$/.test(trimmed);
}

// Greedily packs paragraphs into ~maxChars windows, carrying the tail of the
// previous chunk forward as overlap so a fact split across a chunk boundary
// still has a chance of showing up whole in one chunk. Also tracks which
// heading was "in effect" when each chunk started, so a chunk's content can
// be embedded alongside its section title without that title being stored
// as part of the chunk's displayed/cited content.
export function chunkText(
  text: string,
  options?: { maxChars?: number; overlapChars?: number }
): TextChunk[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = splitParagraphs(text).flatMap((p) =>
    p.length > maxChars ? hardSplit(p, maxChars) : [p]
  );

  const chunks: { content: string; heading?: string }[] = [];
  let buffer = "";
  let currentHeading: string | undefined;
  let headingAtBufferStart: string | undefined;

  for (const paragraph of paragraphs) {
    if (isHeadingLike(paragraph)) {
      currentHeading = paragraph.trim();
    }
    if (!buffer) {
      headingAtBufferStart = currentHeading;
    }

    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }

    if (buffer) chunks.push({ content: buffer, heading: headingAtBufferStart });
    const overlapTail = buffer.slice(-overlapChars);
    buffer = overlapTail ? `${overlapTail}\n\n${paragraph}` : paragraph;
    headingAtBufferStart = currentHeading;
  }
  if (buffer) chunks.push({ content: buffer, heading: headingAtBufferStart });

  return chunks
    .map((chunk) => ({ content: chunk.content.trim(), heading: chunk.heading }))
    .filter((chunk) => chunk.content.length > 0)
    .map((chunk, index) => ({ index, content: chunk.content, heading: chunk.heading }));
}
