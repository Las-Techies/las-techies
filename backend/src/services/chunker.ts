const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_OVERLAP_CHARS = 200;

export type TextChunk = {
  index: number;
  content: string;
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

// Greedily packs paragraphs into ~maxChars windows, carrying the tail of the
// previous chunk forward as overlap so a fact split across a chunk boundary
// still has a chance of showing up whole in one chunk.
export function chunkText(
  text: string,
  options?: { maxChars?: number; overlapChars?: number }
): TextChunk[] {
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const paragraphs = splitParagraphs(text).flatMap((p) =>
    p.length > maxChars ? hardSplit(p, maxChars) : [p]
  );

  const chunks: string[] = [];
  let buffer = "";

  for (const paragraph of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      continue;
    }

    if (buffer) chunks.push(buffer);
    const overlapTail = buffer.slice(-overlapChars);
    buffer = overlapTail ? `${overlapTail}\n\n${paragraph}` : paragraph;
  }
  if (buffer) chunks.push(buffer);

  return chunks
    .map((content) => content.trim())
    .filter((content) => content.length > 0)
    .map((content, index) => ({ index, content }));
}
