import React from "react";
import { X, BrainCircuit, Zap, Search, PenTool, Image as ImageIcon } from "lucide-react";
import type { SolveMode } from "../types";

interface InputPreviewProps {
  imagePreviewUrl: string | null;
  textInput: string | null;
  imageFile: File | null;
  onSolve: (mode: SolveMode) => void;
  onGrade: () => void;
  onClear: () => void;
  /** Controls for the optional handwriting sample used during grading. */
  inkColor: string;
  onInkColorChange: (color: string) => void;
  handwritingFile: File | null;
  handwritingPreviewUrl: string | null;
  onHandwritingSelected: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const BTN_BASE =
  "w-full sm:w-auto flex items-center justify-center gap-2 border-2 border-gray-900 dark:border-gray-100 px-6 py-3 rounded-xl font-bold transition-all neo-shadow hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

export function InputPreview({
  imagePreviewUrl,
  textInput,
  imageFile,
  onSolve,
  onGrade,
  onClear,
  inkColor,
  onInkColorChange,
  handwritingFile,
  handwritingPreviewUrl,
  onHandwritingSelected,
}: InputPreviewProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 no-print">
      {/* Header */}
      <div className="p-4 bg-gray-100 dark:bg-gray-800 border-b-2 border-gray-900 dark:border-gray-100 flex justify-between items-center">
        <h2 className="text-sm font-bold font-mono text-gray-900 dark:text-gray-100 uppercase tracking-wider">
          Input Preview
        </h2>
        <button
          onClick={onClear}
          className="text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors p-1 rounded-lg border-2 border-transparent hover:border-gray-900 dark:hover:border-gray-100"
          title="Clear input"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-6 flex flex-col items-center">
        {/* Image or text preview */}
        {imagePreviewUrl && (
          <img
            src={imagePreviewUrl}
            alt="Question preview"
            className="max-h-[300px] object-contain rounded-lg border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm"
          />
        )}
        {textInput && !imagePreviewUrl && (
          <div className="w-full bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border-2 border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono text-sm max-h-[300px] overflow-y-auto neo-shadow-sm">
            {textInput}
          </div>
        )}

        {/* Solve buttons */}
        <div className="mt-8 flex flex-col items-center gap-8 w-full">
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 w-full">
            <button onClick={() => onSolve("deep")} className={`${BTN_BASE} bg-indigo-600 text-white`}>
              <BrainCircuit className="w-5 h-5" />
              Deep Solve (Pro)
            </button>
            <button onClick={() => onSolve("fast")} className={`${BTN_BASE} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}>
              <Zap className="w-5 h-5 text-amber-500" />
              Fast Solve
            </button>
            <button onClick={() => onSolve("research")} className={`${BTN_BASE} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100`}>
              <Search className="w-5 h-5 text-blue-500" />
              Research
            </button>
          </div>

          {/* Grade-my-work section (only available for image input) */}
          {imageFile && (
            <div className="flex flex-col items-center gap-4 pt-8 border-t-2 border-gray-200 dark:border-gray-800 w-full max-w-2xl">
              <h3 className="font-bold font-sans text-xl text-gray-900 dark:text-gray-100">
                Check My Work
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-md">
                Upload an optional handwriting sample so the AI can mimic your style when grading.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-center gap-4 w-full">
                {/* Ink colour picker */}
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                  <label className="text-xs font-bold font-mono text-gray-900 dark:text-gray-100 uppercase">
                    Ink Color
                  </label>
                  <select
                    value={inkColor}
                    onChange={(e) => onInkColorChange(e.target.value)}
                    className="w-full bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg px-3 py-2 text-sm font-medium dark:text-white focus:outline-none neo-shadow-sm"
                  >
                    <option value="red">Red</option>
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                    <option value="purple">Purple</option>
                  </select>
                </div>

                {/* Handwriting sample uploader */}
                <div className="flex flex-col gap-2 w-full sm:flex-1 sm:min-w-[200px]">
                  <label className="text-xs font-bold font-mono text-gray-900 dark:text-gray-100 uppercase">
                    Handwriting Sample (Optional)
                  </label>
                  <div className="flex items-center gap-2 w-full">
                    <label className="flex-1 bg-white dark:bg-gray-800 border-2 border-gray-900 dark:border-gray-100 rounded-lg px-3 py-2 text-sm font-medium dark:text-white cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors neo-shadow-sm flex items-center justify-between">
                      <span className="truncate max-w-[150px] sm:max-w-[200px]">
                        {handwritingFile ? handwritingFile.name : "Choose image..."}
                      </span>
                      <ImageIcon className="w-4 h-4 flex-shrink-0" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={onHandwritingSelected}
                        className="hidden"
                      />
                    </label>
                    {handwritingPreviewUrl && (
                      <img
                        src={handwritingPreviewUrl}
                        alt="Handwriting"
                        className="w-10 h-10 rounded border-2 border-gray-900 dark:border-gray-100 object-cover flex-shrink-0"
                      />
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={onGrade}
                className={`mt-2 ${BTN_BASE} bg-emerald-400 dark:bg-emerald-600 text-gray-900 dark:text-white`}
              >
                <PenTool className="w-5 h-5" />
                Grade My Work
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
