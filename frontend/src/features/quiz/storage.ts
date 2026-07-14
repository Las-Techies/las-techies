import {
  DEFAULT_QUIZ_CONFIG,
  QUIZ_CONFIG_STORAGE_KEY,
  type QuizConfig,
  type UploadedDocument,
} from "./types";

const UPLOADED_DOCS_STORAGE_KEY = "sageforce_uploaded_documents";
const GENERATED_QUIZ_ID_STORAGE_KEY = "sageforce_generated_quiz_id";

const parsePositiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const loadQuizConfig = (): QuizConfig => {
  const raw = localStorage.getItem(QUIZ_CONFIG_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_QUIZ_CONFIG };

  try {
    const parsed = JSON.parse(raw) as Partial<QuizConfig> & {
      passingScore?: string | number;
      timeLimit?: string | number;
      questionCount?: string | number;
    };

    return {
      moduleTitle: parsed.moduleTitle?.trim() || DEFAULT_QUIZ_CONFIG.moduleTitle,
      topic: parsed.topic?.trim() || DEFAULT_QUIZ_CONFIG.topic,
      passingScore: parsePositiveNumber(parsed.passingScore, DEFAULT_QUIZ_CONFIG.passingScore),
      timeLimit: parsePositiveNumber(parsed.timeLimit, DEFAULT_QUIZ_CONFIG.timeLimit),
      questionCount: parsePositiveNumber(parsed.questionCount, DEFAULT_QUIZ_CONFIG.questionCount),
      dueDate: parsed.dueDate ?? DEFAULT_QUIZ_CONFIG.dueDate,
      difficulty: parsed.difficulty ?? DEFAULT_QUIZ_CONFIG.difficulty,
      generatedQuestions: Array.isArray(parsed.generatedQuestions)
        ? parsed.generatedQuestions
        : DEFAULT_QUIZ_CONFIG.generatedQuestions,
    };
  } catch {
    return { ...DEFAULT_QUIZ_CONFIG };
  }
};

export const saveQuizConfig = (config: QuizConfig) => {
  localStorage.setItem(QUIZ_CONFIG_STORAGE_KEY, JSON.stringify(config));
};

export const saveUploadedDocuments = (documents: UploadedDocument[]) => {
  localStorage.setItem(UPLOADED_DOCS_STORAGE_KEY, JSON.stringify(documents));
};

export const loadUploadedDocuments = (): UploadedDocument[] => {
  const raw = localStorage.getItem(UPLOADED_DOCS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UploadedDocument[]) : [];
  } catch {
    return [];
  }
};

export const saveGeneratedQuizId = (quizId: number) => {
  localStorage.setItem(GENERATED_QUIZ_ID_STORAGE_KEY, String(quizId));
};

export const loadGeneratedQuizId = (): number | null => {
  const raw = localStorage.getItem(GENERATED_QUIZ_ID_STORAGE_KEY);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? null : parsed;
};
