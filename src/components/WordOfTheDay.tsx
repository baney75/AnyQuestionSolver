import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Volume2,
} from "lucide-react";

import { chatWithTutor } from "../services/gemini";
import { getWordOfTheDay, type WordOfTheDay as WotdType } from "../services/wotd";
import { RichResponse } from "./RichResponse";

interface WordOfTheDayProps {
  onClose?: () => void;
  onReturn?: () => void;
}

export function WordOfTheDay({ onClose, onReturn }: WordOfTheDayProps) {
  const [wotd, setWotd] = useState<WotdType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAskPanel, setShowAskPanel] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "tutor"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadWotd = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    if (forceRefresh) {
      setRefreshing(true);
    }

    try {
      const nextWord = await getWordOfTheDay(forceRefresh);
      setWotd(nextWord);
      setChatMessages([]);
      setShowAskPanel(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load word of the day.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadWotd();
  }, [loadWotd]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      window.speechSynthesis?.cancel();
    };
  }, []);

  const formattedDate = wotd
    ? new Date(wotd.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const handleAsk = useCallback(async () => {
    if (!wotd || !chatInput.trim() || isChatLoading) {
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setIsChatLoading(true);

    try {
      const prompt = `You are helping the user learn today's Merriam-Webster word of the day.

Word: ${wotd.word}
Pronunciation: ${wotd.phonetic || "N/A"}
Part of speech: ${wotd.partOfSpeech || "N/A"}
Definition: ${wotd.definition}
${wotd.example ? `Example: ${wotd.example}` : ""}
Source: ${wotd.sourceUrl}

Answer the user's question directly. Stay focused on understanding, usage, nuance, or etymology.`;

      const reply = await chatWithTutor([], `${prompt}\n\nUser question: ${userMessage}`);
      setChatMessages((prev) => [...prev, { role: "tutor", text: reply }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "tutor", text: "I couldn't answer that right now. Please try again." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, isChatLoading, wotd]);

  const speakWord = useCallback((word: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, []);

  const playAudio = useCallback(async () => {
    if (!wotd) {
      return;
    }

    window.speechSynthesis?.cancel();

    if (!wotd.audioUrl) {
      speakWord(wotd.word);
      return;
    }

    try {
      const nextAudio = audioRef.current?.src === wotd.audioUrl
        ? audioRef.current
        : new Audio(wotd.audioUrl);

      nextAudio.preload = "auto";
      nextAudio.currentTime = 0;
      audioRef.current = nextAudio;
      await nextAudio.play();
    } catch {
      speakWord(wotd.word);
    }
  }, [speakWord, wotd]);

  if (loading) {
    return (
      <div className="rounded-[2rem] border-2 border-gray-900 bg-white neo-shadow dark:border-gray-100 dark:bg-gray-900">
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-8">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--aqs-accent)]" />
          <p className="text-gray-600 dark:text-gray-300">Loading word of the day…</p>
        </div>
      </div>
    );
  }

  if (error || !wotd) {
    return (
      <div className="rounded-[2rem] border-2 border-gray-900 bg-white neo-shadow dark:border-gray-100 dark:bg-gray-900">
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 p-8">
          <p className="text-center text-gray-700 dark:text-gray-300">{error || "Failed to load word of the day."}</p>
          <button
            type="button"
            onClick={() => void loadWotd(true)}
            className="rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-2 font-bold text-white dark:border-gray-100"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {onReturn ? (
        <div className="flex items-center justify-between gap-4 rounded-[1.4rem] border-2 border-amber-300 bg-amber-100 px-4 py-3 dark:border-amber-700 dark:bg-amber-900/20">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-amber-600 border-t-transparent animate-spin dark:border-amber-400" />
            <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Your earlier question is still running in the background.
            </span>
          </div>
          <button
            type="button"
            onClick={onReturn}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700"
          >
            View Answer
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border-2 border-gray-900 bg-white neo-shadow dark:border-gray-100 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-gray-900 bg-[var(--aqs-accent-soft)] px-5 py-4 dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.14)]">
          <div className="flex items-center gap-3">
            {onReturn ? (
              <button
                type="button"
                onClick={onReturn}
                className="rounded-xl border-2 border-gray-900 bg-white p-2 text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                aria-label="Back to answer"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : null}
            <div className="rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] p-2 text-white dark:border-gray-100">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                Word of the Day
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-300">{formattedDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadWotd(true)}
              disabled={refreshing}
              className="rounded-xl border-2 border-gray-900 bg-white px-3 py-2 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
            >
              <RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border-2 border-gray-900 bg-white px-3 py-2 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
              >
                Close
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-6 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-4xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl">
                {wotd.word}
              </h2>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {wotd.phonetic ? (
                  <span className="font-mono text-lg text-gray-500 dark:text-gray-400">
                    /{wotd.phonetic}/
                  </span>
                ) : null}
                {wotd.partOfSpeech ? (
                  <span className="rounded-full border border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] px-3 py-1 text-xs font-mono font-bold uppercase tracking-[0.2em] text-[var(--aqs-accent-strong)] dark:bg-[color:rgba(122,31,52,0.18)] dark:text-[var(--aqs-accent-dark)]">
                    {wotd.partOfSpeech}
                  </span>
                ) : null}
                {wotd.audioUrl || wotd.word ? (
                  <button
                    type="button"
                    onClick={playAudio}
                    className="inline-flex items-center gap-2 rounded-full border-2 border-gray-900 bg-white px-3 py-2 text-sm font-bold text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                    aria-label={`Listen to the pronunciation of ${wotd.word}`}
                  >
                    <Volume2 className="h-4 w-4" />
                    Listen
                  </button>
                ) : null}
              </div>
            </div>

            <a
              href={wotd.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-4 py-3 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
            >
              Merriam-Webster
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="rounded-[1.6rem] border-2 border-gray-900 bg-white p-5 dark:border-gray-100 dark:bg-gray-950">
            <p className="text-xs font-mono font-bold uppercase tracking-[0.26em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
              Definition
            </p>
            <p className="mt-4 text-xl leading-8 text-gray-900 dark:text-gray-100">
              {wotd.definition}
            </p>
            {wotd.example ? (
              <div className="mt-5 rounded-[1.2rem] border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
                <p className="text-xs font-mono font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                  Example
                </p>
                <p className="mt-2 text-base italic leading-7 text-gray-700 dark:text-gray-300">
                  “{wotd.example}”
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setShowAskPanel((value) => !value)}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 dark:border-gray-100"
            >
              <MessageCircle className="h-4 w-4" />
              {showAskPanel ? "Hide Agent" : "Ask About This Word"}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Keep the card simple. Open the agent only if you want more context or examples.
            </span>
          </div>
        </div>
      </section>

      {showAskPanel ? (
        <section className="overflow-hidden rounded-[2rem] border-2 border-gray-900 bg-white neo-shadow dark:border-gray-100 dark:bg-gray-900">
          <div className="border-b-2 border-gray-900 bg-[var(--aqs-accent-soft)] px-4 py-4 dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.14)]">
            <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
              Ask the Agent
            </p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
              Ask for nuance, etymology, synonyms, or more example sentences.
            </p>
          </div>

          <div className="space-y-4 p-4 md:p-6">
            {chatMessages.length > 0 ? (
              <div className="scroll-panel max-h-[420px] space-y-4 overflow-y-auto pr-2">
                {chatMessages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[88%] rounded-[1.4rem] border-2 px-4 py-3 ${
                        message.role === "user"
                          ? "border-gray-900 bg-[var(--aqs-accent)] text-white dark:border-gray-100"
                          : "border-gray-900 bg-white text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {message.role === "tutor" ? <RichResponse text={message.text} compact /> : <p className="text-sm leading-7">{message.text}</p>}
                    </div>
                  </div>
                ))}
                {isChatLoading ? (
                  <div className="flex justify-start">
                    <div className="rounded-[1.4rem] border-2 border-gray-900 bg-white px-4 py-3 dark:border-gray-100 dark:bg-gray-900">
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Thinking…
                      </div>
                    </div>
                  </div>
                ) : null}
                <div ref={chatEndRef} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {[
                `Use "${wotd.word}" in another sentence.`,
                `What is the nuance of "${wotd.word}"?`,
                `What is the etymology of "${wotd.word}"?`,
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setChatInput(suggestion)}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-[var(--aqs-accent)] hover:text-[var(--aqs-accent-strong)] dark:border-gray-700 dark:text-gray-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleAsk();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={`Ask about "${wotd.word}"…`}
                aria-label={`Ask about the word ${wotd.word}`}
                name="word-chat"
                autoComplete="off"
                disabled={isChatLoading}
                className="flex-1 rounded-[1.2rem] border-2 border-gray-900 bg-white px-4 py-3 text-gray-900 focus:border-[var(--aqs-accent)] focus:outline-none focus:ring-4 focus:ring-[color:rgba(122,31,52,0.18)] disabled:opacity-50 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={!chatInput.trim() || isChatLoading}
                className="rounded-[1.2rem] border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-3 text-white transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-gray-100"
                aria-label="Send word question"
              >
                <Send className="h-5 w-5" />
              </button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
