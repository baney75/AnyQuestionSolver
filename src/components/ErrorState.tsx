import { RefreshCw, X } from "lucide-react";

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  onClear: () => void;
}

export function ErrorState({ message, onRetry, onClear }: ErrorStateProps) {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-900 dark:border-red-100 rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500 no-print neo-shadow">
      <p className="text-red-900 dark:text-red-100 font-bold mb-6 text-lg">{message}</p>
      <div className="flex justify-center gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 px-6 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-2 border-gray-900 dark:border-gray-100 hover:bg-gray-800 dark:hover:bg-gray-200 px-6 py-2 rounded-lg font-bold transition-all neo-shadow-sm active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <X className="w-4 h-4" />
          Start Over
        </button>
      </div>
    </div>
  );
}
