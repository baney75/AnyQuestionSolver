import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  ExternalLink,
  Loader2,
  MessageCircle,
  Newspaper,
  RefreshCw,
  Rss,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import {
  NEWS_SOURCES,
  buildNewsReasoningContext,
  fetchAllNewsWithStatus,
  fetchNewsForQueryWithStatus,
  hydrateNewsArticles,
  type NewsArticle,
} from "../services/news";
import { chatWithTutor } from "../services/gemini";
import { RichResponse } from "./RichResponse";

interface NewsViewProps {
  initialQuery?: string;
  onClose?: () => void;
  onReturn?: () => void;
  hasBackgroundTask?: boolean;
}

function formatRelativeTime(dateString: string) {
  const time = new Date(dateString).getTime();
  if (Number.isNaN(time)) {
    return "";
  }

  const diffMs = Date.now() - time;
  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function formatPublishedLabel(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SourceToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-[0.18em] transition ${
        active
          ? "border-[var(--aqs-accent)] bg-[var(--aqs-accent)] text-white"
          : "border-gray-300 bg-white/70 text-gray-600 hover:border-[var(--aqs-accent)] hover:text-[var(--aqs-accent-strong)] dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

function ArticleMeta({
  article,
  compact = false,
}: {
  article: NewsArticle;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-[11px]" : "text-xs"} font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400`}>
      <span className="rounded-full border border-[var(--aqs-accent)]/30 bg-[var(--aqs-accent-soft)] px-2.5 py-1 text-[var(--aqs-accent-strong)] dark:bg-[color:rgba(122,31,52,0.18)] dark:text-[var(--aqs-accent-dark)]">
        {article.source}
      </span>
      <span>{article.sourceBias}</span>
      <span>{article.sourceType === "wire" ? "direct reporting" : "analysis"}</span>
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3.5 w-3.5" />
        {formatRelativeTime(article.pubDate)}
      </span>
    </div>
  );
}

function ArticleButtons({
  article,
  onAsk,
}: {
  article: NewsArticle;
  onAsk: (article: NewsArticle) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={article.directArticleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-white px-3 py-2 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        Direct Article
        <ExternalLink className="h-4 w-4" />
      </a>
      {article.primarySourceUrl ? (
        <a
          href={article.primarySourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] px-3 py-2 text-sm font-bold text-[var(--aqs-accent-strong)] transition hover:-translate-y-0.5 dark:bg-[color:rgba(122,31,52,0.18)] dark:text-[var(--aqs-accent-dark)]"
        >
          Primary Source
          <ShieldCheck className="h-4 w-4" />
        </a>
      ) : null}
      <button
        type="button"
        onClick={() => onAsk(article)}
        className="inline-flex items-center gap-2 rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] px-3 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--aqs-accent-strong)] dark:border-gray-100"
      >
        Ask About This
        <MessageCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

function LeadStory({
  article,
  onAsk,
}: {
  article: NewsArticle;
  onAsk: (article: NewsArticle) => void;
}) {
  return (
    <article className="self-start rounded-[2rem] border-2 border-gray-900 bg-white p-4 text-gray-900 neo-shadow dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100 md:p-5">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.95fr]">
        <div className="overflow-hidden rounded-[1.4rem] border-2 border-gray-900 bg-[var(--aqs-accent-soft)] dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.16)]">
          {article.thumbnail ? (
            <img
              src={article.thumbnail}
              alt={article.title}
              width={960}
              height={720}
              loading="eager"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center">
              <Newspaper className="h-12 w-12 text-[var(--aqs-accent)] dark:text-[var(--aqs-accent-dark)]" aria-hidden="true" />
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
              <Sparkles className="h-4 w-4" />
              Lead Story
            </div>
            <ArticleMeta article={article} />
            <div>
              <h2 className="text-2xl font-black leading-tight md:text-[2rem]">
                {article.title}
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-700 dark:text-gray-300">
                {article.description}
              </p>
            </div>
            {article.contentText ? (
              <div className="rounded-[1.2rem] border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-700 dark:bg-gray-950/60">
                <p className="text-xs font-mono uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                  Report snapshot
                </p>
                <p className="mt-3 line-clamp-6 text-sm leading-7 text-gray-700 dark:text-gray-300">
                  {article.contentText}
                </p>
              </div>
            ) : null}
          </div>

          <ArticleButtons article={article} onAsk={onAsk} />
        </div>
      </div>
    </article>
  );
}

function LatestStory({
  article,
  onAsk,
}: {
  article: NewsArticle;
  onAsk: (article: NewsArticle) => void;
}) {
  return (
    <article className="rounded-[1.4rem] border-2 border-gray-900 bg-white p-4 neo-shadow-sm dark:border-gray-100 dark:bg-gray-900">
      <ArticleMeta article={article} compact />
      <h3 className="mt-3 text-lg font-bold leading-tight text-gray-900 dark:text-white">
        {article.title}
      </h3>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
        {article.description}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
          {formatPublishedLabel(article.pubDate)}
        </span>
        <button
          type="button"
          onClick={() => onAsk(article)}
          className="text-sm font-bold text-[var(--aqs-accent-strong)] hover:underline dark:text-[var(--aqs-accent-dark)]"
        >
          Open brief
        </button>
      </div>
    </article>
  );
}

function StoryCard({
  article,
  onAsk,
}: {
  article: NewsArticle;
  onAsk: (article: NewsArticle) => void;
}) {
  return (
    <article className="overflow-hidden rounded-[1.4rem] border-2 border-gray-900 bg-white neo-shadow transition hover:-translate-y-1 dark:border-gray-100 dark:bg-gray-900">
      <div className="aspect-[16/9] overflow-hidden border-b-2 border-gray-900 dark:border-gray-100">
        {article.thumbnail ? (
          <img
            src={article.thumbnail}
            alt={article.title}
            width={640}
            height={360}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[var(--aqs-accent-soft)] dark:bg-[color:rgba(122,31,52,0.18)]">
            <Newspaper className="h-9 w-9 text-[var(--aqs-accent)] dark:text-[var(--aqs-accent-dark)]" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <ArticleMeta article={article} compact />
        <div>
          <h3 className="text-lg font-bold leading-tight text-gray-900 dark:text-white">{article.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600 dark:text-gray-400">
            {article.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-mono uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">
          {article.categories.slice(0, 3).map((category) => (
            <span key={category} className="rounded-full bg-gray-100 px-2.5 py-1 dark:bg-gray-800">
              {category}
            </span>
          ))}
        </div>
        <ArticleButtons article={article} onAsk={onAsk} />
      </div>
    </article>
  );
}

function BackgroundTaskBanner({ onReturn }: { onReturn: () => void }) {
  return (
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
  );
}

export function NewsView({ initialQuery = "", onClose, onReturn, hasBackgroundTask }: NewsViewProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hydrating, setHydrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [searchInput, setSearchInput] = useState(initialQuery);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "tutor"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const loadTokenRef = useRef(0);

  const loadNews = useCallback(
    async (searchQuery: string, forceRefresh = false) => {
      const loadToken = ++loadTokenRef.current;
      setLoading(true);
      setError(null);
      if (forceRefresh) {
        setRefreshing(true);
      }

      try {
        const result = searchQuery.trim()
          ? await fetchNewsForQueryWithStatus(searchQuery.trim(), 18, forceRefresh)
          : await fetchAllNewsWithStatus({ forceRefresh });
        if (loadToken !== loadTokenRef.current) {
          return;
        }

        setArticles(result.articles);
        setLoading(false);
        setRefreshing(false);
        setHydrating(true);

        void hydrateNewsArticles(result.articles, 8)
          .then((hydrated) => {
            if (loadToken === loadTokenRef.current) {
              setArticles(hydrated);
            }
          })
          .finally(() => {
            if (loadToken === loadTokenRef.current) {
              setHydrating(false);
            }
          });
      } catch (loadError) {
        if (loadToken === loadTokenRef.current) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load news.");
          setLoading(false);
          setRefreshing(false);
          setHydrating(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadNews(query);
  }, [loadNews, query]);

  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!showChat) {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      chatInputRef.current?.focus();
    }, 60);

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowChat(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [showChat]);

  const filteredArticles = useMemo(() => {
    if (selectedSources.size === 0) {
      return articles;
    }
    return articles.filter((article) => selectedSources.has(article.source));
  }, [articles, selectedSources]);

  const leadArticle = filteredArticles[0] || null;
  const latestRail = filteredArticles.slice(1, 6);
  const deckArticles = filteredArticles.slice(6);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setQuery(searchInput);
  };

  const toggleSource = (sourceName: string) => {
    setSelectedSources((current) => {
      const next = new Set(current);
      if (next.has(sourceName)) {
        next.delete(sourceName);
      } else {
        next.add(sourceName);
      }
      return next;
    });
  };

  const sendNewsQuestion = useCallback(
    async (message: string, article?: NewsArticle) => {
      if (!message.trim() || isChatLoading || filteredArticles.length === 0) {
        return;
      }

      const userMessage = message.trim();
      setShowChat(true);
      setChatMessages((prev) => [...prev, { role: "user", text: userMessage }]);
      setIsChatLoading(true);

      try {
        const focusArticles = article
          ? [article, ...filteredArticles.filter((item) => item.link !== article.link)]
          : filteredArticles;
        const context = buildNewsReasoningContext(focusArticles, query, 5);
        const prompt = `You are analyzing current news from the app's curated RSS feeds.

Use ONLY the articles below as your source base unless you explicitly state that the current feed set does not answer the question.
Quote or reference the DIRECT ARTICLE URL when discussing a story.
If a story has a primary source listed, mention it.
Do not emit [ACTION: show_news]. Stay in analyst mode.
Be concise, neutral, and truth-seeking.
Format for a compact floating panel:
- start with the direct answer
- prefer short bullets or short paragraphs
- avoid long throat-clearing
- compare stories explicitly when relevant

ARTICLES:
${context}

USER QUESTION:
${userMessage}`;

        const reply = await chatWithTutor([], prompt);
        setChatMessages((prev) => [...prev, { role: "tutor", text: reply }]);
      } catch {
        setChatMessages((prev) => [
          ...prev,
          {
            role: "tutor",
            text: "I couldn't process that news follow-up right now. Try again in a moment.",
          },
        ]);
      } finally {
        setIsChatLoading(false);
      }
    },
    [filteredArticles, isChatLoading, query],
  );

  const handleChatSubmit = useCallback(() => {
    const message = chatInput.trim();
    if (!message) {
      return;
    }

    setChatInput("");
    void sendNewsQuestion(message);
  }, [chatInput, sendNewsQuestion]);

  const handleChatInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowChat(false);
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleChatSubmit();
      }
    },
    [handleChatSubmit],
  );

  const sourceSummary = useMemo(() => {
    const loaded = new Set(filteredArticles.map((article) => article.source));
    return NEWS_SOURCES.filter((source) => loaded.has(source.name));
  }, [filteredArticles]);

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      {hasBackgroundTask && onReturn ? <BackgroundTaskBanner onReturn={onReturn} /> : null}

      <section className="overflow-hidden rounded-[2.2rem] border-2 border-gray-900 bg-[linear-gradient(135deg,rgba(122,31,52,0.1),rgba(255,255,255,0.9))] neo-shadow dark:border-gray-100 dark:bg-[linear-gradient(135deg,rgba(122,31,52,0.24),rgba(10,14,25,0.96))]">
        <div className="border-b-2 border-gray-900 px-5 py-5 dark:border-gray-100 md:px-8 lg:px-10 dark:bg-transparent">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {onReturn ? (
                  <button
                    type="button"
                    onClick={onReturn}
                    className="rounded-xl border-2 border-gray-900 bg-white p-2 text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                    aria-label="Back to answer"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                ) : null}
                <div className="rounded-2xl border-2 border-gray-900 bg-[var(--aqs-accent)] p-3 text-white dark:border-gray-100">
                  <Newspaper className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                    Verified News Desk
                  </p>
                  <h1 className="mt-1 max-w-4xl text-3xl font-black tracking-tight text-gray-900 dark:text-white md:text-5xl">
                    Latest reporting, direct links, primary references.
                  </h1>
                </div>
              </div>
              <p className="max-w-4xl text-sm leading-7 text-gray-600 dark:text-gray-300 md:text-lg">
                A live desk built from your selected feeds. Direct article links stay visible, and upstream references surface when the reporting exposes them.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => setShowChat((value) => !value)}
                className={`rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                  showChat
                    ? "border-gray-900 bg-[var(--aqs-accent)] text-white dark:border-gray-100"
                    : "border-gray-900 bg-white text-gray-900 hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                }`}
                aria-expanded={showChat}
                aria-controls="floating-news-chat"
              >
                <MessageCircle className="mr-2 inline h-4 w-4" />
                Desk Chat
              </button>
              <button
                type="button"
                onClick={() => void loadNews(query, true)}
                disabled={refreshing}
                className="rounded-xl border-2 border-gray-900 bg-white px-4 py-3 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
              >
                <RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </button>
              {onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border-2 border-gray-900 bg-white px-4 py-3 text-sm font-bold text-gray-900 transition hover:-translate-y-0.5 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                >
                  <X className="mr-2 inline h-4 w-4" />
                  Close
                </button>
              ) : null}
            </div>
          </div>

          <form onSubmit={handleSearch} className="mt-6 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
            <label className="relative block">
              <span className="sr-only">Search the live news feed</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search this live news set…"
                name="news-search"
                autoComplete="off"
                className="w-full rounded-[1.2rem] border-2 border-gray-900 bg-white py-3 pl-12 pr-4 text-gray-900 focus:border-[var(--aqs-accent)] focus:outline-none focus:ring-4 focus:ring-[color:rgba(122,31,52,0.18)] dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
              />
            </label>
            <button
              type="submit"
              className="rounded-[1.2rem] border-2 border-gray-900 bg-[var(--aqs-accent)] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--aqs-accent-strong)] dark:border-gray-100"
            >
              Search News
            </button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {NEWS_SOURCES.map((source) => (
              <SourceToggle
                key={source.name}
                active={selectedSources.has(source.name)}
                label={source.name}
                onClick={() => toggleSource(source.name)}
              />
            ))}
          </div>
        </div>

        <div className="p-5 md:p-7 lg:p-8">
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-[var(--aqs-accent)]" />
              <p className="text-gray-600 dark:text-gray-300">Fetching news feeds...</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[1.4rem] border-2 border-gray-900 bg-white p-6 dark:border-gray-100 dark:bg-gray-900">
              <p className="text-center text-gray-700 dark:text-gray-300">{error}</p>
              <button
                type="button"
                onClick={() => void loadNews(query, true)}
                className="rounded-xl border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-2 font-bold text-white dark:border-gray-100"
              >
                Try Again
              </button>
            </div>
          ) : filteredArticles.length === 0 || !leadArticle ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-[1.4rem] border-2 border-gray-900 bg-white p-6 dark:border-gray-100 dark:bg-gray-900">
              <Newspaper className="h-10 w-10 text-gray-400" />
              <p className="text-center text-gray-600 dark:text-gray-300">
                No articles matched that filter. Try another query or clear some source toggles.
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.75fr)_360px] 2xl:grid-cols-[minmax(0,1.95fr)_380px]">
              <div className="space-y-8">
                <LeadStory article={leadArticle} onAsk={(article) => void sendNewsQuestion(`Explain this story: ${article.title}`, article)} />

                {deckArticles.length > 0 ? (
                  <div>
                    <div className="mb-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                          More Coverage
                        </p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                          Additional reporting from the same live desk.
                        </p>
                      </div>
                      {selectedSources.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setSelectedSources(new Set())}
                          className="text-sm font-bold text-[var(--aqs-accent-strong)] hover:underline dark:text-[var(--aqs-accent-dark)]"
                        >
                          Clear filters
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(17rem,1fr))] 2xl:[grid-template-columns:repeat(auto-fit,minmax(18.5rem,1fr))]">
                      {deckArticles.map((article) => (
                        <StoryCard key={article.link} article={article} onAsk={(selectedArticle) => void sendNewsQuestion(`Give me the essentials on this article.`, selectedArticle)} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <aside className="space-y-4 xl:sticky xl:top-6">
                  <div className="rounded-[1.4rem] border-2 border-gray-900 bg-white p-4 neo-shadow-sm dark:border-gray-100 dark:bg-gray-900">
                    <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                      Latest Desk
                    </p>
                    <div className="mt-4 space-y-3">
                      {latestRail.map((article) => (
                        <LatestStory key={article.link} article={article} onAsk={(selectedArticle) => void sendNewsQuestion(`What matters most in this article?`, selectedArticle)} />
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border-2 border-gray-900 bg-white p-4 neo-shadow-sm dark:border-gray-100 dark:bg-gray-900">
                    <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                      <Rss className="h-4 w-4" />
                      Feed Status
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-gray-700 dark:text-gray-300">
                      <p>
                        Showing <strong>{filteredArticles.length}</strong> current article{filteredArticles.length === 1 ? "" : "s"}.
                      </p>
                      <p>
                        Active outlets:{" "}
                        <span className="font-medium">{sourceSummary.map((source) => source.name).join(", ")}</span>
                      </p>
                      <p className="text-xs font-mono uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                        Every card links to the direct article. Primary-source buttons appear when the feed or article metadata exposes them.
                      </p>
                      {hydrating ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50/90 px-3 py-3 text-xs leading-6 text-gray-700 dark:border-gray-700 dark:bg-gray-950/40 dark:text-gray-200">
                          Enriching thumbnails and primary-source links in the background.
                        </div>
                      ) : null}
                    </div>
                  </div>
                </aside>
            </div>
          )}
        </div>
      </section>

      {showChat ? (
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-40 flex justify-end sm:inset-x-auto sm:bottom-6 sm:right-6">
          <section
            id="floating-news-chat"
            role="dialog"
            aria-label="News chat"
            className="pointer-events-auto w-full max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[1.8rem] border-2 border-gray-900 bg-white neo-shadow dark:border-gray-100 dark:bg-gray-900 sm:w-[26rem]"
          >
              <div className="flex items-start justify-between gap-4 border-b-2 border-gray-900 bg-[var(--aqs-accent-soft)] px-4 py-4 dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.14)]">
                <div>
                  <p className="text-xs font-mono font-bold uppercase tracking-[0.28em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                    Floating Desk Chat
                  </p>
                  <p className="mt-1 text-sm leading-6 text-gray-700 dark:text-gray-300">
                    Ask for comparisons, timelines, or what the direct reporting actually supports.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="rounded-xl border-2 border-gray-900 bg-white p-2 text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                  aria-label="Close news chat"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 p-4">
                <div className="rounded-[1.2rem] border border-gray-300 bg-gray-50/80 px-3 py-3 text-sm leading-6 text-gray-600 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-300">
                  {filteredArticles.length > 0
                    ? `Working from ${filteredArticles.length} live article${filteredArticles.length === 1 ? "" : "s"} in the current desk.`
                    : "No current articles are loaded yet."}
                </div>

                {chatMessages.length === 0 ? (
                  <div className="rounded-[1.4rem] border-2 border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-700">
                    <MessageCircle className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
                    <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
                      Try: “Compare the lead story with the second one,” or “What is the direct source behind this report?”
                    </p>
                  </div>
                ) : (
                  <div className="scroll-panel max-h-[min(46vh,420px)] space-y-4 overflow-y-auto rounded-[1.4rem] border border-gray-300 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-950/30">
                    {chatMessages.map((message, index) => (
                      <div key={`${message.role}-${index}`} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
                        <div
                          className={`max-w-[92%] rounded-[1.3rem] border-2 px-4 py-3 ${
                            message.role === "user"
                              ? "border-gray-900 bg-[var(--aqs-accent)] text-white dark:border-gray-100"
                              : "border-gray-900 bg-white text-gray-900 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                          }`}
                        >
                          <p className={`mb-2 text-[11px] font-mono uppercase tracking-[0.18em] ${message.role === "user" ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                            {message.role === "user" ? "You" : "Desk"}
                          </p>
                          {message.role === "tutor" ? <RichResponse text={message.text} compact /> : <p className="text-sm leading-7">{message.text}</p>}
                        </div>
                      </div>
                    ))}
                    {isChatLoading ? (
                      <div className="flex justify-start">
                        <div className="rounded-[1.4rem] border-2 border-gray-900 bg-white px-4 py-3 dark:border-gray-100 dark:bg-gray-900">
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Thinking through the feed set...
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div ref={chatEndRef} />
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {[
                    "Summarize the top stories.",
                    "Which article has the strongest direct sourcing?",
                    "What changed in the last 24 hours?",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => {
                        setChatInput("");
                        void sendNewsQuestion(suggestion);
                      }}
                      disabled={isChatLoading || filteredArticles.length === 0}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-[var(--aqs-accent)] hover:text-[var(--aqs-accent-strong)] disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleChatSubmit();
                  }}
                  className="space-y-3"
                >
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder="Ask what matters, what changed, or what the sourcing actually proves…"
                    aria-label="Ask about the current articles"
                    name="news-chat"
                    autoComplete="off"
                    disabled={isChatLoading}
                    rows={3}
                    onKeyDown={handleChatInputKeyDown}
                    className="w-full resize-none rounded-[1.2rem] border-2 border-gray-900 bg-white px-4 py-3 text-gray-900 focus:border-[var(--aqs-accent)] focus:outline-none focus:ring-4 focus:ring-[color:rgba(122,31,52,0.18)] disabled:opacity-50 dark:border-gray-100 dark:bg-gray-900 dark:text-gray-100"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enter sends. Shift+Enter adds a new line.</p>
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || isChatLoading}
                      className="inline-flex items-center gap-2 rounded-[1.2rem] border-2 border-gray-900 bg-[var(--aqs-accent)] px-4 py-3 text-white transition hover:-translate-y-0.5 disabled:opacity-50 dark:border-gray-100"
                      aria-label="Send news question"
                    >
                      <Send className="h-5 w-5" />
                      Ask Desk
                    </button>
                  </div>
                </form>
              </div>
            </section>
        </div>
      ) : null}
    </div>
  );
}
