import {
  DEFAULT_QUIZ_CONFIG,
  QUIZ_ATTEMPT_STORAGE_KEY,
  QUIZ_CONFIG_STORAGE_KEY,
  type QuizAttempt,
  type QuizConfig,
  type UploadedDocument,
} from "./types";

const UPLOADED_DOCS_STORAGE_KEY = "sageforce_uploaded_documents";
// Tracks which documents a manager has *unchecked* for quiz generation on the
// Upload Content page, rather than which ones are checked — so newly
// uploaded documents default to selected without any extra bookkeeping.
const DESELECTED_DOCUMENT_IDS_STORAGE_KEY = "sageforce_deselected_document_ids";

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
      topic: typeof parsed.topic === "string" ? parsed.topic.trim() : DEFAULT_QUIZ_CONFIG.topic,
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

export const loadDeselectedDocumentIds = (): Set<number> => {
  const raw = localStorage.getItem(DESELECTED_DOCUMENT_IDS_STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is number => typeof id === "number"))
      : new Set();
  } catch {
    return new Set();
  }
};

export const saveDeselectedDocumentIds = (ids: Set<number>) => {
  localStorage.setItem(DESELECTED_DOCUMENT_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
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

const MODULE_READ_IDS_STORAGE_KEY = "sageforce_module_read_ids";

// Read-progress is tracked per learner AND per quiz/module, so one learner's
// progress on a module doesn't bleed into another module — or into a different
// learner signing in on the same browser. The value is the set of read
// document IDs (the DisplayDoc `id`s, e.g. "doc-12"), not just a count, so the
// per-row Read/Unread badges can be restored too, not only the bar total.
const moduleReadKey = (userId: string, quizId: number) =>
  `${MODULE_READ_IDS_STORAGE_KEY}:${userId}:${quizId}`;

export const loadReadDocIds = (userId: string, quizId: number): Set<string> => {
  const raw = localStorage.getItem(moduleReadKey(userId, quizId));
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
};

export const saveReadDocIds = (userId: string, quizId: number, ids: Set<string>) => {
  localStorage.setItem(moduleReadKey(userId, quizId), JSON.stringify(Array.from(ids)));
};
