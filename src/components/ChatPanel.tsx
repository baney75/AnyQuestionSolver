import { useMemo, useState, useRef } from "react";
import { MessageSquare, PencilLine, RefreshCw, Send, Sparkles } from "lucide-react";

import type { ChatMessage } from "../types";
import { RichResponse } from "./RichResponse";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => Promise<boolean>;
  onRetryLast: () => Promise<boolean>;
  lastUserMessage: string | null;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  starterPrompts?: string[];
}

function TutorMessage({ text }: { text: string }) {
  return <RichResponse text={text} compact />;
}

function describeSuggestion(suggestion: string) {
  if (/watch for|video/i.test(suggestion)) {
    return "Focus the media instead of re-asking the whole problem.";
  }
  if (/next step|on my own/i.test(suggestion)) {
    return "Keep momentum without revealing everything at once.";
  }
  if (/mistake|check/i.test(suggestion)) {
    return "Use this to catch reasoning errors before they compound.";
  }
  if (/study guide|review/i.test(suggestion)) {
    return "Turn the answer into something you can actually reuse later.";
  }
  if (/simpler|plain|jargon/i.test(suggestion)) {
    return "Compress the explanation into cleaner language.";
  }
  if (/compare/i.test(suggestion)) {
    return "See where the media and written method line up or diverge.";
  }

  return "A strong follow-up that pushes the answer forward.";
}

function cleanSuggestionLabel(suggestion: string) {
  return suggestion
    .replace(/\s+/g, " ")
    .replace(/[.。]\s*$/, "")
    .trim();
}

export function ChatPanel({
  messages,
  isLoading,
  onSend,
  onRetryLast,
  lastUserMessage,
  inputRef,
  starterPrompts = [],
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLTextAreaElement>(null);
  const effectiveInputRef = inputRef ?? internalInputRef;
  const latestTutorMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "tutor")?.text ?? "",
    [messages],
  );
  const followUpSuggestions = useMemo(() => {
    const numberedChoices = [...latestTutorMessage.matchAll(/(?:^|\n)\s*\d+\.\s+(.+?)(?=(?:\n\s*\d+\.\s+)|$)/g)]
      .map((match) => cleanSuggestionLabel(match[1] ?? ""))
      .filter((value): value is string => Boolean(value));

    if (numberedChoices.length > 0) {
      return numberedChoices.slice(0, 4);
    }

    return [];
  }, [latestTutorMessage]);
  const visibleSuggestions = followUpSuggestions.length > 0
    ? followUpSuggestions
    : starterPrompts.length > 0
      ? starterPrompts
      : [
          "Explain that in simpler words.",
          "Show me the next step only.",
          "Check whether my reasoning is right.",
          "Turn this into a short study guide.",
        ];

  const handleSuggestion = async (suggestion: string) => {
    setInput(suggestion);
    effectiveInputRef.current?.focus();

    if (followUpSuggestions.length > 0 && !isLoading) {
      const success = await onSend(suggestion);
      if (success) {
        setInput("");
      }
    }
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const success = await onSend(trimmed);
    if (success) {
      setInput("");
    }
  };

  const handlePanelEscape = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (input.trim()) {
      setInput("");
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && panelRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  };

  const isTutorFailureMessage = (text: string) =>
    /^Sorry, I couldn't process that right now\./i.test(text.trim());

  return (
    <div
      ref={panelRef}
      data-chat-panel="true"
      onKeyDownCapture={handlePanelEscape}
      className="overflow-hidden rounded-xl border-2 border-gray-900 bg-white neo-shadow no-print dark:border-gray-100 dark:bg-gray-900"
    >
      <div className="flex items-center justify-between border-b-2 border-gray-900 bg-gray-100 p-4 dark:border-gray-100 dark:bg-gray-800">
        <div className="flex items-start gap-3">
          <MessageSquare className="mt-0.5 h-5 w-5 text-gray-900 dark:text-gray-100" />
          <div>
            <h3 className="font-sans text-lg font-bold text-gray-900 dark:text-gray-100">
              Follow-up Tutor
            </h3>
            <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Keep the thread tied to the current problem. Ask for the next step, a check on your work, or a cleaner explanation.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          {messages.length} turn{messages.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[minmax(0,1.45fr)_380px] xl:items-start">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.2rem] border border-gray-300 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/40">
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                Conversation
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {followUpSuggestions.length > 0
                  ? "The tutor is asking for a specific clarification. Pick one or answer directly."
                  : "Short, specific follow-ups work best here."}
              </p>
            </div>
            <span className="rounded-full border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              {followUpSuggestions.length > 0 ? "Clarify & Continue" : "Continue the Thread"}
            </span>
          </div>

          {messages.length > 0 ? (
            <div className="scroll-panel space-y-4 overflow-y-auto rounded-[1.6rem] border-2 border-gray-900 bg-gray-50/60 p-4 pr-3 dark:border-gray-100 dark:bg-gray-950/40 md:max-h-[620px]">
              {messages.map((msg, idx) => (
                <div key={`${msg.role}-${idx}`} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[95%] rounded-[1.4rem] border-2 px-4 py-4 shadow-[4px_4px_0_0_rgba(17,24,39,0.08)] md:max-w-[88%] ${
                      msg.role === "user"
                        ? "border-gray-900 bg-[var(--aqs-accent-soft)] text-gray-900 dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.28)] dark:text-gray-100"
                        : isTutorFailureMessage(msg.text)
                          ? "border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] text-gray-900 dark:border-[var(--aqs-accent-dark)] dark:bg-[color:rgba(122,31,52,0.18)] dark:text-gray-100"
                          : "border-gray-900 bg-white text-gray-900 dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100"
                    }`}
                  >
                    <p className="mb-2 text-[11px] font-mono font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                      {msg.role === "user" ? "You" : isTutorFailureMessage(msg.text) ? "Tutor Retry Needed" : "Tutor"}
                    </p>
                    {msg.role === "user" ? (
                      <p className="whitespace-pre-wrap break-words text-sm font-medium leading-7">{msg.text}</p>
                    ) : isTutorFailureMessage(msg.text) ? (
                      <div className="space-y-3">
                        <p className="text-sm font-medium leading-7">{msg.text}</p>
                        <div className="rounded-xl border border-[var(--aqs-accent)]/25 bg-white/70 px-3 py-3 text-sm leading-6 text-gray-700 dark:border-[var(--aqs-accent-dark)]/40 dark:bg-gray-900/60 dark:text-gray-200">
                          Try answering the clarification directly, or use one of the prompt cards on the right to restate the ask more concretely.
                        </div>
                      </div>
                    ) : (
                      <TutorMessage text={msg.text} />
                    )}
                  </div>
                </div>
              ))}

              {isLoading ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-3 neo-shadow-sm dark:border-gray-100 dark:bg-gray-800">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-900 dark:bg-gray-100" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-900 dark:bg-gray-100" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-gray-900 dark:bg-gray-100" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[1.8rem] border-2 border-gray-900 bg-[linear-gradient(180deg,rgba(247,236,240,0.7),rgba(255,255,255,0.95))] p-5 neo-shadow-sm dark:border-gray-100 dark:bg-[linear-gradient(180deg,rgba(122,31,52,0.12),rgba(17,24,39,0.92))]">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)]">
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-mono font-bold uppercase tracking-[0.22em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                      Start Strong
                    </p>
                    <h4 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">
                      Ask for one useful next move.
                    </h4>
                    <p className="mt-3 max-w-2xl text-sm leading-7 text-gray-700 dark:text-gray-300">
                      The best follow-up is narrow and concrete: ask for the next step, a correction, a recap, or what to watch for in the media above.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {visibleSuggestions.slice(0, 4).map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void handleSuggestion(suggestion)}
                        className="rounded-[1.2rem] border border-gray-300 bg-white/90 px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--aqs-accent)] dark:border-gray-700 dark:bg-gray-900/80"
                      >
                        <p className="text-sm font-semibold leading-6 text-gray-900 dark:text-gray-100">
                          {suggestion}
                        </p>
                        <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                          {describeSuggestion(suggestion)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.2rem] border border-gray-300 bg-white/85 p-4 dark:border-gray-700 dark:bg-gray-900/70">
                  <p className="text-xs font-mono font-bold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    Good Follow-Ups
                  </p>
                  <div className="mt-3 space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    <p>Ask for the next step, not a full repeat.</p>
                    <p>Reference the image, video, graph, or paragraph you mean.</p>
                    <p>If the tutor asked a clarification, answer that directly.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <div className="rounded-[1.5rem] border-2 border-gray-900 bg-white p-4 neo-shadow-sm dark:border-gray-100 dark:bg-gray-900">
            <label htmlFor="follow-up-input" className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
              Compose Follow-Up
            </label>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Ask for one clear next move. Press <span className="font-mono">Esc</span> to clear the draft or exit the field.
            </p>
            <textarea
              id="follow-up-input"
              ref={effectiveInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
              placeholder="Ask for one clear next move…"
              rows={5}
              name="follow_up"
              autoComplete="off"
              className="mt-3 min-h-[168px] w-full resize-y rounded-2xl border-2 border-gray-900 bg-white px-4 py-3 font-medium leading-7 text-gray-900 neo-shadow-sm focus:border-[var(--aqs-accent)] focus:outline-none focus:ring-4 focus:ring-[color:rgba(122,31,52,0.18)] dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100"
              disabled={isLoading}
            />
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>Enter sends. Shift+Enter adds a new line.</span>
              <span>{input.trim().length} chars</span>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleSubmit();
              }}
              disabled={!input.trim() || isLoading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-3 font-bold text-white transition-all neo-shadow-sm hover:bg-[var(--aqs-accent-strong)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-300 disabled:active:translate-x-0 disabled:active:translate-y-0 dark:border-gray-100 dark:disabled:bg-gray-700"
              aria-label="Send follow-up question"
            >
              <Send className="h-5 w-5" />
              Send Follow-Up
            </button>
          </div>

          <div className="rounded-[1.5rem] border-2 border-gray-900 bg-white p-4 neo-shadow-sm dark:border-gray-100 dark:bg-gray-900">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]" />
              <div>
                <p className="text-xs font-mono font-bold uppercase tracking-[0.2em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                  Ask Better
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  Best results come from one clear ask at a time. If the tutor requested clarification, answer that directly instead of rephrasing the whole problem.
                </p>
              </div>
            </div>

            {visibleSuggestions.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-mono font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                  {followUpSuggestions.length > 0 ? "Reply Options" : "Useful Prompts"}
                </p>
                <div className="space-y-2">
                  {visibleSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void handleSuggestion(suggestion)}
                      className="w-full rounded-[1.1rem] border border-gray-300 bg-[var(--aqs-accent-soft)] px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--aqs-accent)] dark:border-gray-700 dark:bg-[color:rgba(122,31,52,0.18)]"
                    >
                      <p className="text-sm font-semibold leading-6 text-gray-900 dark:text-gray-100">
                        {suggestion}
                      </p>
                      <p className="mt-1.5 text-xs leading-5 text-gray-600 dark:text-gray-300">
                        {followUpSuggestions.length > 0
                          ? "Direct answer choice. Click to send it immediately."
                          : describeSuggestion(suggestion)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {lastUserMessage ? (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  void onRetryLast();
                }}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition-all neo-shadow-sm hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-200 dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:disabled:bg-gray-700"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Last
              </button>
              <button
                type="button"
                onClick={() => setInput(lastUserMessage)}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition-all neo-shadow-sm hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-200 dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:disabled:bg-gray-700"
              >
                <PencilLine className="h-4 w-4" />
                Edit Last
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
