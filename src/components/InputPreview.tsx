import React, { useEffect, useRef } from "react";
import { BrainCircuit, X, Zap } from "lucide-react";
import type { SolveMode } from "../types";
import { shouldSubmitTextShortcut } from "../utils/input";

interface InputPreviewProps {
  imagePreviewUrl: string | null;
  textInput: string | null;
  onTextChange: (text: string) => void;
  onSolve: (mode: SolveMode) => void;
  onClear: () => void;
}

const BTN_BASE =
  "w-full sm:w-auto flex items-center justify-center gap-2 border-2 border-gray-900 dark:border-gray-100 px-6 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none min-h-[44px]";

export function InputPreview({
  imagePreviewUrl,
  textInput,
  onTextChange,
  onSolve,
  onClear,
}: InputPreviewProps) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!textInput || imagePreviewUrl) {
      return;
    }

    const timer = window.setTimeout(() => {
      textAreaRef.current?.focus();
      const value = textAreaRef.current?.value ?? "";
      textAreaRef.current?.setSelectionRange(value.length, value.length);
    }, 320);

    return () => window.clearTimeout(timer);
  }, [imagePreviewUrl, textInput]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
      {/* Header */}
      <div className="p-4 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100 flex justify-between items-center">
        <h2 className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100 uppercase tracking-wider">
          Input Preview
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors p-2 rounded-lg border-2 border-transparent hover:border-gray-900 dark:hover:border-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="Clear input"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 flex flex-col items-center">
        {/* Image or text preview */}
        {imagePreviewUrl && (
          <div className="w-full space-y-5">
            <div className="rounded-[1.75rem] border-2 border-gray-900 bg-gray-50 p-4 dark:border-gray-100 dark:bg-gray-950">
              <img
                src={imagePreviewUrl}
                alt="Question preview"
                className="max-h-[420px] w-full object-contain rounded-2xl"
              />
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              The tutor will inspect the image first. If your work is already shown, it will say what is correct
              before fixing the first real issue.
            </p>
          </div>
        )}
        {textInput !== null && !imagePreviewUrl && (
          <div className="w-full space-y-4">
            <div className="rounded-[1.75rem] border-2 border-gray-900 bg-white p-1 dark:border-gray-100 dark:bg-gray-950">
              <textarea
                ref={textAreaRef}
                value={textInput}
                onChange={(event) => onTextChange(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    shouldSubmitTextShortcut({
                      isComposing: event.nativeEvent.isComposing,
                      key: event.key,
                      shiftKey: event.shiftKey,
                    })
                  ) {
                    event.preventDefault();
                    onSolve("fast");
                  }
                }}
                placeholder="Type or paste your question here."
                className="min-h-[220px] w-full resize-y rounded-[1.35rem] bg-transparent px-5 py-5 font-mono text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        )}

        {/* Solve buttons */}
        <div className="mt-8 flex w-full flex-col items-center gap-5">
          <div className="flex w-full flex-col justify-center gap-4 sm:flex-row sm:flex-wrap">
            <button type="button" onClick={() => onSolve("fast")} className={`${BTN_BASE} bg-[var(--aqs-accent)] text-white hover:bg-[var(--aqs-accent-strong)]`}>
              <Zap className="w-5 h-5 text-[var(--aqs-gold)]" />
              Ask Fast
            </button>
            <button type="button" onClick={() => onSolve("deep")} className={`${BTN_BASE} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700`}>
              <BrainCircuit className="w-5 h-5" />
              Deep Walkthrough
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
