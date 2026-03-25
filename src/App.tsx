import React, { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown, Newspaper, BookOpen, ArrowLeft, Clock } from "lucide-react";

import type { AppState, SolveMode, ChatMessage, HistoryItem, BackgroundTask, SavedState } from "./types";
import { useDarkMode } from "./hooks/useDarkMode";
import { useHistory } from "./hooks/useHistory";
import { useFilePreview } from "./hooks/useFilePreview";
import { resizeImage } from "./utils/image";
import { stripSolutionClientArtifacts } from "./utils/solution";
import { isLikelyHomeworkRequest } from "./utils/request";
import { solveQuestion, solveTextQuestion, chatWithTutor } from "./services/gemini";
import { deriveNewsQuery } from "./services/news";

import { Header } from "./components/Header";
import { Dropzone } from "./components/Dropzone";
import { InputPreview } from "./components/InputPreview";
import { SolutionDisplay } from "./components/SolutionDisplay";
import { ActionBar } from "./components/ActionBar";
import { ChatPanel } from "./components/ChatPanel";
import { LoadingState } from "./components/LoadingState";
import { ErrorState } from "./components/ErrorState";
import { HistorySidebar } from "./components/HistorySidebar";
import { WordOfTheDay } from "./components/WordOfTheDay";
import { NewsView } from "./components/NewsView";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_SOLVE_MODE: SolveMode = "fast";

interface SolveRequest {
  mode: SolveMode;
  detailed?: boolean;
  nextImageFile?: File | null;
  nextTextInput?: string | null;
}

function parseAIActions(text: string): { cleanText: string; actions: string[] } {
  const actions: string[] = [];
  let cleanText = text;

  const actionRegex = /\[ACTION:\s*(\w+)\]/g;
  let match;
  while ((match = actionRegex.exec(text)) !== null) {
    actions.push(match[1]);
    cleanText = cleanText.replace(match[0], "");
  }

  return { cleanText: cleanText.trim(), actions };
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (isEditableTarget(target) ||
      Boolean(target.closest("button, a, label, summary, [role='button'], select")))
  );
}

function isWordOfTheDayRequest(value: string) {
  return /\b(word of the day|daily word)\b/i.test(value);
}

function isNewsRequest(value: string) {
  return /\b(news|headlines|current events|latest on|latest about|what happened|what's happening|updates? on)\b/i.test(value);
}

export default function App() {
  // ── Core application state ──────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<SolveMode>(DEFAULT_SOLVE_MODE);

  // ── Input state ─────────────────────────────────────────────────────
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [textInput, setTextInput] = useState<string | null>(null);
  const [subject, setSubject] = useState("Auto-detect");
  const imagePreviewUrl = useFilePreview(imageFile);

  // ── Solution state ───────────────────────────────────────────────────
  const [solution, setSolution] = useState<string | null>(null);
  const [solutionHideAnswerDefault, setSolutionHideAnswerDefault] = useState(false);

  // ── Chat state ──────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // ── Sidebar state ───────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const idleDraftBufferRef = useRef("");
  const idleDraftCaptureTimeoutRef = useRef<number | null>(null);

  // ── Original question context for follow-up chat ────────────────────
  const originalQuestionRef = useRef<{ text?: string; imageBase64?: string } | null>(null);

  // ── Feature toggle state ─────────────────────────────────────────────
  const [newsQuery, setNewsQuery] = useState("");

  // ── Background task state ───────────────────────────────────────────
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);
  const [savedState, setSavedState] = useState<SavedState | null>(null);
  const [isReturning, setIsReturning] = useState(false);

  // ── Hooks ───────────────────────────────────────────────────────────
  const [darkMode, toggleDarkMode] = useDarkMode();
  const history = useHistory();

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Resets everything back to the initial idle screen. */
  const resetAll = useCallback(() => {
    idleDraftBufferRef.current = "";
    if (idleDraftCaptureTimeoutRef.current !== null) {
      window.clearTimeout(idleDraftCaptureTimeoutRef.current);
      idleDraftCaptureTimeoutRef.current = null;
    }
    originalQuestionRef.current = null;
    setAppState("IDLE");
    setImageFile(null);
    setTextInput(null);
    setSolution(null);
    setSolutionHideAnswerDefault(false);
    setErrorMsg(null);
    setChatHistory([]);
    setNewsQuery("");
    setSavedState(null);
    setIsReturning(false);
  }, []);

  // ── Feature handlers ────────────────────────────────────────────────

  const handleOpenNews = useCallback((query?: string) => {
    if (solution && appState === "SOLVED") {
      setSavedState({
        solution,
        hideAnswerByDefault: solutionHideAnswerDefault,
        chatHistory,
        mode: lastMode,
        subject,
        input: { imageFile: imageFile ?? undefined, textInput: textInput ?? undefined },
      });
      setIsReturning(true);
    }
    setNewsQuery(query || "");
    setAppState("NEWS");
  }, [solution, solutionHideAnswerDefault, chatHistory, lastMode, subject, imageFile, textInput, appState]);

  const handleOpenWotd = useCallback(() => {
    if (solution && appState === "SOLVED") {
      setSavedState({
        solution,
        hideAnswerByDefault: solutionHideAnswerDefault,
        chatHistory,
        mode: lastMode,
        subject,
        input: { imageFile: imageFile ?? undefined, textInput: textInput ?? undefined },
      });
      setIsReturning(true);
    }
    setAppState("WOTD");
  }, [solution, solutionHideAnswerDefault, chatHistory, lastMode, subject, imageFile, textInput, appState]);

  const handleReturnToPrevious = useCallback(() => {
    if (savedState) {
      setSolution(savedState.solution);
      setSolutionHideAnswerDefault(savedState.hideAnswerByDefault ?? false);
      setChatHistory(savedState.chatHistory);
      setLastMode(savedState.mode);
      setSubject(savedState.subject);
      setImageFile(savedState.input.imageFile ?? null);
      setTextInput(savedState.input.textInput ?? null);
      setAppState("SOLVED");
      setSavedState(null);
      setIsReturning(false);
      return;
    }

    const completedTask = backgroundTasks.find((t) => t.status === "completed" && t.type === "solve");
    if (completedTask && completedTask.solution) {
      setSolution(completedTask.solution);
      setSolutionHideAnswerDefault(completedTask.hideAnswerByDefault ?? false);
      setChatHistory([]);
      setLastMode(completedTask.mode);
      setSubject(completedTask.input.subject);
      setImageFile(completedTask.input.imageFile ?? null);
      setTextInput(completedTask.input.textInput ?? null);
      setAppState("SOLVED");
      setBackgroundTasks((prev) => prev.filter((t) => t.id !== completedTask.id));
      setIsReturning(false);
    }
  }, [savedState, backgroundTasks]);

  // ── Input handlers ──────────────────────────────────────────────────

  const handleImageSelected = useCallback((file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMsg("Image is too large (max 10 MB). Try a cropped screenshot.");
      setAppState("ERROR");
      return;
    }
    setImageFile(file);
    setTextInput(null);
    setAppState("PREVIEWING");
    setErrorMsg(null);
  }, []);

  const handleTextPasted = useCallback((text: string) => {
    setTextInput(text);
    setImageFile(null);
    setAppState("PREVIEWING");
    setErrorMsg(null);
  }, []);

  // ── Solve / Grade handlers ──────────────────────────────────────────

  const currentTaskIdRef = useRef<string | null>(null);

  const runSolve = useCallback(
    async ({
      mode,
      detailed = false,
      nextImageFile = imageFile,
      nextTextInput = textInput,
    }: SolveRequest) => {
      const trimmedText = nextTextInput?.trim() ?? null;
      const taskId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      currentTaskIdRef.current = taskId;
      const nextHideAnswerByDefault = isLikelyHomeworkRequest(trimmedText, {
        hasImage: Boolean(nextImageFile),
        subject,
      });

      if (nextImageFile) {
        setImageFile(nextImageFile);
        setTextInput(null);
      } else if (trimmedText) {
        setTextInput(trimmedText);
        setImageFile(null);
      }

      setAppState("LOADING");
      setErrorMsg(null);
      setSolution(null);
      setChatHistory([]);
      setLastMode(mode);

      const currentAppState = { current: appState };

      try {
        let result: string;
        let originalImageBase64: string | undefined;

        if (nextImageFile) {
          originalImageBase64 = await resizeImage(nextImageFile);
          result = await solveQuestion(originalImageBase64, mode, subject, detailed);
        } else if (trimmedText) {
          if (isWordOfTheDayRequest(trimmedText)) {
            setAppState("WOTD");
            return;
          }

          if (isNewsRequest(trimmedText)) {
            setNewsQuery(deriveNewsQuery(trimmedText));
            setAppState("NEWS");
            return;
          }

          result = await solveTextQuestion(trimmedText, mode, subject, detailed);
        } else {
          throw new Error("No input provided.");
        }

        originalQuestionRef.current = {
          text: trimmedText ?? undefined,
          imageBase64: originalImageBase64,
        };

        if (currentTaskIdRef.current !== taskId) {
          return;
        }

        const { cleanText, actions } = parseAIActions(result);

        if (actions.includes("show_wotd")) {
          if (solution && currentAppState.current === "SOLVED") {
            setSavedState({
              solution,
              hideAnswerByDefault: solutionHideAnswerDefault,
              chatHistory,
              mode: lastMode,
              subject,
              input: { imageFile: imageFile ?? undefined, textInput: textInput ?? undefined },
            });
          }
          setAppState("WOTD");
          return;
        }

        if (actions.includes("show_news")) {
          if (solution && currentAppState.current === "SOLVED") {
            setSavedState({
              solution,
              hideAnswerByDefault: solutionHideAnswerDefault,
              chatHistory,
              mode: lastMode,
              subject,
              input: { imageFile: imageFile ?? undefined, textInput: textInput ?? undefined },
            });
          }
          setNewsQuery(deriveNewsQuery(trimmedText ?? cleanText));
          setAppState("NEWS");
          return;
        }

        const finalSolution = cleanText || result;

        if (currentAppState.current === "NEWS" || currentAppState.current === "WOTD") {
          setBackgroundTasks((prev) => [
            ...prev.filter((t) => t.id !== taskId),
            {
              id: taskId,
              type: "solve",
              status: "completed",
              solution: finalSolution,
              hideAnswerByDefault: nextHideAnswerByDefault,
              timestamp: Date.now(),
              mode,
              input: { imageFile: nextImageFile ?? undefined, textInput: trimmedText ?? undefined, subject },
            },
          ]);
          return;
        }

        setSolution(finalSolution);
        setSolutionHideAnswerDefault(nextHideAnswerByDefault);
        setAppState("SOLVED");
        history.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          solution: finalSolution,
          type: "solve",
          hideAnswerByDefault: nextHideAnswerByDefault,
          requestText: trimmedText ?? undefined,
          subject,
          mode,
        });
      } catch (err) {
        if (currentTaskIdRef.current !== taskId) {
          return;
        }
        console.error(err);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("No input provided"))
          setErrorMsg("Add a question or paste an image to continue.");
        else if (msg.includes("No usable Gemini model"))
          setErrorMsg("The configured Gemini model alias is unavailable. Check GEMINI_FAST_MODEL, GEMINI_GROUNDED_MODEL, or GEMINI_PRO_MODEL.");
        else if (msg.includes("429") || msg.includes("quota"))
          setErrorMsg("Too many requests — please wait a moment and try again.");
        else if (msg.includes("offline") || msg.includes("fetch"))
          setErrorMsg("No internet connection. Please check your network.");
        else if (msg.includes("API key") || msg.includes("403"))
          setErrorMsg("Invalid API key. Please check GEMINI_API_KEY in your .env.local file.");
        else
          setErrorMsg("Something went wrong. Please try again.");
        setAppState("ERROR");
      }
    },
    [imageFile, textInput, subject, history, solution, solutionHideAnswerDefault, chatHistory, lastMode, appState],
  );

  const handleSolve = useCallback(
    (mode: SolveMode, detailed = false) => {
      void runSolve({ mode, detailed });
    },
    [runSolve],
  );

  const handleQuickTextSubmit = useCallback(
    (text: string) => {
      void runSolve({
        mode: DEFAULT_SOLVE_MODE,
        nextImageFile: null,
        nextTextInput: text,
      });
    },
    [runSolve],
  );

  useEffect(() => {
    const handleIdleTyping = (event: KeyboardEvent) => {
      const isCapturingBufferedDraft = idleDraftBufferRef.current.length > 0;
      if (
        (appState !== "IDLE" && !isCapturingBufferedDraft) ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (!isCapturingBufferedDraft && isInteractiveTarget(event.target)) ||
        event.key.length !== 1 ||
        (!isCapturingBufferedDraft && event.key.trim().length === 0)
      ) {
        return;
      }

      event.preventDefault();
      const nextDraft = `${idleDraftBufferRef.current}${event.key}`;
      idleDraftBufferRef.current = nextDraft;
      if (idleDraftCaptureTimeoutRef.current !== null) {
        window.clearTimeout(idleDraftCaptureTimeoutRef.current);
      }
      idleDraftCaptureTimeoutRef.current = window.setTimeout(() => {
        idleDraftBufferRef.current = "";
        idleDraftCaptureTimeoutRef.current = null;
      }, 300);
      handleTextPasted(nextDraft);
    };

    window.addEventListener("keydown", handleIdleTyping, true);
    return () => {
      window.removeEventListener("keydown", handleIdleTyping, true);
      if (idleDraftCaptureTimeoutRef.current !== null) {
        window.clearTimeout(idleDraftCaptureTimeoutRef.current);
        idleDraftCaptureTimeoutRef.current = null;
      }
    };
  }, [appState, handleTextPasted]);

  // ── Global keyboard shortcuts ────────────────────────────────────────

  // ESC to close views/navigate back
  const chatInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleGlobalKeys = (event: KeyboardEvent) => {
      // ESC: Close views and navigate back - handle this even if in an input
      if (event.key === "Escape") {
        if (showHistory) {
          event.preventDefault();
          setShowHistory(false);
          return;
        }

        if (appState === "NEWS" || appState === "WOTD") {
          event.preventDefault();
          if (savedState || backgroundTasks.some((t) => t.status === "completed")) {
            handleReturnToPrevious();
          } else {
            resetAll();
          }
          return;
        }

        if (appState === "SOLVED") {
          event.preventDefault();
          if (savedState || backgroundTasks.some((t) => t.status === "completed")) {
            handleReturnToPrevious();
          }
          return;
        }

        if (appState === "IDLE") {
          return;
        }
      }

      // Don't intercept other keys if user is typing in an input
      if (isInteractiveTarget(event.target)) {
        return;
      }

      // In SOLVED state: typing auto-focuses chat input
      if (appState === "SOLVED" && !isChatLoading) {
        const isPrintableKey = event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
        if (isPrintableKey && !event.shiftKey) {
          // Small delay to allow the key to be typed before focus
          setTimeout(() => {
            chatInputRef.current?.focus();
          }, 10);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeys);
    return () => window.removeEventListener("keydown", handleGlobalKeys);
  }, [appState, showHistory, savedState, backgroundTasks, handleReturnToPrevious, resetAll, isChatLoading]);

  useEffect(() => {
    if (appState !== "PREVIEWING") {
      return;
    }

    const handlePreviewEnter = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (isEditableTarget(target)) {
        return;
      }

      event.preventDefault();
      handleSolve(DEFAULT_SOLVE_MODE);
    };

    window.addEventListener("keydown", handlePreviewEnter);
    return () => window.removeEventListener("keydown", handlePreviewEnter);
  }, [appState, handleSolve]);

  // ── Chat handler ────────────────────────────────────────────────────

  const handleSendChat = useCallback(
    async (text: string, options?: { retryLast?: boolean }) => {
      if (!solution) return false;

      const trimmed = text.trim();
      if (!trimmed) return false;

      let historyBeforeCurrentTurn = chatHistory;
      let nextHistory: ChatMessage[];

      if (options?.retryLast) {
        const lastUserIndex = [...chatHistory].map((message) => message.role).lastIndexOf("user");
        if (lastUserIndex === -1) {
          return false;
        }

        historyBeforeCurrentTurn = chatHistory.slice(0, lastUserIndex);
        nextHistory = [...historyBeforeCurrentTurn, { role: "user", text: trimmed }];
      } else {
        nextHistory = [...chatHistory, { role: "user", text: trimmed }];
      }

      setChatHistory(nextHistory);
      setIsChatLoading(true);

      try {
        const cleanSolution = stripSolutionClientArtifacts(solution);
        const context: ChatMessage[] =
          historyBeforeCurrentTurn.length === 0
            ? [
                { role: "user", text: "Please help me understand this problem." },
                { role: "tutor", text: `Here is the solution I provided earlier:\n\n${cleanSolution}` },
              ]
            : [];

        const reply = await chatWithTutor([...context, ...historyBeforeCurrentTurn], trimmed, originalQuestionRef.current);
        setChatHistory([...nextHistory, { role: "tutor", text: reply }]);
        return true;
      } catch (err) {
        console.error(err);
        setChatHistory([
          ...nextHistory,
          { role: "tutor", text: "Sorry, I couldn't process that right now. Please try again." },
        ]);
        return false;
      } finally {
        setIsChatLoading(false);
      }
    },
    [solution, chatHistory],
  );

  // ── History handler ─────────────────────────────────────────────────

  const loadHistoryItem = useCallback((item: HistoryItem) => {
    setSolution(item.solution);
    setSolutionHideAnswerDefault(item.hideAnswerByDefault ?? false);
    setLastMode(item.mode ?? DEFAULT_SOLVE_MODE);
    setSubject(item.subject ?? "Auto-detect");
    setAppState("SOLVED");
    setShowHistory(false);
    setImageFile(null);
    setTextInput(item.requestText ?? null);
    originalQuestionRef.current = {
      text: item.requestText ?? undefined,
    };
  }, []);

  const hasDraftInput = Boolean(imageFile || textInput?.trim());
  const updateDraftText = useCallback((value: string) => {
    setTextInput(value);
    setImageFile(null);
    setErrorMsg(null);
  }, []);
  const editCurrentRequest = useCallback(() => {
    if (!hasDraftInput) {
      return;
    }

    setErrorMsg(null);
    setAppState("PREVIEWING");
  }, [hasDraftInput]);
  const retryCurrentRequest = useCallback(() => {
    if (!hasDraftInput) {
      return;
    }

    void runSolve({ mode: lastMode });
  }, [hasDraftInput, lastMode, runSolve]);
  const lastFollowUpQuestion =
    [...chatHistory].reverse().find((message) => message.role === "user")?.text ?? null;
  const handleRetryChat = useCallback(async () => {
    if (!lastFollowUpQuestion) {
      return false;
    }

    return handleSendChat(lastFollowUpQuestion, { retryLast: true });
  }, [handleSendChat, lastFollowUpQuestion]);

  const subjectControl = (
    <div className="flex flex-col items-end gap-2 no-print sm:flex-row sm:items-center sm:justify-end">
      <label
        htmlFor="subject-select"
        className="text-sm font-bold font-mono tracking-[0.18em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]"
      >
        SUBJECT:
      </label>
      <div className="relative">
        <select
          id="subject-select"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="select-themed appearance-none rounded-2xl border-2 border-gray-900 bg-white px-4 py-3 pr-12 text-base font-semibold text-gray-900 shadow-[3px_3px_0px_0px_rgba(17,24,39,1)] outline-none transition focus-visible:-translate-y-0.5 focus-visible:border-[var(--aqs-accent)] focus-visible:ring-4 focus-visible:ring-[color:rgba(122,31,52,0.18)] dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:shadow-[3px_3px_0px_0px_rgba(243,244,246,1)] dark:focus-visible:border-[var(--aqs-accent-dark)] dark:focus-visible:ring-[color:rgba(216,148,163,0.2)]"
        >
          <option>Auto-detect</option>
          <option>Mathematics</option>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Biology</option>
          <option>Computer Science</option>
          <option>Engineering</option>
          <option>Statistics</option>
          <option>Economics</option>
          <option>History</option>
          <option>Literature</option>
          <option>Philosophy</option>
          <option>Psychology</option>
          <option>Medicine</option>
          <option>Law</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]" />
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 bg-grid-pattern text-gray-900 dark:text-gray-100 font-sans selection:bg-[var(--aqs-accent-soft)] selection:text-[var(--aqs-accent-strong)] dark:selection:bg-[color:rgba(122,31,52,0.55)] dark:selection:text-white transition-colors duration-200">
      {showHistory && (
        <HistorySidebar
          items={history.items}
          onSelect={loadHistoryItem}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div
        className={`mx-auto px-4 py-8 md:py-12 ${
          appState === "NEWS" ? "max-w-[1500px]" : appState === "WOTD" ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Header
          darkMode={darkMode}
          onToggleDark={toggleDarkMode}
          onOpenHistory={() => setShowHistory(true)}
        />

        <main className="space-y-8">
          {/* ── Idle: show dropzone ──────────────────────────────── */}
          {appState === "IDLE" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 duration-500">
              {subjectControl}
              <Dropzone
                onImageSelected={handleImageSelected}
                onTextPasted={handleTextPasted}
                onQuickSubmit={handleQuickTextSubmit}
                onError={(msg) => {
                  setErrorMsg(msg);
                  setAppState("ERROR");
                }}
                onVoiceInput={handleTextPasted}
              />

              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => handleOpenNews()}
                  className="inline-flex items-center gap-3 rounded-2xl border-2 border-gray-900 bg-white px-6 py-4 font-bold text-gray-900 transition-all hover:-translate-y-1 hover:neo-shadow active:neo-shadow-sm dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-[var(--aqs-accent-dark)]"
                >
                  <div className="rounded-lg bg-[var(--aqs-accent)] p-2">
                    <Newspaper className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm">Latest</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">News</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleOpenWotd}
                  className="inline-flex items-center gap-3 rounded-2xl border-2 border-gray-900 bg-white px-6 py-4 font-bold text-gray-900 transition-all hover:-translate-y-1 hover:neo-shadow active:neo-shadow-sm dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-[var(--aqs-accent-dark)]"
                >
                  <div className="rounded-lg bg-[var(--aqs-accent)] p-2">
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm">Word of</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">the Day</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* ── Previewing: show input + solve buttons ──────────── */}
          {appState === "PREVIEWING" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {subjectControl}
              <InputPreview
                imagePreviewUrl={imagePreviewUrl}
                textInput={textInput}
                onTextChange={updateDraftText}
                onSolve={handleSolve}
                onClear={resetAll}
              />
            </div>
          )}

          {/* ── Loading spinner ──────────────────────────────────── */}
          {appState === "LOADING" && <LoadingState />}

          {/* ── Error message ────────────────────────────────────── */}
          {appState === "ERROR" && errorMsg && (
            <ErrorState
              message={errorMsg}
              onRetry={() => {
                if (!hasDraftInput) {
                  resetAll();
                  return;
                }

                handleSolve(lastMode);
              }}
              onClear={resetAll}
            />
          )}

          {/* ── Solved: show solution + actions + chat ──────────── */}
          {appState === "SOLVED" && solution && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <SolutionDisplay
                solution={solution}
                hideAnswerByDefault={solutionHideAnswerDefault}
              />

              <ActionBar
                solution={solution}
                lastMode={lastMode}
                canRetryEdit={hasDraftInput}
                onSolveAgain={handleSolve}
                onRetry={retryCurrentRequest}
                onEditRequest={editCurrentRequest}
                onClear={resetAll}
              />

              <ChatPanel
                messages={chatHistory}
                isLoading={isChatLoading}
                lastUserMessage={lastFollowUpQuestion}
                onSend={handleSendChat}
                onRetryLast={handleRetryChat}
                inputRef={chatInputRef}
              />
            </div>
          )}

          {/* ── News view ─────────────────────────────────────── */}
          {(appState === "NEWS") && (
            <NewsView
              initialQuery={newsQuery}
              onClose={resetAll}
              onReturn={isReturning || backgroundTasks.some(t => t.status === "completed") ? handleReturnToPrevious : undefined}
              hasBackgroundTask={backgroundTasks.some(t => t.status === "completed")}
            />
          )}

          {/* ── Word of the Day view ─────────────────────────── */}
          {appState === "WOTD" && (
            <WordOfTheDay 
              onClose={resetAll} 
              onReturn={isReturning || backgroundTasks.some(t => t.status === "completed") ? handleReturnToPrevious : undefined}
            />
          )}
        </main>
      </div>
    </div>
  );
}
