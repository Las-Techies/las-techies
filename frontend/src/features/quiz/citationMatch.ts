// The citation snippet quiz generation attaches to each question is written
// by the LLM as a "quote" of the source material (see the citation
// validation in backend/src/services/quizGenerator.ts), but nothing
// guarantees it's an exact substring — different whitespace/line breaks,
// smart quotes, or a lightly reworded phrase are enough to break a plain
// `indexOf`. This finds the best place to highlight even when it isn't a
// perfect match, and returns null (rather than guessing) when nothing is
// close enough to be trustworthy.

export type HighlightSpan = {
  start: number;
  end: number;
  matchType: "exact" | "fuzzy";
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function bigramCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

// Dice's coefficient over character bigrams: a simple, dependency-free
// similarity score (0-1) that tolerates small rewording/typos/formatting
// drift while still requiring real overlap between the two strings.
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const bigramsA = bigramCounts(a);
  const bigramsB = bigramCounts(b);
  let overlap = 0;
  for (const [gram, countA] of bigramsA) {
    const countB = bigramsB.get(gram);
    if (countB) overlap += Math.min(countA, countB);
  }
  const totalA = [...bigramsA.values()].reduce((sum, n) => sum + n, 0);
  const totalB = [...bigramsB.values()].reduce((sum, n) => sum + n, 0);
  if (totalA + totalB === 0) return 0;
  return (2 * overlap) / (totalA + totalB);
}

// Splits on sentence punctuation *and* newlines rather than just ". ", since
// extracted PDF/DOCX text is often bullet points or headings without a
// terminal period. Keeps exact start/end offsets into the original text so
// the caller can highlight/scroll to the real (untrimmed) source location.
const SENTENCE_REGEX = /[^\n.!?]+(?:[.!?]+|\n|$)/g;

function sentenceSpans(sourceText: string): Array<{ text: string; start: number; end: number }> {
  const spans: Array<{ text: string; start: number; end: number }> = [];
  const regex = new RegExp(SENTENCE_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sourceText))) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const leading = raw.indexOf(trimmed);
    const start = match.index + leading;
    spans.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return spans;
}

// Below this, a "match" is more likely coincidental overlap than the actual
// source sentence — better to show no highlight than a misleading one.
const MIN_FUZZY_SCORE = 0.45;

export function findHighlightSpan(sourceText: string, snippet: string | undefined | null): HighlightSpan | null {
  const trimmedSnippet = snippet?.trim() ?? "";
  if (!trimmedSnippet || !sourceText) return null;

  const exactStart = sourceText.indexOf(trimmedSnippet);
  if (exactStart !== -1) {
    return { start: exactStart, end: exactStart + trimmedSnippet.length, matchType: "exact" };
  }

  const normalizedSnippet = normalize(trimmedSnippet);
  if (!normalizedSnippet) return null;

  let best: { start: number; end: number; score: number } | null = null;
  for (const span of sentenceSpans(sourceText)) {
    const score = similarity(normalize(span.text), normalizedSnippet);
    if (!best || score > best.score) {
      best = { start: span.start, end: span.end, score };
    }
  }

  if (!best || best.score < MIN_FUZZY_SCORE) return null;
  return { start: best.start, end: best.end, matchType: "fuzzy" };
}
