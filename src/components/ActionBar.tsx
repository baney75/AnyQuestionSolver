import { useState } from "react";
import {
  Check,
  Copy,
  Printer,
  RefreshCw,
  X,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import type { SolveMode } from "../types";

const COPY_FEEDBACK_MS = 2000;

const BTN =
  "w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

interface ActionBarProps {
  solution: string;
  lastMode: SolveMode;
  visualUrl: string | null;
  isVisualLoading: boolean;
  onSolveAgain: (mode: SolveMode, detailed: boolean) => void;
  onGenerateVisual: () => void;
  onClear: () => void;
}

export function ActionBar({
  solution,
  lastMode,
  visualUrl,
  isVisualLoading,
  onSolveAgain,
  onGenerateVisual,
  onClear,
}: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(solution);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow no-print">
      {/* Left group */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full sm:w-auto">
        <button onClick={handleCopy} className={BTN}>
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copied ? "Copied!" : "Copy Markdown"}
        </button>

        <button onClick={() => window.print()} className={BTN}>
          <Printer className="w-4 h-4" />
          Print / PDF
        </button>

        <button
          onClick={onGenerateVisual}
          disabled={isVisualLoading || !!visualUrl}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-900 dark:text-indigo-100 border-2 border-indigo-900 dark:border-indigo-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isVisualLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImageIcon className="w-4 h-4" />
          )}
          Explain Visually
        </button>
      </div>

      {/* Right group */}
      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
        <button onClick={() => onSolveAgain(lastMode, true)} className={BTN}>
          <RefreshCw className="w-4 h-4" />
          More Detail
        </button>
        <button
          onClick={onClear}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <X className="w-4 h-4" />
          New Question
        </button>
      </div>
    </div>
  );
}
