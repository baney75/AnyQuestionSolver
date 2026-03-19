/** Possible states for the main application flow. */
export type AppState = 'IDLE' | 'PREVIEWING' | 'LOADING' | 'SOLVED' | 'ERROR';

/** Which Gemini model tier to use when solving a question. */
export type SolveMode = 'deep' | 'fast' | 'research';

/** A grounded source rendered in the app's custom source UI. */
export interface SolutionSource {
  index: number;
  title: string;
  url: string;
  host: string;
  category: string;
}

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
  type?: 'solve' | 'grade';
}
