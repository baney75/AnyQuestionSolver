import { useState } from "react";
import { MessageSquare, PencilLine, RefreshCw, Send } from "lucide-react";

import type { ChatMessage } from "../types";
import { RichResponse } from "./RichResponse";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => Promise<boolean>;
  onRetryLast: () => Promise<boolean>;
  lastUserMessage: string | null;
}

function TutorMessage({ text }: { text: string }) {
  return <RichResponse text={text} compact />;
}

export function ChatPanel({ messages, isLoading, onSend, onRetryLast, lastUserMessage }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const success = await onSend(trimmed);
    if (success) {
      setInput("");
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden no-print">
      {/* Header */}
      <div className="p-4 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-gray-900 dark:text-gray-100" />
        <h3 className="font-bold font-sans text-lg text-gray-900 dark:text-gray-100">
          Follow-up Questions
        </h3>
      </div>

      <div className="p-4 md:p-6">
        {/* Message list */}
        {messages.length > 0 && (
          <div className="space-y-4 mb-6 max-h-[400px] overflow-y-auto pr-2">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm ${
                    msg.role === "user"
                      ? "bg-[var(--aqs-accent-soft)] dark:bg-[color:rgba(122,31,52,0.28)]"
                      : "bg-white dark:bg-gray-800"
                  } text-gray-900 dark:text-gray-100`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap text-sm font-medium">{msg.text}</p>
                  ) : (
                    <TutorMessage text={msg.text} />
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm rounded-xl px-4 py-3 flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-gray-900 dark:bg-gray-100 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Ask a follow-up question..."
            className="flex-1 bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 focus:outline-none neo-shadow-sm font-medium"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={!input.trim() || isLoading}
            className="flex items-center justify-center rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] p-3 text-white transition-all neo-shadow-sm hover:bg-[var(--aqs-accent-strong)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-300 disabled:active:translate-x-0 disabled:active:translate-y-0 dark:border-gray-100 dark:disabled:bg-gray-700"
            aria-label="Send follow-up question"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        {lastUserMessage ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                void onRetryLast();
              }}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition-all neo-shadow-sm hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-200 dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:disabled:bg-gray-700 sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Last
            </button>
            <button
              type="button"
              onClick={() => setInput(lastUserMessage)}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition-all neo-shadow-sm hover:bg-gray-50 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-200 dark:border-gray-100 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 dark:disabled:bg-gray-700 sm:w-auto"
            >
              <PencilLine className="h-4 w-4" />
              Edit Last
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
