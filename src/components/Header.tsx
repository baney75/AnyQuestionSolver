import { BrainCircuit, History, Moon, Sun } from "lucide-react";

interface HeaderProps {
  darkMode: boolean;
  onToggleDark: () => void;
  onOpenHistory: () => void;
}

export function Header({ darkMode, onToggleDark, onOpenHistory }: HeaderProps) {
  return (
    <header className="flex items-center justify-between mb-8 md:mb-12 no-print">
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 text-white p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm">
          <BrainCircuit className="w-6 h-6" />
        </div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white font-sans">
          AnyQuestionSolver
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenHistory}
          className="p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:-translate-y-0.5 hover:neo-shadow-sm transition-all"
          title="History"
        >
          <History className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleDark}
          className="p-2 rounded-xl border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:-translate-y-0.5 hover:neo-shadow-sm transition-all"
          title="Toggle Dark Mode"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
}
