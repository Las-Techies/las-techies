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
  heading?: string | undefined;
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
//
// Every new heading also forces a hard chunk break, even if the running
// buffer is nowhere near maxChars. Without this, several short sections
// (e.g. a one-line "Your First Week" list followed immediately by a
// four-line "Key People" list) can end up packed into a single chunk —
// which means a single embedding vector ends up representing a blend of
// unrelated topics, diluting the signal for a question that's sharply
// about just one of them ("who are the key people on this team?") even
// when that section's exact words are sitting right there in the chunk.
// Splitting on headings keeps each section's embedding focused on that
// section alone.
export function chunkText(
  text: string,
  options?: { maxChars?: number; overlapChars?: number }
): TextChunk[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = splitParagraphs(text).flatMap((p) =>
    p.length > maxChars ? hardSplit(p, maxChars) : [p]
  );

  const chunks: { content: string; heading?: string | undefined }[] = [];
  let buffer = "";
  let currentHeading: string | undefined;
  let headingAtBufferStart: string | undefined;

  for (const paragraph of paragraphs) {
    const startsNewHeading = isHeadingLike(paragraph);

    // Hard break at the heading boundary itself (not carrying overlap
    // forward here — overlap is only meant to stitch together a single
    // section's own content that got split across chunks, not to blend
    // the tail of one section into the start of the next).
    if (startsNewHeading && buffer) {
      chunks.push({ content: buffer, heading: headingAtBufferStart });
      buffer = "";
    }

    if (startsNewHeading) {
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
