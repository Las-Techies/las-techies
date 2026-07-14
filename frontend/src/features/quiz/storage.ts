import { DEFAULT_QUIZ_CONFIG, QUIZ_CONFIG_STORAGE_KEY, type QuizConfig } from "./types";

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
