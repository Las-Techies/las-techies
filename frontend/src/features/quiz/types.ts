export type QuizDifficulty = "Easy" | "Medium" | "Hard";

export type QuizQuestionOption = {
  id: number;
  text: string;
  isCorrect: boolean;
};

export type QuizQuestion = {
  id: number;
  prompt: string;
  type: string;
  options: QuizQuestionOption[];
  explanation: string;
  citation?: QuizCitation; // optional for fallback safety
};

export type GeneratedQuiz = {
  id: number;
  teamId: number;
  title: string;
  description: string | null;
  status: string;
  sourceDocumentIds: number[];
  questionsPayload: QuizQuestion[];
  passingScore: number | null;
  timeLimitMinutes: number | null;
  dueDate: string | null;
};

export type UploadedDocument = {
  id: number;
  title: string;
  status: string;
};

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

export type QuizCitation = {
  sourceDocumentId: number;
  sourceDocumentTitle: string;
  sourceSnippet: string;
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
