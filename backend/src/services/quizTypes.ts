export interface QuizOption {
    id: number;
    text: string;
    isCorrect: boolean;
  }
  
  export interface QuizQuestion {
    id: number;
    prompt: string;
    type: "multiple_choice";
    options: QuizOption[];
    explanation: string;
  }
  
  export interface GenerationConfig {
    numQuestions: number;
    difficulty: "easy" | "medium" | "hard";
    questionTypes: string[];
    // Tier 1 customization: an optional topic/focus area the manager can specify.
    // Treated as a subject to focus on, not as freeform instructions.
    topic?: string;
  }