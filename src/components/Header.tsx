import { BrainCircuit, History, Moon, Sun } from "lucide-react";

interface HeaderProps {
  darkMode: boolean;
  onToggleDark: () => void;
  onOpenHistory: () => void;
}

export function Header({ darkMode, onToggleDark, onOpenHistory }: HeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-5 no-print sm:mb-10 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] p-2 text-white neo-shadow-sm dark:border-gray-100 dark:bg-[var(--aqs-accent-strong)]">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white font-sans sm:text-3xl md:text-4xl">
            AnyQuestionSolver
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Paste a problem, press Enter, and get unstuck fast.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          onClick={onOpenHistory}
          aria-label="Open history"
          className="rounded-xl border-2 border-gray-900 bg-white p-2 text-gray-900 transition-all hover:-translate-y-0.5 hover:border-[var(--aqs-accent)] hover:bg-[var(--aqs-accent-soft)] hover:neo-shadow-sm dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-[var(--aqs-accent-dark)] dark:hover:bg-[color:rgba(122,31,52,0.18)]"
          title="History"
        >
          <History className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onToggleDark}
          aria-label={darkMode ? "Enable light mode" : "Enable dark mode"}
          className="rounded-xl border-2 border-gray-900 bg-white p-2 text-gray-900 transition-all hover:-translate-y-0.5 hover:border-[var(--aqs-accent)] hover:bg-[var(--aqs-accent-soft)] hover:neo-shadow-sm dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-[var(--aqs-accent-dark)] dark:hover:bg-[color:rgba(122,31,52,0.18)]"
          title="Toggle Dark Mode"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
