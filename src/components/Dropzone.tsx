import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, UploadCloud } from 'lucide-react';
import { shouldSubmitTextShortcut } from '../utils/input';
import { transcribeAudio } from '../services/gemini';

interface DropzoneProps {
  onImageSelected: (file: File) => void;
  onTextPasted: (text: string) => void;
  onQuickSubmit?: (text: string) => void;
  onError: (msg: string) => void;
  onVoiceInput?: (text: string) => void;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT')
  );
}

export function Dropzone({
  onImageSelected,
  onTextPasted,
  onQuickSubmit,
  onError,
  onVoiceInput,
}: DropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [textInput, setTextInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const liveTranscriptRef = useRef("");
  const deliveredTranscriptRef = useRef(false);

  const cleanupMediaStream = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const editableTarget = isEditableTarget(e.target);
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
      if (editableTarget) {
        return;
      }

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
    e.target.value = '';
  };

  const handleTextSubmit = (submitFast = true) => {
    const text = textInput.trim();
    if (text) {
      if (submitFast && onQuickSubmit) {
        onQuickSubmit(text);
        return;
      }

      onTextPasted(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSubmitTextShortcut({
      isComposing: e.nativeEvent.isComposing,
      key: e.key,
      shiftKey: e.shiftKey,
    })) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const startRecordingFallback = useCallback(async () => {
    if (isTranscribing || isListening) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError("Voice input is not supported in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Microphone access is blocked. Allow microphone permission in your browser and try again.");
      return;
    }

    const preferredMimeTypes = [
      'audio/ogg;codecs=opus',
      'audio/webm;codecs=opus',
      'audio/ogg',
      'audio/webm',
    ];
    const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';

    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        clearRecordingTimeout();
        cleanupMediaStream();
        mediaRecorderRef.current = null;
        setIsListening(false);
        setIsTranscribing(false);
        setVoiceStatus("");
        onError("Voice recording failed. Try again or check microphone permissions.");
      };

      recorder.onstop = async () => {
        clearRecordingTimeout();
        const chunks = [...recordedChunksRef.current];
        recordedChunksRef.current = [];
        const outputMimeType = recorder.mimeType || mimeType || 'audio/webm';

        cleanupMediaStream();
        mediaRecorderRef.current = null;
        setIsListening(false);

        if (!chunks.length) {
          setIsTranscribing(false);
          setVoiceStatus("");
          onError("No speech was captured. Try again and speak a little closer to the microphone.");
          return;
        }

        setIsTranscribing(true);
        setVoiceStatus("Transcribing...");
        try {
          const transcript = await transcribeAudio(new Blob(chunks, { type: outputMimeType }));
          if (!transcript) {
            throw new Error("Empty transcript");
          }

          setIsTranscribing(false);
          setVoiceStatus("");
          onVoiceInput?.(transcript);
        } catch {
          setIsTranscribing(false);
          setVoiceStatus("");
          onError("Voice transcription failed. Try a shorter recording and speak clearly.");
        }
      };

      recorder.start(250);
      setIsListening(true);
      setVoiceStatus("Recording... tap the mic again to finish.");
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      }, 45000);
    } catch {
      cleanupMediaStream();
      onError("Voice recording could not start in this browser.");
    }
  }, [cleanupMediaStream, clearRecordingTimeout, isListening, isTranscribing, onError, onVoiceInput]);

  const startListening = useCallback(async () => {
    if (isListening || isTranscribing) {
      return;
    }

    setVoiceStatus("Starting mic...");
    liveTranscriptRef.current = "";
    deliveredTranscriptRef.current = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      await startRecordingFallback();
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch {
        setVoiceStatus("");
        onError("Microphone access is blocked. Allow microphone permission in your browser and try again.");
        return;
      }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus("Listening...");
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index]?.[0]?.transcript ?? "",
      )
        .join(" ")
        .trim();

      if (transcript) {
        liveTranscriptRef.current = transcript;
        setVoiceStatus(transcript);
      }

      const latestResult = event.results[event.resultIndex];
      if (latestResult?.isFinal && transcript) {
        deliveredTranscriptRef.current = true;
        setVoiceStatus("");
        setIsListening(false);
        recognition.stop();
        onVoiceInput?.(transcript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceStatus("");

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        onError("Microphone access is blocked. Allow microphone permission in your browser and try again.");
        return;
      }
      if (event.error === "audio-capture") {
        onError("No microphone was detected. Connect a microphone and try again.");
        return;
      }
      if (event.error === "no-speech") {
        onError("No speech was detected. Try again and speak a little closer to the microphone.");
        return;
      }
      if (event.error === "network" || event.error === "aborted") {
        void startRecordingFallback();
        return;
      }

      onError("Live voice recognition failed in this browser. Try again or use the fallback recording flow.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);

      if (!deliveredTranscriptRef.current && liveTranscriptRef.current.trim()) {
        const transcript = liveTranscriptRef.current.trim();
        liveTranscriptRef.current = "";
        setVoiceStatus("");
        onVoiceInput?.(transcript);
        return;
      }

      liveTranscriptRef.current = "";
      setVoiceStatus("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, isTranscribing, onError, onVoiceInput, startRecordingFallback]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setVoiceStatus(liveTranscriptRef.current ? "Using what I heard..." : "Stopping...");
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setVoiceStatus("Transcribing...");
      return;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRecordingTimeout();
      recognitionRef.current?.abort();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      cleanupMediaStream();
    };
  }, [cleanupMediaStream, clearRecordingTimeout]);

  const triggerFilePicker = () => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }

    input.value = "";
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  };

  return (
    <div className="space-y-5">
      <input
        id="file-input"
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="hidden md:block">
        <div className="relative">
          {onVoiceInput && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void (isListening ? stopListening() : startListening());
              }}
              aria-label={isListening ? 'Stop voice recording' : isTranscribing ? 'Transcribing voice input' : 'Start voice recording'}
              title={isListening ? 'Stop voice recording' : isTranscribing ? 'Transcribing voice input' : 'Start voice recording'}
              disabled={isTranscribing}
              className={`absolute right-6 top-6 z-30 inline-flex h-16 w-16 items-center justify-center rounded-full border-2 neo-shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${
                isListening
                  ? 'border-[var(--aqs-accent-strong)] bg-[var(--aqs-accent)] text-white'
                  : 'border-gray-900 bg-[var(--aqs-accent-soft)] text-[var(--aqs-accent)] dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.2)] dark:text-[var(--aqs-accent-dark)]'
              }`}
            >
              {isListening ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
          )}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative block w-full overflow-hidden rounded-[2.2rem] border-2 px-8 py-14 text-center transition-all duration-200 neo-shadow focus-within:outline-none focus-within:ring-4 focus-within:ring-[color:rgba(122,31,52,0.18)] ${
              isDragging
                ? 'border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] translate-x-[2px] translate-y-[2px] shadow-none dark:bg-[color:rgba(122,31,52,0.2)]'
                : 'border-gray-900 bg-white hover:-translate-y-1 dark:border-gray-100 dark:bg-gray-900'
            }`}
          >
            <button
              type="button"
              aria-label="Upload image"
              onClick={triggerFilePicker}
              className="absolute inset-y-0 left-0 right-28 z-10 cursor-pointer rounded-[2.2rem] border-0 bg-transparent p-0"
            />

            <div className="pointer-events-none relative z-0">
              <div className="mx-auto mb-7 flex h-28 w-28 items-center justify-center rounded-[2rem] border-2 border-gray-900 bg-[var(--aqs-accent-soft)] text-[var(--aqs-accent)] neo-shadow-sm dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.2)] dark:text-[var(--aqs-accent-dark)]">
                <UploadCloud className="h-10 w-10" />
              </div>

              <h2 className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
                Start typing anywhere, paste an image, or click to upload.
              </h2>

              <div className="mx-auto mt-8 inline-flex max-w-3xl flex-wrap items-center justify-center gap-3 rounded-full border-2 border-gray-900 bg-white px-5 py-3 font-mono text-sm text-gray-600 neo-shadow-sm dark:border-gray-100 dark:bg-gray-950 dark:text-gray-300">
                <span className="rounded-xl bg-[var(--aqs-accent-soft)] px-3 py-1 font-bold text-[var(--aqs-accent-strong)] dark:bg-[color:rgba(122,31,52,0.22)] dark:text-[var(--aqs-accent-dark)]">
                  Cmd+V
                </span>
                <span>Type to open the question box, or paste a screenshot with Cmd+V.</span>
              </div>
              {voiceStatus && (
                <div className="mx-auto mt-4 max-w-2xl font-mono text-sm text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                  {voiceStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border-2 border-gray-900 bg-white p-5 neo-shadow dark:border-gray-100 dark:bg-gray-900 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
              Type, paste, or upload fast.
            </h2>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              Press Enter to ask fast. Shift+Enter for a new line.
            </p>
          </div>
          {onVoiceInput && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void (isListening ? stopListening() : startListening());
              }}
              aria-label={isListening ? 'Stop voice recording' : isTranscribing ? 'Transcribing voice input' : 'Start voice recording'}
              title={isListening ? 'Stop voice recording' : isTranscribing ? 'Transcribing voice input' : 'Start voice recording'}
              disabled={isTranscribing}
              className={`relative z-20 inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 neo-shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70 ${
                isListening
                  ? 'border-[var(--aqs-accent-strong)] bg-[var(--aqs-accent)] text-white'
                  : 'border-gray-900 bg-[var(--aqs-accent-soft)] text-[var(--aqs-accent)] dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.2)] dark:text-[var(--aqs-accent-dark)]'
              }`}
            >
              {isListening ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative mt-4 block w-full rounded-[1.6rem] border-2 p-5 transition-all duration-200 focus-within:outline-none focus-within:ring-4 focus-within:ring-[color:rgba(122,31,52,0.18)] ${
            isDragging
              ? 'border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] dark:bg-[color:rgba(122,31,52,0.2)]'
              : 'border-gray-900 bg-gray-50 dark:border-gray-100 dark:bg-gray-950'
          }`}
        >
          <button
            type="button"
            aria-label="Upload image"
            onClick={triggerFilePicker}
            className="absolute inset-y-0 left-0 right-20 z-10 cursor-pointer rounded-[1.6rem] border-0 bg-transparent p-0"
          />
          <div className="pointer-events-none relative z-0 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border-2 border-gray-900 bg-[var(--aqs-accent-soft)] text-[var(--aqs-accent)] neo-shadow-sm dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.2)] dark:text-[var(--aqs-accent-dark)]">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <div className="font-bold text-gray-900 dark:text-gray-100">Tap to upload a screenshot</div>
              <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">Cmd+V also works</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border-2 border-gray-900 bg-white p-1 dark:border-gray-100 dark:bg-gray-950">
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type or paste your question here."
            className="min-h-[160px] w-full resize-none rounded-[1.1rem] bg-transparent px-4 py-4 font-mono text-base text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => handleTextSubmit()}
            disabled={!textInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-[var(--aqs-accent)] bg-[var(--aqs-accent)] px-5 py-3 font-bold text-white neo-shadow-sm transition hover:bg-[var(--aqs-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ask Fast
          </button>
          <button
            type="button"
            onClick={() => handleTextSubmit(false)}
            disabled={!textInput.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-gray-900 bg-white px-5 py-3 font-bold text-gray-900 neo-shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
          >
            Review Options
          </button>
        </div>
        {voiceStatus && (
          <div className="mt-3 font-mono text-sm text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
            {voiceStatus}
          </div>
        )}
      </div>
    </div>
  );
}
