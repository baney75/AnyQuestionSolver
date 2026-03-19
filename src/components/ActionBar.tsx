import { useState } from "react";
import {
  Check,
  Copy,
  PencilLine,
  Printer,
  RefreshCw,
  RotateCcw,
  X,
} from "lucide-react";
import type { SolveMode } from "../types";
import { getCopyableSolution } from "../utils/solution";

const COPY_FEEDBACK_MS = 2000;

const BTN =
  "w-full sm:w-auto flex items-center justify-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 px-4 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:bg-gray-200 disabled:text-gray-500 disabled:hover:bg-gray-200 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-[inherit] dark:disabled:bg-gray-700 dark:disabled:text-gray-400 dark:disabled:hover:bg-gray-700";

interface ActionBarProps {
  solution: string;
  lastMode: SolveMode;
  canRetryEdit: boolean;
  onSolveAgain: (mode: SolveMode, detailed: boolean) => void;
  onRetry: () => void;
  onEditRequest: () => void;
  onClear: () => void;
}

export function ActionBar({
  solution,
  lastMode,
  canRetryEdit,
  onSolveAgain,
  onRetry,
  onEditRequest,
  onClear,
}: ActionBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(getCopyableSolution(solution));
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-4 bg-white dark:bg-gray-900 p-4 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow no-print">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 w-full sm:w-auto">
        <button type="button" onClick={handleCopy} className={BTN}>
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
          {copied ? "Copied!" : "Copy Markdown"}
        </button>

        <button type="button" onClick={() => window.print()} className={BTN}>
          <Printer className="w-4 h-4" />
          Print / PDF
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto mt-4 sm:mt-0">
        <button type="button" onClick={onRetry} disabled={!canRetryEdit} className={BTN}>
          <RotateCcw className="w-4 h-4" />
          Retry
        </button>
        <button type="button" onClick={onEditRequest} disabled={!canRetryEdit} className={BTN}>
          <PencilLine className="w-4 h-4" />
          Edit Request
        </button>
        <button type="button" onClick={() => onSolveAgain(lastMode, true)} className={BTN}>
          <RefreshCw className="w-4 h-4" />
          Explain More
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-2 font-bold text-white transition-all neo-shadow-sm hover:bg-[var(--aqs-accent-strong)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none dark:border-gray-100 sm:w-auto"
        >
          <X className="w-4 h-4" />
          New Question
        </button>
      </div>
    </div>
  );
}
