import React, { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";

import type { AppState, SolveMode, ChatMessage, HistoryItem } from "./types";
import { useDarkMode } from "./hooks/useDarkMode";
import { useHistory } from "./hooks/useHistory";
import { useFilePreview } from "./hooks/useFilePreview";
import { resizeImage } from "./utils/image";
import {
  solveQuestion,
  solveTextQuestion,
  chatWithTutor,
  gradeWork,
} from "./services/gemini";

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

export default function App() {
  // ── Core application state ──────────────────────────────────────────
  const [appState, setAppState] = useState<AppState>("IDLE");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<SolveMode>("deep");

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

  // ── Hooks ───────────────────────────────────────────────────────────
  const [darkMode, toggleDarkMode] = useDarkMode();
  const history = useHistory();

  // ── Helpers ─────────────────────────────────────────────────────────

  /** Resets everything back to the initial idle screen. */
  const resetAll = useCallback(() => {
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

  const handleSolve = useCallback(
    async (mode: SolveMode, detailed = false) => {
      setAppState("LOADING");
      setErrorMsg(null);
      setSolution(null);
      setChatHistory([]);
      setLastMode(mode);

      try {
        let result: string;
        if (imageFile) {
          const base64 = await resizeImage(imageFile);
          result = await solveQuestion(base64, mode, subject, detailed);
        } else if (textInput) {
          result = await solveTextQuestion(textInput, mode, subject, detailed);
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
        if (msg.includes("429") || msg.includes("quota"))
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

  const handleGradeWork = useCallback(async () => {
    if (!imageFile) return;
    setAppState("LOADING");
    setErrorMsg(null);
    setSolution(null);
    setChatHistory([]);

    try {
      const base64 = await resizeImage(imageFile);
      const result = await gradeWork(base64);

      setSolution(result);
      setAppState("SOLVED");
      history.push({
        id: Date.now().toString(),
        timestamp: Date.now(),
        solution: result,
        type: "grade",
      });
    } catch (err) {
      console.error(err);
      setErrorMsg("Failed to grade work. Please try again.");
      setAppState("ERROR");
    }
  }, [imageFile, history]);

  // ── Chat handler ────────────────────────────────────────────────────

  const handleSendChat = useCallback(
    async (text: string) => {
      if (!solution) return;

      const userMsg: ChatMessage = { role: "user", text };
      const updated = [...chatHistory, userMsg];
      setChatHistory(updated);
      setIsChatLoading(true);

      try {
        // Prepend the solution as context for the first message
        const context: ChatMessage[] =
          chatHistory.length === 0
            ? [
                { role: "user", text: "Please help me understand this problem." },
                { role: "tutor", text: `Here is the solution I provided earlier:\n\n${solution}` },
              ]
            : [];

        const reply = await chatWithTutor([...context, ...chatHistory], text);
        setChatHistory([...updated, { role: "tutor", text: reply }]);
      } catch (err) {
        console.error(err);
        setChatHistory([
          ...updated,
          { role: "tutor", text: "Sorry, I couldn't process that right now. Please try again." },
        ]);
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

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 bg-grid-pattern text-gray-900 dark:text-gray-100 font-sans selection:bg-indigo-100 selection:text-indigo-900 dark:selection:bg-indigo-900 dark:selection:text-indigo-100 transition-colors duration-200">
      {showHistory && (
        <HistorySidebar
          items={history.items}
          onSelect={loadHistoryItem}
          onClose={() => setShowHistory(false)}
        />
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <Header
          darkMode={darkMode}
          onToggleDark={toggleDarkMode}
          onOpenHistory={() => setShowHistory(true)}
        />

        <main className="space-y-8">
          {/* ── Idle: show dropzone ──────────────────────────────── */}
          {appState === "IDLE" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-4 flex items-center justify-end gap-2 no-print">
                <label htmlFor="subject-select" className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100">
                  SUBJECT:
                </label>
                <div className="relative">
                  <select
                    id="subject-select"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="appearance-none bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium dark:text-white focus:outline-none neo-shadow-sm min-h-[44px]"
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
                  <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-gray-900 dark:text-gray-100 pointer-events-none" />
                </div>
              </div>

              <Dropzone
                onImageSelected={handleImageSelected}
                onTextPasted={handleTextPasted}
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
            <InputPreview
              imagePreviewUrl={imagePreviewUrl}
              textInput={textInput}
              imageFile={imageFile}
              onSolve={handleSolve}
              onGrade={handleGradeWork}
              onClear={resetAll}
            />
          )}

          {/* ── Loading spinner ──────────────────────────────────── */}
          {appState === "LOADING" && <LoadingState />}

          {/* ── Error message ────────────────────────────────────── */}
          {appState === "ERROR" && errorMsg && (
            <ErrorState
              message={errorMsg}
              onRetry={() => handleSolve("deep")}
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
                onSolveAgain={handleSolve}
                onClear={resetAll}
              />

              <ChatPanel
                messages={chatHistory}
                isLoading={isChatLoading}
                onSend={handleSendChat}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}