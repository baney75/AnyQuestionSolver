import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, Mic, Square, Type, ImageIcon } from 'lucide-react';

interface DropzoneProps {
  onImageSelected: (file: File) => void;
  onTextPasted: (text: string) => void;
  onError: (msg: string) => void;
  onVoiceInput?: (text: string) => void;
}

export function Dropzone({ onImageSelected, onTextPasted, onError, onVoiceInput }: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'image'>('text');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    let foundImage = false;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          onImageSelected(file);
          foundImage = true;
          break;
        }
      }
    }

    if (!foundImage) {
      const textData = e.clipboardData?.getData('text');
      if (textData) {
        setTextInput(textData);
        onTextPasted(textData);
      } else {
        onError("No image found. Try Cmd+Shift+4 (Mac) or Win+Shift+S (Windows) to screenshot.");
      }
    }
  }, [onImageSelected, onTextPasted, onError]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        onImageSelected(file);
      } else {
        onError("Only image files are supported. Try taking a screenshot of the page.");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onImageSelected(files[0]);
    }
  };

  const handleTextSubmit = () => {
    const text = textInput.trim();
    if (text) {
      onTextPasted(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("Speech recognition is not supported in your browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript && onVoiceInput) {
        onVoiceInput(transcript);
      }
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      onError("Could not understand audio. Please try again.");
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [onError, onVoiceInput]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setInputMode('text')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-medium transition-all min-h-[44px] ${
            inputMode === 'text'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <Type className="w-4 h-4" />
          <span className="hidden sm:inline">Type Question</span>
          <span className="sm:hidden">Type</span>
        </button>
        <button
          type="button"
          onClick={() => setInputMode('image')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 font-medium transition-all min-h-[44px] ${
            inputMode === 'image'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Upload Image</span>
          <span className="sm:hidden">Upload</span>
        </button>
      </div>

      {/* Text Input Mode */}
      {inputMode === 'text' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow overflow-hidden">
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you need help with? Type your question here..."
              className="w-full min-h-[120px] max-h-[300px] p-4 bg-transparent text-gray-900 dark:text-gray-100 font-mono text-base resize-y focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={handleTextSubmit}
              disabled={!textInput.trim()}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white border-2 border-indigo-600 hover:bg-indigo-700 transition-all neo-shadow disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              Submit Question
            </button>
            {onVoiceInput && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all border-2 min-h-[44px] ${
                  isListening
                    ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {isListening ? (
                  <>
                    <Square className="w-4 h-4" />
                    <span className="hidden sm:inline">Stop Listening</span>
                    <span className="sm:hidden">Stop</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span className="hidden sm:inline">Voice Input</span>
                    <span className="sm:hidden">Voice</span>
                  </>
                )}
              </button>
            )}
          </div>
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 font-mono">
            Press <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600">Cmd+Enter</kbd> to submit
          </p>
        </div>
      )}

      {/* Image Upload Mode */}
      {inputMode === 'image' && (
        <>
          <label
            htmlFor="file-input"
            className={`block border-2 rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 min-h-[200px] sm:min-h-[300px] neo-shadow ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 translate-x-[2px] translate-y-[2px] shadow-none'
                : 'border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-900 hover:-translate-y-1 hover:shadow-[6px_6px_0px_0px_rgba(17,24,39,1)] dark:hover:shadow-[6px_6px_0px_0px_rgba(243,244,246,1)]'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              id="file-input"
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <div className="bg-indigo-100 dark:bg-indigo-900/50 p-4 rounded-xl border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm mb-4 inline-block">
              <UploadCloud className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h3 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 font-sans tracking-tight">
              Paste, drop, or click
            </h3>
            <p className="text-gray-600 dark:text-gray-400 font-mono text-sm">
              to upload a question image
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-lg border-2 border-gray-900 dark:border-gray-100 neo-shadow-sm">
              <span className="font-mono font-bold bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-900 dark:text-gray-100">Cmd+V</span>
              <span className="font-mono">works anywhere on page</span>
            </div>
          </label>

          {onVoiceInput && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all border-2 min-h-[44px] ${
                  isListening
                    ? 'bg-red-500 text-white border-red-500 hover:bg-red-600'
                    : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-900 dark:border-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                {isListening ? (
                  <>
                    <Square className="w-4 h-4" />
                    <span>Stop Listening</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Voice Input</span>
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}