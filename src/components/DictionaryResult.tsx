import { BookOpen, Volume2 } from "lucide-react";
import type { DictionaryEntry } from "../services/dictionary";

interface DictionaryResultProps {
  entries: DictionaryEntry[];
}

export function DictionaryResult({ entries }: DictionaryResultProps) {
  const playAudio = (url: string) => {
    new Audio(url).play().catch(() => {});
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="p-4 bg-amber-50 dark:bg-amber-900/30 border-b-2 border-gray-900 dark:border-gray-100 flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-amber-700 dark:text-amber-400" />
        <h3 className="font-bold font-sans text-lg text-gray-900 dark:text-gray-100">
          Dictionary
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {entries.map((entry, i) => (
          <div key={`entry-${entry.word}-${i}`}>
            {/* Word + phonetic */}
            <div className="flex items-baseline gap-3 mb-4">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {entry.word}
              </h2>
              {entry.phonetic && (
                <span className="text-lg font-mono text-gray-500 dark:text-gray-400">
                  {entry.phonetic}
                </span>
              )}
              {entry.phonetics?.map(
                (p, j) =>
                  p.audio && (
                    <button
                      key={`audio-${p.audio}`}
                      type="button"
                      onClick={() => playAudio(p.audio!)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                      title="Play pronunciation"
                    >
                      <Volume2 className="w-5 h-5 text-[var(--aqs-accent)] dark:text-[var(--aqs-accent-dark)]" />
                    </button>
                  ),
              )}
            </div>

            {/* Meanings */}
            {entry.meanings.map((meaning) => (
              <div key={`${meaning.partOfSpeech}-${entry.word}`} className="mb-4">
                <span className="mb-2 inline-block rounded border border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] px-2 py-1 text-xs font-bold font-mono uppercase text-[var(--aqs-accent-strong)] dark:border-[var(--aqs-accent-dark)] dark:bg-[color:rgba(122,31,52,0.2)] dark:text-[var(--aqs-accent-dark)]">
                  {meaning.partOfSpeech}
                </span>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  {meaning.definitions.slice(0, 4).map((def, k) => (
                    <li key={`${meaning.partOfSpeech}-${entry.word}-def-${k}`} className="text-gray-900 dark:text-gray-100">
                      <span className="font-medium">{def.definition}</span>
                      {def.example && (
                        <p className="ml-6 mt-1 text-sm italic text-gray-600 dark:text-gray-400">
                          &ldquo;{def.example}&rdquo;
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        ))}

        {/* Source */}
        {entries[0]?.sourceUrls?.[0] && (
          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            Source:{" "}
            <a href={entries[0].sourceUrls[0]} target="_blank" rel="noopener noreferrer" className="underline">
              {entries[0].sourceUrls[0]}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
