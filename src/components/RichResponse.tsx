import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import SmilesDrawer from "smiles-drawer";
import { ExternalLink } from "lucide-react";
import "katex/dist/katex.min.css";

import { CodeBlock } from "./CodeBlock";
import { ChartBlock } from "./ChartBlock";
import { ImageRenderer } from "./ImageRenderer";
import { VideoEmbed } from "./VideoEmbed";
import {
  getGoogleImageSearchUrl,
  getYouTubeSearchUrl,
  searchImages,
  searchVideos,
  searchWeb,
  type SearchResult,
  type VideoResult,
} from "../services/search";
import { extractEmbeddedSources } from "../utils/solution";
import type { SolutionSource } from "../types";

interface RichResponseProps {
  text: string;
  compact?: boolean;
}

type RichElementType = "image" | "video" | "definition" | "web";

interface RichElement {
  type: RichElementType;
  id: string;
  content: string;
}

function scoreQueryMatch(query: string, ...fields: Array<string | undefined>) {
  const queryTerms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);

  const haystack = fields.join(" ").toLowerCase();
  return queryTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function chooseBestImageResult(query: string, items: SearchResult[]) {
  const highTrustHosts = [
    "wikimedia.org",
    "wikipedia.org",
    "britannica.com",
    "nasa.gov",
    "nih.gov",
    "nationalgeographic.com",
    "pbs.org",
    "reuters.com",
    "apnews.com",
    "unsplash.com",
    "pexels.com",
    "openverse.org",
  ];
  const lowTrustHosts = ["facebook.", "instagram.", "pinterest.", "tiktok.", "youtube.com"];
  const ranked = items
    .filter((item) => item.image?.url || item.link)
    .map((item) => {
      const url = item.image?.url || item.link;
      let score = scoreQueryMatch(query, item.title, item.snippet, item.displayLink, url);
      const width = item.image?.width || 0;
      const height = item.image?.height || 0;

      if (highTrustHosts.some((host) => item.displayLink.includes(host) || url.includes(host))) score += 3;
      if (lowTrustHosts.some((host) => item.displayLink.includes(host) || url.includes(host))) score -= 4;
      if (url.match(/\.(svg|gif)(\?|$)/i)) score -= 5;
      if (url.match(/logo|icon|sprite|avatar|thumbnail/i)) score -= 2;
      if (width >= 800 || height >= 800) score += 2;
      if (width > 0 && height > 0 && Math.min(width, height) < 250) score -= 3;
      if (item.title.toLowerCase().includes("stock photo")) score -= 1;

      return { item, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item ?? null;
}

function chooseBestVideoResult(query: string, items: VideoResult[]) {
  const ranked = items
    .map((item) => {
      let score = scoreQueryMatch(query, item.title, item.description, item.channelTitle);

      if (/\bofficial\b/i.test(query) && /\bofficial|vevo|topic\b/i.test(`${item.title} ${item.channelTitle}`)) {
        score += 4;
      }
      if (/\blyric\b/i.test(item.title) && !/\blyric\b/i.test(query)) {
        score -= 3;
      }
      if (/\bshorts\b/i.test(item.title)) {
        score -= 2;
      }

      return { item, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.item ?? null;
}

function SmilesRenderer({ smiles }: { smiles: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains("dark"));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const renderSmiles = useCallback(() => {
    if (!canvasRef.current || !smiles) return;
    setRenderError(null);

    void (async () => {
      try {
        const drawer = new SmilesDrawer();
        await drawer.draw(smiles.trim(), canvasRef.current!, isDark ? "dark" : "light");
      } catch (err) {
        console.error("SMILES render failed:", err);
        setRenderError(err instanceof Error ? err.message : "Failed to render molecule");
      }
    })();
  }, [smiles, isDark]);

  useEffect(() => {
    let active = true;
    if (canvasRef.current && smiles) {
      renderSmiles();
    }
    return () => {
      active = false;
    };
  }, [smiles, renderSmiles]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(smiles);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  if (renderError) {
    return (
      <div className="my-4 rounded-xl border-2 border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg bg-red-100 dark:bg-red-900/30 px-4 py-2">
            <p className="text-sm font-mono text-red-700 dark:text-red-300">
              Could not render molecule structure
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <code className="rounded bg-gray-100 px-3 py-1.5 font-mono text-sm dark:bg-gray-800 dark:text-gray-200">
              {smiles}
            </code>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-900 dark:text-gray-100 transition hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {copied ? "Copied!" : "Copy SMILES"}
              </button>
              <button
                type="button"
                onClick={renderSmiles}
                className="rounded-lg border-2 border-gray-900 dark:border-gray-100 bg-[var(--aqs-accent)] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[var(--aqs-accent-strong)]"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 flex flex-col items-center gap-3 overflow-x-auto rounded-xl border-2 border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <canvas ref={canvasRef} width={500} height={300} className="max-w-full" />
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-lg border-2 border-gray-900 dark:border-gray-100 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-900 dark:text-gray-100 transition hover:bg-gray-50 dark:hover:bg-gray-700"
      >
        {copied ? "Copied!" : "Copy SMILES"}
      </button>
    </div>
  );
}

function DefinitionCard({ content, compact = false }: { content: string; compact?: boolean }) {
  const lines = content.trim().split("\n");
  const wordLine = lines.find((line) => line.startsWith("**") && line.includes("/")) || lines[0] || "";
  const wordMatch = wordLine.match(/\*\*(.+?)\*\*/);
  const phoneticMatch = wordLine.match(/\/(.+?)\//);

  const word = wordMatch?.[1] || "Unknown";
  const phonetic = phoneticMatch?.[1] || "";

  const partsOfSpeech: Array<{ type: string; definitions: Array<{ def: string; example?: string }> }> = [];
  let currentPart: { type: string; definitions: Array<{ def: string; example?: string }> } | null = null;

  for (const line of lines.slice(1)) {
    if (line.startsWith("*") && line.endsWith("*")) {
      if (currentPart) partsOfSpeech.push(currentPart);
      currentPart = { type: line.slice(1, -1), definitions: [] };
      continue;
    }

    if (line.match(/^\d+\./) && currentPart) {
      const defMatch = line.match(/^\d+\.\s*(.+)/);
      if (defMatch) currentPart.definitions.push({ def: defMatch[1] });
      continue;
    }

    if (line.trim().startsWith("- Example:") && currentPart?.definitions.length) {
      const exampleMatch = line.match(/- Example:\s*["'](.+?)["']/);
      if (exampleMatch) {
        currentPart.definitions[currentPart.definitions.length - 1].example = exampleMatch[1];
      }
    }
  }

  if (currentPart) partsOfSpeech.push(currentPart);

  const synonymsMatch = content.match(/Synonyms:\s*(.+)/i);
  const synonyms = synonymsMatch?.[1]?.split(",").map((item) => item.trim()) || [];

  return (
    <div
      className={`my-4 rounded-[1.4rem] border-2 border-amber-400 bg-amber-50 p-5 dark:border-amber-600 dark:bg-amber-900/20 ${
        compact ? "" : "md:p-6"
      }`}
    >
      <div className="mb-4 flex items-baseline gap-3">
        <h3 className={`${compact ? "text-xl" : "text-2xl"} font-bold text-gray-900 dark:text-gray-100`}>
          {word}
        </h3>
        {phonetic ? (
          <span className="font-mono text-base text-gray-600 dark:text-gray-400">/{phonetic}/</span>
        ) : null}
      </div>

      {partsOfSpeech.map((part, index) => (
        <div key={`${part.type}-${index}`} className="mb-4">
          <span className="mb-2 inline-block rounded bg-amber-200 px-2 py-1 font-mono text-xs font-bold uppercase text-amber-900 dark:bg-amber-800 dark:text-amber-100">
            {part.type}
          </span>
          <ol className="ml-2 list-inside list-decimal space-y-2">
            {part.definitions.map((definition, defIndex) => (
              <li key={`${part.type}-${defIndex}-${definition.def.slice(0, 24)}`} className="text-gray-900 dark:text-gray-100">
                <span className="font-medium">{definition.def}</span>
                {definition.example ? (
                  <p className="ml-6 mt-1 text-sm italic text-gray-600 dark:text-gray-400">
                    &ldquo;{definition.example}&rdquo;
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}

      {synonyms.length ? (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold">Synonyms:</span> {synonyms.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function ImageSearchResult({ query, compact = false }: { query: string; compact?: boolean }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadImage() {
      setLoading(true);
      setImageUrl(null);

      try {
        const imageResults = await searchImages(query, 6);
        let bestResult = chooseBestImageResult(query, imageResults.items);

        if (!bestResult) {
          const webResults = await searchWeb(query, 6);
          bestResult = chooseBestImageResult(query, webResults.items);
        }

        if (active) {
          setImageUrl(bestResult?.image?.url || bestResult?.link || null);
        }
      } catch {
        if (active) {
          setImageUrl(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadImage();

    return () => {
      active = false;
    };
  }, [query]);

  if (loading) {
    return (
      <div className="my-4 flex items-center justify-center rounded-xl border-2 border-gray-300 bg-gray-100 p-6 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
        Loading image...
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="my-4 rounded-[1.4rem] border-2 border-gray-300 bg-gray-100 p-5 dark:border-gray-600 dark:bg-gray-800">
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Image preview is unavailable right now.
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Open image results for &quot;{query}&quot; in a new tab.
          </div>
          <a
            href={getGoogleImageSearchUrl(query)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
          >
            Search Images
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "my-3" : "my-4"}>
      <ImageRenderer src={imageUrl} alt={query} />
    </div>
  );
}

function VideoSearchResult({ query, compact = false }: { query: string; compact?: boolean }) {
  const [video, setVideo] = useState<VideoResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadVideo() {
      setLoading(true);
      setVideo(null);

      try {
        const results = await searchVideos(query, 6);
        if (active) {
          setVideo(chooseBestVideoResult(query, results.items));
        }
      } catch {
        if (active) {
          setVideo(null);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadVideo();

    return () => {
      active = false;
    };
  }, [query]);

  if (loading) {
    return (
      <div className="my-4 flex items-center justify-center rounded-xl border-2 border-gray-300 bg-gray-100 p-6 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
        Loading video...
      </div>
    );
  }

  if (!video) {
    return (
      <div className="my-4 rounded-[1.4rem] border-2 border-gray-300 bg-gray-100 p-5 dark:border-gray-600 dark:bg-gray-800">
        <div className="text-center">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Video preview is unavailable right now.
          </div>
          <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Open YouTube results for &quot;{query}&quot; in a new tab.
          </div>
          <a
            href={getYouTubeSearchUrl(query)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center rounded-xl border-2 border-gray-900 bg-white px-4 py-2 font-bold text-gray-900 transition hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-950 dark:text-gray-100 dark:hover:bg-gray-900"
          >
            Search YouTube
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "my-3" : "my-4"}>
      <VideoEmbed videoId={video.videoId} title={video.title} channelTitle={video.channelTitle} />
    </div>
  );
}

function WebSearchResult({ query, compact = false }: { query: string; compact?: boolean }) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadResults() {
      setLoading(true);
      setResults([]);

      try {
        const response = await searchWeb(query, compact ? 2 : 3);
        if (active) {
          setResults(response.items.slice(0, compact ? 2 : 3));
        }
      } catch {
        if (active) {
          setResults([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadResults();

    return () => {
      active = false;
    };
  }, [compact, query]);

  if (loading) {
    return (
      <div className="my-4 flex items-center justify-center rounded-xl border-2 border-gray-300 bg-gray-100 p-6 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400">
        Loading links...
      </div>
    );
  }

  if (!results.length) {
    return null;
  }

  return (
    <div className={`my-4 grid gap-3 ${compact ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
      {results.map((result) => (
        <a
          key={result.link}
          href={result.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-[1.2rem] border-2 border-gray-900 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="line-clamp-2 text-base font-bold text-gray-900 dark:text-gray-100">
                {result.title}
              </div>
              <div className="mt-2 font-mono text-xs text-gray-500 dark:text-gray-400">{result.displayLink}</div>
            </div>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-[var(--aqs-accent)] dark:text-[var(--aqs-accent-dark)]" />
          </div>
          <p className="mt-3 text-sm leading-6 text-gray-700 dark:text-gray-300">{result.snippet}</p>
        </a>
      ))}
    </div>
  );
}

function SourcesPanel({ sources, compact = false }: { sources: SolutionSource[]; compact?: boolean }) {
  if (!sources.length) {
    return null;
  }

  if (compact) {
    return (
      <div className="mt-4 grid gap-2">
        {sources.map((source) => (
          <a
            key={`${source.index}-${source.url}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-gray-300 bg-[var(--aqs-accent-soft)]/70 px-3 py-2 text-sm transition hover:bg-[var(--aqs-accent-soft)] dark:border-gray-700 dark:bg-[color:rgba(122,31,52,0.18)] dark:hover:bg-[color:rgba(122,31,52,0.24)]"
          >
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              [{source.index}] {source.title}
            </div>
            <div className="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">
              {source.category} · {source.host}
            </div>
          </a>
        ))}
      </div>
    );
  }

  return (
    <section className="mb-8 rounded-[1.6rem] border-2 border-gray-900 bg-[var(--aqs-accent-soft)] p-5 dark:border-gray-100 dark:bg-[color:rgba(122,31,52,0.18)]">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Verified Sources
        </h3>
        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
          Automatically filtered toward official, scholarly, and high-trust reporting sources.
        </p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {sources.map((source) => (
          <a
            key={`${source.index}-${source.url}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-[1.2rem] border-2 border-gray-900 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:bg-gray-50 dark:border-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900"
          >
            <div className="flex items-start gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--aqs-accent)] bg-[var(--aqs-accent-soft)] font-mono text-sm font-bold text-[var(--aqs-accent-strong)] dark:border-[var(--aqs-accent-dark)] dark:bg-[color:rgba(122,31,52,0.22)] dark:text-[var(--aqs-accent-dark)]">
                [{source.index}]
              </span>
              <div className="min-w-0">
                <div className="text-base font-bold leading-6 text-gray-900 dark:text-gray-100">
                  {source.title}
                </div>
                <div className="mt-2 font-mono text-xs text-gray-500 dark:text-gray-400">{source.host}</div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--aqs-accent-strong)] dark:text-[var(--aqs-accent-dark)]">
                  {source.category}
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

function processRichText(text: string): {
  processed: string;
  elements: RichElement[];
  sources: SolutionSource[];
} {
  const { body, sources } = extractEmbeddedSources(text);
  const elements: RichElement[] = [];
  let processed = body;
  let idCounter = 0;

  processed = processed.replace(/\[IMAGE_SEARCH:\s*"([^"]+)"\]/g, (_, query) => {
    const id = `img-${idCounter++}`;
    elements.push({ type: "image", id, content: query });
    return `\n\n__IMAGE_MARKER_${id}__\n\n`;
  });

  processed = processed.replace(/\[VIDEO_SEARCH:\s*"([^"]+)"\]/g, (_, query) => {
    const id = `vid-${idCounter++}`;
    elements.push({ type: "video", id, content: query });
    return `\n\n__VIDEO_MARKER_${id}__\n\n`;
  });

  processed = processed.replace(/\[WEB_SEARCH:\s*"([^"]+)"\]/g, (_, query) => {
    const id = `web-${idCounter++}`;
    elements.push({ type: "web", id, content: query });
    return `\n\n__WEB_MARKER_${id}__\n\n`;
  });

  processed = processed.replace(/\[DEFINITION\]([\s\S]*?)\[END_DEFINITION\]/g, (_, content) => {
    const id = `def-${idCounter++}`;
    elements.push({ type: "definition", id, content: content.trim() });
    return `\n\n__DEFINITION_MARKER_${id}__\n\n`;
  });

  processed = processed
    .replace(/\[IMAGE_SEARCH:[^\]]*\]/g, "")
    .replace(/\[VIDEO_SEARCH:[^\]]*\]/g, "")
    .replace(/\[WEB_SEARCH:[^\]]*\]/g, "")
    .replace(/\[DEFINITION\](?!(\s|\S)*\[END_DEFINITION\])/g, "")
    .replace(/\[END_DEFINITION\]/g, "");

  return { processed, elements, sources };
}

export function RichResponse({ text, compact = false }: RichResponseProps) {
  const { processed, elements, sources } = useMemo(() => processRichText(text), [text]);

  const parts = useMemo(() => {
    const result: Array<{ type: RichElementType | "markdown"; content: string; id?: string }> = [];
    const markerRegex = /__(IMAGE_MARKER_|VIDEO_MARKER_|WEB_MARKER_|DEFINITION_MARKER_)([^_]+)__/g;
    let lastIndex = 0;
    let match = markerRegex.exec(processed);

    while (match !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "markdown", content: processed.slice(lastIndex, match.index) });
      }

      const id = match[2];
      const element = elements.find((entry) => entry.id === id);
      if (element) {
        result.push({ type: element.type, content: element.content, id });
      }

      lastIndex = markerRegex.lastIndex;
      match = markerRegex.exec(processed);
    }

    if (lastIndex < processed.length) {
      result.push({ type: "markdown", content: processed.slice(lastIndex) });
    }

    return result;
  }, [elements, processed]);

  const proseClass = compact
    ? "prose prose-sm prose-gray max-w-none dark:prose-invert prose-p:my-2 prose-p:leading-relaxed prose-pre:bg-gray-50 dark:prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-300 dark:prose-pre:border-gray-700 prose-pre:rounded-xl prose-a:text-[var(--aqs-accent)] dark:prose-a:text-[var(--aqs-accent-dark)]"
    : "prose prose-lg prose-gray max-w-none dark:prose-invert prose-p:leading-relaxed prose-pre:bg-gray-50 dark:prose-pre:bg-gray-800 prose-pre:text-gray-900 dark:prose-pre:text-gray-100 prose-pre:border-2 prose-pre:border-gray-900 dark:prose-pre:border-gray-100 prose-pre:rounded-xl prose-pre:neo-shadow-sm prose-headings:font-sans prose-headings:font-bold prose-headings:tracking-tight prose-a:text-[var(--aqs-accent)] dark:prose-a:text-[var(--aqs-accent-dark)] prose-table:border-2 prose-table:border-gray-900 dark:prose-table:border-gray-100 prose-th:border-b-2 prose-th:border-gray-900 dark:prose-th:border-gray-100 prose-td:border-b prose-td:border-gray-200 dark:prose-td:border-gray-700";

  return (
    <div className="space-y-2">
      {!compact ? <SourcesPanel sources={sources} /> : null}

      {parts.map((part, index) => {
        if (part.type === "image") {
          return <ImageSearchResult key={part.id || `img-${index}`} query={part.content} compact={compact} />;
        }

        if (part.type === "video") {
          return <VideoSearchResult key={part.id || `vid-${index}`} query={part.content} compact={compact} />;
        }

        if (part.type === "web") {
          return <WebSearchResult key={part.id || `web-${index}`} query={part.content} compact={compact} />;
        }

        if (part.type === "definition") {
          return <DefinitionCard key={part.id || `def-${index}`} content={part.content} compact={compact} />;
        }

        return (
          <div key={`md-${index}`} className={proseClass}>
            <Markdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex]}
              components={{
                code(props) {
                  const { children, className, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || "");
                  const language = match ? match[1] : "";
                  const content = String(children).replace(/\n$/, "");

                  if (language === "smiles") {
                    return <SmilesRenderer smiles={content} />;
                  }

                  if (language === "chart") {
                    return <ChartBlock json={content} />;
                  }

                  if (language) {
                    return <CodeBlock code={content} language={language} />;
                  }

                  return (
                    <code {...rest} className={className}>
                      {children}
                    </code>
                  );
                },
                pre({ children }) {
                  return <>{children}</>;
                },
              }}
            >
              {part.content}
            </Markdown>
          </div>
        );
      })}

      {compact ? <SourcesPanel sources={sources} compact /> : null}
    </div>
  );
}
