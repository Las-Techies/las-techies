// The citation snippet quiz generation attaches to each question is written
// by the LLM as a "quote" of the source material (see the citation
// validation in backend/src/services/quizGenerator.ts), but nothing
// guarantees it's an exact substring — different whitespace/line breaks,
// smart quotes, or a reworded/paraphrased phrase are enough to break a plain
// `indexOf`. This finds the best place to highlight even when the answer isn't
// verbatim: it scores the snippet against sliding windows of consecutive
// sentences (so a paraphrase distilled from a whole paragraph still lands on
// that paragraph) and, since the goal is to always show where the answer came
// from, returns the best-scoring passage rather than giving up — only bailing
// out when the overlap is so low the highlight would be actively misleading.

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

// Largest number of consecutive sentences we'll merge into one candidate
// passage. A paraphrased answer is usually distilled from a short run of
// sentences (a paragraph or bullet cluster), so scoring windows up to this size
// lets the match land on the whole passage instead of missing because no single
// sentence lines up. Kept small so the highlight stays tight and readable.
const MAX_WINDOW_SENTENCES = 4;

// Absolute floor for the "always highlight" behavior: below this the two texts
// share almost nothing, so any highlight would point at an unrelated passage.
// We still return null in that case rather than mislead the learner.
const MIN_HIGHLIGHT_SCORE = 0.12;

export function findHighlightSpan(sourceText: string, snippet: string | undefined | null): HighlightSpan | null {
  const trimmedSnippet = snippet?.trim() ?? "";
  if (!trimmedSnippet || !sourceText) return null;

  // Fast path: the snippet is a verbatim substring, so highlight it exactly.
  const exactStart = sourceText.indexOf(trimmedSnippet);
  if (exactStart !== -1) {
    return { start: exactStart, end: exactStart + trimmedSnippet.length, matchType: "exact" };
  }

  const normalizedSnippet = normalize(trimmedSnippet);
  if (!normalizedSnippet) return null;

  // Score every window of 1..MAX_WINDOW_SENTENCES consecutive sentences and
  // keep the best one. Windowing is what lets a paraphrase that draws from a
  // whole paragraph match that paragraph, instead of failing because it doesn't
  // line up with any single sentence.
  const spans = sentenceSpans(sourceText);
  let best: { start: number; end: number; score: number } | null = null;
  for (let i = 0; i < spans.length; i++) {
    for (let size = 1; size <= MAX_WINDOW_SENTENCES && i + size <= spans.length; size++) {
      const first = spans[i]!;
      const last = spans[i + size - 1]!;
      const windowText = sourceText.slice(first.start, last.end);
      const score = similarity(normalize(windowText), normalizedSnippet);
      if (!best || score > best.score) {
        best = { start: first.start, end: last.end, score };
      }
    }
  }

  // Since the goal is to always show where the answer came from, return the
  // best passage found rather than giving up — unless overlap is negligible,
  // where a highlight would be misleading.
  if (!best || best.score < MIN_HIGHLIGHT_SCORE) return null;
  return { start: best.start, end: best.end, matchType: "fuzzy" };
}
