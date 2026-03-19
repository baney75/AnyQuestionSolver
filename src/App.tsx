import React, { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

import type { AppState, SolveMode, ChatMessage, HistoryItem } from "./types";
import { useDarkMode } from "./hooks/useDarkMode";
import { useHistory } from "./hooks/useHistory";
import { useFilePreview } from "./hooks/useFilePreview";
import { resizeImage } from "./utils/image";
import { stripSolutionClientArtifacts } from "./utils/solution";
import { solveQuestion, solveTextQuestion, chatWithTutor } from "./services/gemini";

import { Header } from "./components/Header";
import { Dropzone } from "./components/Dropzone";
import { InputPreview } from "./components/InputPreview";
import { SolutionDisplay } from "./components/SolutionDisplay";
import { ActionBar } from "./components/ActionBar";
import { ChatPanel } from "./components/ChatPanel";
import { LoadingState } from "./components/LoadingState";
import { ErrorState } from "./components/ErrorState";
import { HistorySidebar } from "./components/HistorySidebar";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_SOLVE_MODE: SolveMode = "fast";

interface SolveRequest {
  mode: SolveMode;
  detailed?: boolean;
  nextImageFile?: File | null;
  nextTextInput?: string | null;
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

  // ── Chat state ──────────────────────────────────────────────────────
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  // ── Sidebar state ───────────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false);
  const idleDraftBufferRef = useRef("");
  const idleDraftCaptureTimeoutRef = useRef<number | null>(null);

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
    setAppState("IDLE");
    setImageFile(null);
    setTextInput(null);
    setSolution(null);
    setErrorMsg(null);
    setChatHistory([]);
  }, []);

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

  const runSolve = useCallback(
    async ({
      mode,
      detailed = false,
      nextImageFile = imageFile,
      nextTextInput = textInput,
    }: SolveRequest) => {
      const trimmedText = nextTextInput?.trim() ?? null;

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

      try {
        let result: string;
        if (nextImageFile) {
          const base64 = await resizeImage(nextImageFile);
          result = await solveQuestion(base64, mode, subject, detailed);
        } else if (trimmedText) {
          result = await solveTextQuestion(trimmedText, mode, subject, detailed);
        } else {
          throw new Error("No input provided.");
        }

        setSolution(result);
        setAppState("SOLVED");
        history.push({
          id: Date.now().toString(),
          timestamp: Date.now(),
          solution: result,
          type: "solve",
        });
      } catch (err) {
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
    [imageFile, textInput, subject, history],
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

        const reply = await chatWithTutor([...context, ...historyBeforeCurrentTurn], trimmed);
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
    setAppState("SOLVED");
    setShowHistory(false);
    setImageFile(null);
    setTextInput(null);
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

      <div className="max-w-5xl mx-auto px-4 py-8 md:py-12">
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
              <SolutionDisplay solution={solution} />

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
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
