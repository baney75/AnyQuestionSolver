/** Possible states for the main application flow. */
export type AppState = 'IDLE' | 'PREVIEWING' | 'LOADING' | 'SOLVED' | 'ERROR' | 'NEWS' | 'WOTD';

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
  hideAnswerByDefault?: boolean;
  requestText?: string;
  subject?: string;
  mode?: SolveMode;
}

/** Context passed to AI for feature views (WOTD, News). */
export interface FeatureContext {
  type: 'wotd' | 'news';
  data: {
    word?: string;
    definition?: string;
    example?: string;
    phonetic?: string;
    partOfSpeech?: string;
    date?: string;
    articles?: Array<{
      title: string;
      link: string;
      description: string;
      source: string;
      pubDate: string;
    }>;
  };
}

/** Actions the AI can request from the UI. */
export interface AIAction {
  type: 'show_wotd' | 'show_news' | 'ask_question';
  payload?: Record<string, unknown>;
}

/** Background task that survives navigation */
export interface BackgroundTask {
  id: string;
  type: 'solve';
  status: 'running' | 'completed' | 'failed';
  solution?: string;
  hideAnswerByDefault?: boolean;
  error?: string;
  timestamp: number;
  mode: SolveMode;
  input: {
    imageFile?: File;
    textInput?: string;
    subject: string;
  };
}

/** Saved state to return to after viewing features */
export interface SavedState {
  solution: string;
  hideAnswerByDefault?: boolean;
  chatHistory: ChatMessage[];
  mode: SolveMode;
  subject: string;
  input: {
    imageFile?: File;
    textInput?: string;
  };
}
