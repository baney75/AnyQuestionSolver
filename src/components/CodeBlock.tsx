import { useState } from "react";
import { Play, Copy, Check, Loader2 } from "lucide-react";
import { runPython } from "../services/pyodide";

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const isPython = /^python/i.test(language);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRun = async () => {
    setIsRunning(true);
    setOutput(null);
    try {
      const result = await runPython(code);
      setOutput(result);
    } catch (e) {
      setOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="my-4 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100">
        <span className="text-xs font-bold font-mono uppercase text-gray-600 dark:text-gray-400">
          {language || "code"}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md border border-gray-400 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {isPython && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition-colors"
            >
              {isRunning ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {isRunning ? "Running..." : "Run"}
            </button>
          )}
        </div>
      </div>

      {/* Code */}
      <pre className="p-4 bg-gray-50 dark:bg-gray-900 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono text-gray-900 dark:text-gray-100">{code}</code>
      </pre>

      {/* Output */}
      {output !== null && (
        <div className="border-t-2 border-gray-900 dark:border-gray-100">
          <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-800">
            <span className="text-xs font-bold font-mono uppercase text-emerald-700 dark:text-emerald-400">
              Output
            </span>
          </div>
          <pre className="p-4 bg-white dark:bg-gray-950 overflow-x-auto text-sm leading-relaxed">
            <code className="font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
              {output}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}
