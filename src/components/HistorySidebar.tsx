import { History, X } from "lucide-react";
import type { HistoryItem } from "../types";

interface HistorySidebarProps {
  items: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onClose: () => void;
}

export function HistorySidebar({ items, onSelect, onClose }: HistorySidebarProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex justify-end animate-in fade-in duration-200 no-print">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md h-full overflow-y-auto p-6 shadow-xl border-l-2 border-gray-900 dark:border-gray-100 animate-in slide-in-from-right duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2 font-sans tracking-tight">
            <History className="w-6 h-6" /> Recent Solutions
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg border-2 border-transparent hover:border-gray-900 dark:hover:border-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
          >
            <X className="w-5 h-5 dark:text-gray-300" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center mt-10 font-mono text-sm">
            No history yet.
          </p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 border-2 border-gray-900 dark:border-gray-100 rounded-xl cursor-pointer bg-white dark:bg-gray-800 hover:-translate-y-1 hover:neo-shadow transition-all"
                onClick={() => onSelect(item)}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold font-mono px-2 py-1 rounded bg-indigo-100 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-100 border border-indigo-900 dark:border-indigo-100">
                    {item.type === "grade" ? "GRADED WORK" : "SOLUTION"}
                  </span>
                  <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                    {new Date(item.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm font-medium dark:text-gray-200 line-clamp-2 mt-2">
                  {item.solution.replace(/[*#_`]/g, "")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
