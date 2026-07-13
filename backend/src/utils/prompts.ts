import type { GenerationConfig } from "../services/quizTypes";

export function buildPrompt(documentText: string, config: GenerationConfig): string {
  return `Generate exactly ${config.numQuestions} ${config.difficulty} quiz questions
from the SOURCE DOCUMENT below.

Rules:
- Types allowed: ${config.questionTypes.join(", ")}.
- Each question has 3-4 options; exactly ONE has "isCorrect": true.
- Include a short "explanation" for the correct answer.
- Base every question ONLY on the source; do not invent facts.${config.topic?.trim() ? `\n- Focus specifically on this topic: "${config.topic.trim()}". If the source lacks enough on it, use the closest related content and do not invent facts.` : ""}

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
      "explanation": "string"
    }
  ]
}

SOURCE DOCUMENT:
"""
${documentText}
"""`;
}