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
  generationConfig?: {
    numQuestions: number;
    difficulty: string;
    questionTypes: string[];
    topic?: string;
  } | null;
};

export type UploadedDocument = {
  id: number;
  title: string;
  status: string;
  createdAt?: string | null;
};

export type QuizConfig = {
  moduleTitle: string;
  topic: string;
  passingScore: number;
  timeLimit: number; // minutes; 0 means no time limit
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



// A new hire's submitted attempt. Persisted client-side because the backend
// has no attempt/scoring endpoint — we snapshot the exact questions answered
// plus the chosen option per question so the results page can score locally.
export type QuizAttempt = {
  quizId: number | null;
  title: string;
  submittedAt: string;
  questions: QuizQuestion[];
  answers: Record<number, number>;
};

export const QUIZ_CONFIG_STORAGE_KEY = "sageforce_configure_quiz";
export const QUIZ_ATTEMPT_STORAGE_KEY = "sageforce_quiz_attempt";

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
