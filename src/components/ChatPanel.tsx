import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import type { ChatMessage } from "../types";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, isLoading, onSend }: ChatPanelProps) {
  const [input, setInput] = useState("");

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    onSend(trimmed);
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
                      ? "bg-indigo-100 dark:bg-indigo-900/50"
                      : "bg-white dark:bg-gray-800"
                  } text-gray-900 dark:text-gray-100`}
                >
                  <p className="whitespace-pre-wrap text-sm font-medium">{msg.text}</p>
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
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Ask a follow-up question..."
            className="flex-1 bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 rounded-xl px-4 py-3 focus:outline-none neo-shadow-sm font-medium"
            disabled={isLoading}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white border-2 border-gray-900 dark:border-gray-100 p-3 rounded-xl transition-all flex items-center justify-center neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
