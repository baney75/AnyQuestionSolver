import { fetchFeed, stripHtml, type RssItem } from "./rss";
import { searchWeb } from "./search";

const RSS2JSON_API = "https://api.rss2json.com/v1/api.json";
const ARTICLE_FETCH_TIMEOUT_MS = 18_000;
const ARTICLE_FETCH_FALLBACKS = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];
const RECENT_WINDOW_HOURS = 96;

export interface NewsSource {
  name: string;
  url: string;
  bias: "center" | "center-right";
  priority: number;
  type: "wire" | "analysis";
}

export interface NewsLink {
  href: string;
  text: string;
}

export interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  author?: string;
  thumbnail?: string;
  source: string;
  sourceUrl: string;
  sourceBias: NewsSource["bias"];
  sourceType: NewsSource["type"];
  categories: string[];
  contentHtml: string;
  contentText: string;
  links: NewsLink[];
  primarySourceUrl?: string;
  primarySourceLabel?: string;
  directArticleUrl: string;
}

export interface NewsFeedFailure {
  source: NewsSource;
  message: string;
}

export interface NewsFetchResult {
  articles: NewsArticle[];
  failedSources: NewsFeedFailure[];
  loadedSources: string[];
}

export const NEWS_SOURCES: NewsSource[] = [
  { name: "Straight Arrow News", url: "https://san.com/feed/", bias: "center", priority: 10, type: "wire" },
  { name: "Tangle", url: "https://www.readtangle.com/archive/rss/", bias: "center", priority: 4, type: "analysis" },
  { name: "WSJ Tech", url: "https://feeds.content.dowjones.io/public/rss/RSSWSJD", bias: "center-right", priority: 8, type: "wire" },
  { name: "WSJ World News", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews", bias: "center-right", priority: 8, type: "wire" },
  { name: "WSJ US News", url: "https://feeds.content.dowjones.io/public/rss/RSSUSnews", bias: "center-right", priority: 8, type: "wire" },
  { name: "NewsNation", url: "https://www.newsnationnow.com/feed/", bias: "center", priority: 9, type: "wire" },
  { name: "The Center Square", url: "https://www.thecentersquare.com/search/?f=rss&t=article&l=20&s=start_time&fulltext=showtext&sd=desc", bias: "center-right", priority: 7, type: "wire" },
];

interface Rss2JsonItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
  content?: string;
  author?: string;
  thumbnail?: string;
  enclosure?: {
    link?: string;
    type?: string;
  };
  categories?: string[];
}

interface Rss2JsonResponse {
  status: string;
  items?: Rss2JsonItem[];
}

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "linkedin.com",
];
const HIGH_TRUST_NEWS_HOSTS = [
  "reuters.com",
  "apnews.com",
  "axios.com",
  "wsj.com",
  "nytimes.com",
  "washingtonpost.com",
  "bloomberg.com",
  "politico.com",
  "bbc.com",
  "npr.org",
  "pbs.org",
];
const OFFICIAL_HOST_HINTS = [
  ".gov",
  ".mil",
  "whitehouse.gov",
  "congress.gov",
  "supremecourt.gov",
  "senate.gov",
  "house.gov",
  "state.gov",
  "defense.gov",
  "justice.gov",
  "treasury.gov",
  "cdc.gov",
  "nih.gov",
  "who.int",
  "un.org",
  "europa.eu",
  "parliament.uk",
  "nasa.gov",
];
const LOW_TRUST_HOSTS = ["wikipedia.org", "britannica.com", "reddit.com", "youtube.com"];
const PRIMARY_SOURCE_TEXT_HINTS = /\b(reported|according to|statement|press release|executive order|filing|report|court filing|data|survey|study|announcement|fact sheet|transcript)\b/i;
const MENTIONED_OUTLET_HINTS: Array<{ label: string; domain: string; patterns: RegExp[] }> = [
  { label: "Associated Press", domain: "apnews.com", patterns: [/\bassociated press\b/i, /\bAP\b/] },
  { label: "Reuters", domain: "reuters.com", patterns: [/\breuters\b/i] },
  { label: "Axios", domain: "axios.com", patterns: [/\baxios\b/i] },
  { label: "Wall Street Journal", domain: "wsj.com", patterns: [/\bwall street journal\b/i, /\bWSJ\b/] },
  { label: "New York Times", domain: "nytimes.com", patterns: [/\bnew york times\b/i] },
  { label: "Washington Post", domain: "washingtonpost.com", patterns: [/\bwashington post\b/i] },
  { label: "Bloomberg", domain: "bloomberg.com", patterns: [/\bbloomberg\b/i] },
  { label: "Politico", domain: "politico.com", patterns: [/\bpolitico\b/i] },
];

function getHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    const value = parsed.toString();
    return value.endsWith("/") ? value.slice(0, -1) : value;
  } catch {
    return url.trim();
  }
}

function normalizeTitle(title: string) {
  return title
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function summarizeText(value: string, max = 260) {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 3).trimEnd()}...`;
}

function hoursSince(dateString: string) {
  const time = new Date(dateString).getTime();
  if (Number.isNaN(time)) {
    return Number.POSITIVE_INFINITY;
  }
  return (Date.now() - time) / (1000 * 60 * 60);
}

function isRecentEnough(article: NewsArticle) {
  return hoursSince(article.pubDate) <= RECENT_WINDOW_HOURS;
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 2);
}

function dedupeLinks(links: NewsLink[]) {
  const seen = new Set<string>();
  return links.filter((link) => {
    const normalized = normalizeUrl(link.href);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function scorePrimaryCandidate(article: NewsArticle, link: NewsLink) {
  const url = normalizeUrl(link.href);
  const host = getHost(url);
  const articleHost = getHost(article.link);
  let score = 0;

  if (!host) {
    return -100;
  }
  if (host === articleHost) {
    score -= 8;
  }
  if (SOCIAL_HOSTS.some((entry) => host.includes(entry))) {
    score -= 12;
  }
  if (LOW_TRUST_HOSTS.some((entry) => host.includes(entry))) {
    score -= 8;
  }
  if (OFFICIAL_HOST_HINTS.some((entry) => host.includes(entry))) {
    score += 9;
  }
  if (HIGH_TRUST_NEWS_HOSTS.some((entry) => host.includes(entry))) {
    score += 6;
  }
  if (PRIMARY_SOURCE_TEXT_HINTS.test(link.text) || PRIMARY_SOURCE_TEXT_HINTS.test(url)) {
    score += 4;
  }
  if (/\b(pdf|fact-sheet|press|release|statement|report|filing|order|transcript)\b/i.test(url)) {
    score += 3;
  }
  if (/(\.jpg|\.png|\.jpeg|\/tag\/|\/category\/)/i.test(url)) {
    score -= 8;
  }

  return score;
}

function pickPrimarySource(article: NewsArticle) {
  const candidates = dedupeLinks(article.links)
    .filter((link) => getHost(link.href) !== getHost(article.link))
    .map((link) => ({ link, score: scorePrimaryCandidate(article, link) }))
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (!best || best.score < 3) {
    return undefined;
  }

  return {
    url: best.link.href,
    label: best.link.text || getHost(best.link.href),
  };
}

function parseArticleDocument(html: string, fallbackUrl: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const bodyRoot =
    doc.querySelector("article") ||
    doc.querySelector('[itemprop="articleBody"]') ||
    doc.querySelector(".article-body") ||
    doc.querySelector(".entry-content") ||
    doc.querySelector(".post-content") ||
    doc.querySelector(".c-article-content") ||
    doc.querySelector("main");

  const paragraphs = [...(bodyRoot?.querySelectorAll("p") || [])]
    .map((node) => stripHtml(node.innerHTML))
    .filter((text) => text.length > 40);

  const links = [...(bodyRoot?.querySelectorAll("a[href]") || [])].map((node) => ({
    href: normalizeUrl((node as HTMLAnchorElement).href || node.getAttribute("href") || ""),
    text: stripHtml(node.textContent || ""),
  }));

  const thumbnail =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute("content") ||
    bodyRoot?.querySelector("img")?.getAttribute("src") ||
    undefined;

  const metaDescription =
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
    "";

  return {
    contentText: paragraphs.join("\n\n") || metaDescription || "",
    links: dedupeLinks(links).filter((link) => link.href.startsWith("http")),
    thumbnail: thumbnail ? normalizeUrl(new URL(thumbnail, fallbackUrl).toString()) : undefined,
  };
}

async function fetchArticleHtml(url: string) {
  let lastError: unknown;
  for (const buildUrl of ARTICLE_FETCH_FALLBACKS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(buildUrl(url), {
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      if (html.includes("<html") || html.includes("<article") || html.includes("<!DOCTYPE")) {
        return html;
      }
      lastError = new Error("Non-HTML response");
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch article");
}

function getSourceConfig(sourceName: string) {
  return NEWS_SOURCES.find((entry) => entry.name === sourceName) || NEWS_SOURCES[0];
}

function convertRssItemToArticle(item: RssItem, source: NewsSource): NewsArticle {
  const base: NewsArticle = {
    title: item.title,
    link: normalizeUrl(item.link),
    description: summarizeText(item.description || item.contentText || ""),
    pubDate: item.pubDate || new Date().toISOString(),
    author: item.author,
    thumbnail: item.thumbnail ? normalizeUrl(item.thumbnail) : undefined,
    source: source.name,
    sourceUrl: source.url,
    sourceBias: source.bias,
    sourceType: source.type,
    categories: item.categories || [],
    contentHtml: item.contentHtml,
    contentText: item.contentText,
    links: dedupeLinks(item.links),
    directArticleUrl: normalizeUrl(item.link),
  };

  const primary = pickPrimarySource(base);
  if (primary) {
    base.primarySourceUrl = primary.url;
    base.primarySourceLabel = primary.label;
  }

  return base;
}

function convertJsonItemToArticle(item: Rss2JsonItem, source: NewsSource): NewsArticle {
  const contentHtml = item.content || item.description || "";
  const contentText = stripHtml(contentHtml);
  const links = dedupeLinks(
    [...contentHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
      href: normalizeUrl(match[1]),
      text: stripHtml(match[2] || ""),
    })),
  );

  const base: NewsArticle = {
    title: item.title,
    link: normalizeUrl(item.link),
    description: summarizeText(stripHtml(item.description || item.content || "")),
    pubDate: item.pubDate || new Date().toISOString(),
    author: item.author,
    thumbnail: item.thumbnail || (item.enclosure?.type?.startsWith("image") ? item.enclosure.link : undefined),
    source: source.name,
    sourceUrl: source.url,
    sourceBias: source.bias,
    sourceType: source.type,
    categories: item.categories || [],
    contentHtml,
    contentText,
    links,
    directArticleUrl: normalizeUrl(item.link),
  };

  const primary = pickPrimarySource(base);
  if (primary) {
    base.primarySourceUrl = primary.url;
    base.primarySourceLabel = primary.label;
  }

  return base;
}

async function fetchSourceViaRss2Json(source: NewsSource): Promise<NewsArticle[]> {
  const response = await fetch(`${RSS2JSON_API}?rss_url=${encodeURIComponent(source.url)}`);
  if (!response.ok) {
    throw new Error(`rss2json failed for ${source.name}`);
  }

  const data: Rss2JsonResponse = await response.json();
  if (data.status !== "ok" || !data.items?.length) {
    throw new Error(`No items for ${source.name}`);
  }

  return data.items.map((item) => convertJsonItemToArticle(item, source));
}

async function fetchSource(source: NewsSource): Promise<NewsArticle[]> {
  try {
    const feed = await fetchFeed(source.url, source.name);
    if (feed.items.length > 0) {
      return feed.items.map((item) => convertRssItemToArticle(item, source));
    }
  } catch {
    /* fall through */
  }

  return fetchSourceViaRss2Json(source);
}

function deduplicateArticles(articles: NewsArticle[]) {
  const seen = new Map<string, NewsArticle>();

  for (const article of articles) {
    const key = normalizeTitle(article.title);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, article);
      continue;
    }

    const currentSource = getSourceConfig(article.source);
    const existingSource = getSourceConfig(existing.source);
    const currentScore = currentSource.priority + (article.primarySourceUrl ? 2 : 0) + (article.contentText.length > 400 ? 1 : 0);
    const existingScore = existingSource.priority + (existing.primarySourceUrl ? 2 : 0) + (existing.contentText.length > 400 ? 1 : 0);

    if (currentScore > existingScore) {
      seen.set(key, article);
    }
  }

  return [...seen.values()];
}

function sortArticles(articles: NewsArticle[]) {
  return [...articles].sort((left, right) => {
    const leftSource = getSourceConfig(left.source);
    const rightSource = getSourceConfig(right.source);
    const leftTime = new Date(left.pubDate).getTime();
    const rightTime = new Date(right.pubDate).getTime();
    const freshnessDiff = rightTime - leftTime;

    if (Math.abs(freshnessDiff) > 2 * 60 * 60 * 1000) {
      return freshnessDiff;
    }

    return rightSource.priority - leftSource.priority;
  });
}

function scoreArticleForQuery(article: NewsArticle, terms: string[]) {
  const haystack = `${article.title} ${article.description} ${article.contentText} ${article.categories.join(" ")}`.toLowerCase();
  const titleHaystack = article.title.toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (titleHaystack.includes(term)) score += 5;
    if (haystack.includes(term)) score += 2;
  }

  const source = getSourceConfig(article.source);
  score += source.priority;
  if (article.primarySourceUrl) score += 2;
  if (article.sourceType === "wire") score += 2;
  score -= Math.min(hoursSince(article.pubDate), 72) / 6;

  return score;
}

async function resolveMentionedOutletSource(article: NewsArticle): Promise<NewsArticle> {
  if (article.primarySourceUrl || !article.contentText) {
    return article;
  }

  const articleHost = getHost(article.link);
  const outlet = MENTIONED_OUTLET_HINTS.find((entry) =>
    entry.patterns.some((pattern) => pattern.test(article.contentText) || pattern.test(article.author || "")),
  );

  if (!outlet || articleHost.includes(outlet.domain)) {
    return article;
  }

  const results = await searchWeb(`site:${outlet.domain} "${article.title}"`, 3);
  const match = results.items.find((item) => getHost(item.link).includes(outlet.domain));
  if (!match) {
    return article;
  }

  return {
    ...article,
    primarySourceUrl: match.link,
    primarySourceLabel: outlet.label,
  };
}

export async function hydrateNewsArticle(article: NewsArticle): Promise<NewsArticle> {
  let next = article;

  if (article.contentText.length < 700 || !article.primarySourceUrl || !article.thumbnail) {
    try {
      const html = await fetchArticleHtml(article.link);
      const extracted = parseArticleDocument(html, article.link);

      next = {
        ...next,
        thumbnail: next.thumbnail || extracted.thumbnail,
        contentText: extracted.contentText || next.contentText,
        links: dedupeLinks([...next.links, ...extracted.links]),
      };

      const primary = pickPrimarySource(next);
      if (primary) {
        next = {
          ...next,
          primarySourceUrl: next.primarySourceUrl || primary.url,
          primarySourceLabel: next.primarySourceLabel || primary.label,
        };
      }
    } catch {
      /* keep RSS content */
    }
  }

  try {
    next = await resolveMentionedOutletSource(next);
  } catch {
    /* optional enrichment only */
  }

  return next;
}

export async function hydrateNewsArticles(articles: NewsArticle[], limit = 6) {
  const enriched = await Promise.all(
    articles.map((article, index) => (index < limit ? hydrateNewsArticle(article) : Promise.resolve(article))),
  );
  return enriched;
}

export async function fetchAllNews(options?: { maxArticles?: number }) {
  const { maxArticles = 40 } = options || {};
  const results = await Promise.allSettled(NEWS_SOURCES.map((source) => fetchSource(source)));
  const articles = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  const recent = articles.filter(isRecentEnough);
  const pool = recent.length >= 8 ? recent : articles;
  return sortArticles(deduplicateArticles(pool)).slice(0, maxArticles);
}

export async function fetchAllNewsWithStatus(options?: { maxArticles?: number }): Promise<NewsFetchResult> {
  const { maxArticles = 40 } = options || {};
  const results = await Promise.allSettled(NEWS_SOURCES.map((source) => fetchSource(source)));
  const articles = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const failedSources = results.flatMap((result, index) => {
    if (result.status === "fulfilled") {
      return [];
    }

    const reason = result.reason instanceof Error ? result.reason.message : "Unknown feed failure";
    return [{ source: NEWS_SOURCES[index], message: reason }];
  });
  const loadedSources = results.flatMap((result, index) => (result.status === "fulfilled" ? [NEWS_SOURCES[index].name] : []));

  const recent = articles.filter(isRecentEnough);
  const pool = recent.length >= 8 ? recent : articles;

  return {
    articles: sortArticles(deduplicateArticles(pool)).slice(0, maxArticles),
    failedSources,
    loadedSources,
  };
}

export function deriveNewsQuery(request: string) {
  const normalized = request
    .replace(/\b(what's|whats|what is|show me|give me|tell me|find me|can you)\b/gi, " ")
    .replace(/\b(show|give|tell|find|get|pull)\b/gi, " ")
    .replace(/\b(latest|current|recent|today(?:'s)?|headline(?:s)?|news|update(?:s)?)\b/gi, " ")
    .replace(/\b(about|on|for|regarding)\b/gi, " ")
    .replace(/[?!.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const cleaned = normalized.replace(/^the\s+/i, "").trim();
  return cleaned.toLowerCase() === "the" ? "" : cleaned.toLowerCase();
}

export async function fetchNewsForQuery(query: string, maxArticles = 18) {
  const allArticles = await fetchAllNews({ maxArticles: 80 });
  const terms = queryTerms(query);

  if (terms.length === 0) {
    return allArticles.slice(0, maxArticles);
  }

  const ranked = allArticles
    .map((article) => ({ article, score: scoreArticleForQuery(article, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.article);

  return ranked.slice(0, maxArticles);
}

export async function fetchNewsForQueryWithStatus(query: string, maxArticles = 18): Promise<NewsFetchResult> {
  const result = await fetchAllNewsWithStatus({ maxArticles: 80 });
  const terms = queryTerms(query);

  if (terms.length === 0) {
    return {
      ...result,
      articles: result.articles.slice(0, maxArticles),
    };
  }

  const ranked = result.articles
    .map((article) => ({ article, score: scoreArticleForQuery(article, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.article);

  return {
    ...result,
    articles: ranked.slice(0, maxArticles),
  };
}

export function buildNewsReasoningContext(articles: NewsArticle[], query?: string, limit = 5) {
  return articles.slice(0, limit).map((article, index) => {
    const contentSnippet = summarizeText(article.contentText || article.description, 1200);
    return [
      `${index + 1}. ${article.title}`,
      `Source: ${article.source} (${article.sourceBias}, ${article.sourceType})`,
      `Published: ${article.pubDate}`,
      `Direct article: ${article.directArticleUrl}`,
      article.primarySourceUrl ? `Primary source: ${article.primarySourceUrl}` : "Primary source: none found in current metadata",
      query ? `User topic: ${query}` : null,
      `Summary: ${article.description}`,
      `Article body excerpt: ${contentSnippet}`,
    ]
      .filter(Boolean)
      .join("\n");
  }).join("\n\n---\n\n");
}
