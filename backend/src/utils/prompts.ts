import type { GenerationConfig } from "../services/quizTypes";

type PromptDocument = {
  id: number;
  title: string;
  rawText: string;
};

export function buildPrompt(documents: PromptDocument[], config: GenerationConfig): string {
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

  return `Generate exactly ${config.numQuestions} ${config.difficulty} quiz questions
from the SOURCE DOCUMENTS below.

Rules:
- Types allowed: ${config.questionTypes.join(", ")}.
- Each question has 3-4 options; exactly ONE has "isCorrect": true.
- Include a short "explanation" for the correct answer.
- Base every question ONLY on the source; do not invent facts.${config.topic?.trim() ? `\n- Focus specifically on this topic: "${config.topic.trim()}". If the source lacks enough on it, use the closest related content and do not invent facts.` : ""}
- If there are multiple source documents, distribute questions across them as evenly as possible.
- citation.sourceDocumentId MUST match one of the DOCUMENT ID values provided below.
- citation.sourceDocumentTitle MUST exactly match the paired DOCUMENT TITLE.

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