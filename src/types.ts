/** Possible states for the main application flow. */
export type AppState = 'IDLE' | 'PREVIEWING' | 'LOADING' | 'SOLVED' | 'ERROR';

/** Which Gemini model tier to use when solving a question. */
export type SolveMode = 'deep' | 'fast' | 'research';

/** A single message in the follow-up chat with the AI tutor. */
export interface ChatMessage {
  role: 'user' | 'tutor';
  text: string;
}

/** A previously-solved question stored in localStorage history. */
export interface HistoryItem {
  id: string;
  timestamp: number;
  solution: string;
  type: 'solve' | 'grade';
  visualUrl?: string | null;
}

/** Result returned by the gradeWork service. */
export interface GradeResult {
  text: string;
  image: string | null;
}
