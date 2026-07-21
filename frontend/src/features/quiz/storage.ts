import {
  DEFAULT_QUIZ_CONFIG,
  QUIZ_ATTEMPT_STORAGE_KEY,
  QUIZ_CONFIG_STORAGE_KEY,
  type QuizAttempt,
  type QuizConfig,
  type UploadedDocument,
} from "./types";

const UPLOADED_DOCS_STORAGE_KEY = "sageforce_uploaded_documents";

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

export const saveQuizAttempt = (attempt: QuizAttempt) => {
  localStorage.setItem(QUIZ_ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
};

export const loadQuizAttempt = (): QuizAttempt | null => {
  const raw = localStorage.getItem(QUIZ_ATTEMPT_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as QuizAttempt;
    return parsed && Array.isArray(parsed.questions) ? parsed : null;
  } catch {
    return null;
  }
};

const MODULE_PROGRESS_STORAGE_KEY = "sageforce_module_progress";

export type ModuleProgress = { read: number; total: number };

export const saveModuleProgress = (progress: ModuleProgress) => {
  localStorage.setItem(MODULE_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
};

export const loadModuleProgress = (): ModuleProgress | null => {
  const raw = localStorage.getItem(MODULE_PROGRESS_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ModuleProgress;
    return typeof parsed?.read === "number" && typeof parsed?.total === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
};
