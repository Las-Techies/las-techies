export type QuizDifficulty = "Easy" | "Medium" | "Hard";

export type QuizConfig = {
  moduleTitle: string;
  topic: string;
  passingScore: number;
  timeLimit: number;
  questionCount: number;
  dueDate: string;
  difficulty: QuizDifficulty;
  generatedQuestions: string[];
};

export const QUIZ_CONFIG_STORAGE_KEY = "sageforce_configure_quiz";

export const DEFAULT_QUIZ_CONFIG: QuizConfig = {
  moduleTitle: "OSHA Basics 2026",
  topic: "Workplace Safety",
  passingScore: 70,
  timeLimit: 30,
  questionCount: 3,
  dueDate: "",
  difficulty: "Medium",
  generatedQuestions: [],
};
