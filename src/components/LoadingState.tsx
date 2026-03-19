import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-in fade-in duration-500 no-print">
      <Loader2 className="mb-4 h-12 w-12 animate-spin text-[var(--aqs-accent)] dark:text-[var(--aqs-accent-dark)]" />
      <p className="text-gray-900 dark:text-gray-100 font-bold font-sans text-xl">
        Analyzing your question...
      </p>
      <p className="text-sm font-mono text-gray-600 dark:text-gray-400 mt-2">
        This usually takes a few seconds.
      </p>
    </div>
  );
}
