import type { GenerationConfig } from "../services/quizTypes";

type PromptDocument = {
  id: number;
  title: string;
  rawText: string;
};

export function buildPrompt(
  documents: PromptDocument[],
  config: GenerationConfig,
  avoidPrompts?: string[]
): string {
  const sourceDocs = documents
    .map(
      (doc) => `DOCUMENT ID: ${doc.id}
DOCUMENT TITLE: ${doc.title}
DOCUMENT CONTENT:
"""
${doc.rawText}
"""`
    )
    .join("\n\n---\n\n");

  const difficultyGuide: Record<string, string> = {
    easy: "Test recall of a single explicit fact stated directly in the source (a name, step, tool, or definition).",
    medium:
      "Test understanding of how or why something works — e.g. the relationship between two steps, the purpose of a process, or applying a rule to a described scenario.",
    hard:
      "Test synthesis across multiple parts of the source, edge cases, or the consequence of doing something incorrectly. Require the reader to reason, not just recall.",
  };
  const difficultyNote =
    difficultyGuide[config.difficulty.toLowerCase()] ??
    "Match the requested difficulty level as closely as possible.";

  // Used when regenerating a single replacement question, so the new one
  // doesn't just repeat a question still sitting on the quiz.
  const avoidSection =
    avoidPrompts && avoidPrompts.length > 0
      ? `\n\nDo not repeat or closely paraphrase any of these existing questions:\n${avoidPrompts
          .map((prompt) => `- ${prompt}`)
          .join("\n")}`
      : "";

  return `Generate exactly ${config.numQuestions} ${config.difficulty} quiz questions
from the SOURCE DOCUMENTS below.${avoidSection}

Rules:
- Types allowed: ${config.questionTypes.join(", ")}.
- Each question has 3-4 options; exactly ONE has "isCorrect": true.
- Include a short "explanation" for the correct answer.
- Base every question ONLY on the source; do not invent facts.${config.topic?.trim() ? `\n- Focus specifically on this topic: "${config.topic.trim()}". If the source lacks enough on it, use the closest related content and do not invent facts.` : ""}
- If there are multiple source documents, distribute questions across them as evenly as possible.
- citation.sourceDocumentId MUST match one of the DOCUMENT ID values provided below.
- citation.sourceDocumentTitle MUST exactly match the paired DOCUMENT TITLE.

Difficulty guidance for "${config.difficulty}":
${difficultyNote}

Writing high-quality questions and options:
- Every incorrect option must be plausible to someone who skimmed the source — never obviously wrong, silly, or off-topic.
- All options for a question should be similar in length and level of detail. Don't make the correct answer noticeably longer or more specific than the others.
- Never use "All of the above", "None of the above", or options that only differ by a negation (e.g. "X happens" vs "X does not happen").
- Do not phrase the question so the correct answer simply repeats a distinctive phrase from the source verbatim while the wrong answers use generic language — vary the wording so the question can't be solved by pattern-matching alone.
- Each question should stand on its own and test one clear idea; avoid compound questions ("...and also...").

Return ONLY valid JSON (no markdown, no prose) in this exact shape:
{
  "questions": [
    {
      "id": 1,
      "prompt": "string",
      "type": "multiple_choice",
      "options": [
        { "id": 1, "text": "string", "isCorrect": true },
        { "id": 2, "text": "string", "isCorrect": false }
      ],
      "explanation": "string",
      "citation": {
        "sourceDocumentId": 12,
        "sourceDocumentTitle": "Team Onboarding Guide",
        "sourceSnippet": "Before starting work on a new project, the team should read and understand the following documents..."
      }
    }
  ]
}

SOURCE DOCUMENTS:
${sourceDocs}`;
}