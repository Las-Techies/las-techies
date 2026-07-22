import type { GenerationConfig } from "../services/quizTypes";

type PromptDocument = {
  id: number;
  title: string;
  rawText: string;
};

type RetrievedChunk = {
  documentId: number;
  documentTitle: string;
  content: string;
};

type ChatHistoryTurn = {
  role: "user" | "assistant";
  content: string;
};

// Builds the user-turn content for the Library AI Chatbot: retrieved
// document chunks (the RAG context), then recent conversation turns (the
// persisted memory), then the new question, with strict output-shape rules
// so answers stay grounded and citable — mirrors buildPrompt()'s "only use
// the source, cite it" approach for quiz generation.
export function buildChatPrompt(
  retrievedChunks: RetrievedChunk[],
  history: ChatHistoryTurn[],
  question: string
): string {
  const context = retrievedChunks
    .map(
      (chunk) => `DOCUMENT ID: ${chunk.documentId}
DOCUMENT TITLE: ${chunk.documentTitle}
EXCERPT:
"""
${chunk.content}
"""`
    )
    .join("\n\n---\n\n");

  const historySection =
    history.length > 0
      ? `\n\nRECENT CONVERSATION (oldest first, for context only):\n${history
          .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`)
          .join("\n")}`
      : "";

  return `You are answering an onboarding question using ONLY the DOCUMENT EXCERPTS below.${historySection}

Rules:
- Base your answer only on the excerpts; never invent facts not present in them.
- If the excerpts don't contain enough information to answer, say so plainly in "answer" instead of guessing.
- "sources" must only include documents you actually used, with a short verbatim "snippet" (a sentence or phrase) from that document supporting the answer.
- sources[].documentId MUST match one of the DOCUMENT ID values below; sources[].documentTitle MUST exactly match the paired DOCUMENT TITLE.
- "followUps" is up to 3 short, natural next questions the user might ask, grounded in the same excerpts (empty array if none make sense).
- Keep "answer" conversational and concise (a few sentences), not a document dump.

Return ONLY valid JSON (no markdown, no prose) in this exact shape:
{
  "answer": "string",
  "sources": [
    { "documentId": 12, "documentTitle": "Team Onboarding Guide", "snippet": "..." }
  ],
  "followUps": ["string"]
}

DOCUMENT EXCERPTS:
${context}

QUESTION:
${question}`;
}

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
- citation.sourceSnippet MUST be copied word-for-word (verbatim) from the source document — a single contiguous passage of roughly one to three sentences that the correct answer is based on. Do NOT paraphrase, summarize, combine separate passages, or use "...". Copy the exact wording so it can be located and highlighted in the original document.

Difficulty guidance for "${config.difficulty}":
${difficultyNote}

Writing high-quality questions and options:
- Every incorrect option must be plausible to someone who skimmed the source — never obviously wrong, silly, or off-topic.
- All options for a question should be similar in length and level of detail. Don't make the correct answer noticeably longer or more specific than the others.
- Never use "All of the above", "None of the above", or options that only differ by a negation (e.g. "X happens" vs "X does not happen").
- Do not phrase the question so the correct answer simply repeats a distinctive phrase from the source verbatim while the wrong answers use generic language — vary the wording so the question can't be solved by pattern-matching alone.
- Each question should stand on its own and test one clear idea; avoid compound questions ("...and also...").
- Vary which option is correct across questions. Do NOT always make the first option the correct one; spread the correct answer roughly evenly across all positions.

Return ONLY valid JSON (no markdown, no prose) in this exact shape:
{
  "questions": [
    {
      "id": 1,
      "prompt": "string",
      "type": "multiple_choice",
      "options": [
        { "id": 1, "text": "string", "isCorrect": false },
        { "id": 2, "text": "string", "isCorrect": true }
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