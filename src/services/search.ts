const GOOGLE_API_KEY = import.meta.env.GOOGLE_API_KEY;
const SEARCH_API_KEY = GOOGLE_API_KEY || import.meta.env.GEMINI_API_KEY;
const SEARCH_ENGINE_ID = '017576662512468239146:2152321705'; // Public search engine ID
const SEARCH_REQUEST_TIMEOUT_MS = 10_000;
const JINA_FETCH_PREFIX = "https://r.jina.ai/http://";

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  image?: {
    url: string;
    width: number;
    height: number;
  };
}

export interface VideoResult {
  title: string;
  videoId: string;
  thumbnail: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
}

export interface SearchResponse {
  items: SearchResult[];
  totalResults: number;
  searchTime: number;
}

export interface VideoSearchResponse {
  items: VideoResult[];
  totalResults: number;
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
  pagemap?: {
    cse_image?: Array<{ src?: string; width?: number; height?: number }>;
  };
  image?: {
    width?: number;
    height?: number;
  };
}

interface YouTubeSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
    };
  };
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
  searchInformation?: {
    totalResults?: string;
    formattedSearchTime?: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  pageInfo?: {
    totalResults?: number;
  };
}

interface OpenverseImageItem {
  title?: string;
  url?: string;
  foreign_landing_url?: string;
  creator?: string;
  provider?: string;
  source?: string;
  width?: number;
  height?: number;
}

interface OpenverseImageResponse {
  results?: OpenverseImageItem[];
  result_count?: number;
}

interface WikipediaPage {
  title?: string;
  fullurl?: string;
  canonicalurl?: string;
  thumbnail?: {
    source?: string;
    width?: number;
    height?: number;
  };
}

interface WikipediaQueryResponse {
  query?: {
    pages?: Record<string, WikipediaPage>;
  };
}

const DIAGRAM_QUERY_HINT = /\b(diagram|chart|graph|plot|map|formula|equation|molecule|structure|schematic|infographic|logo|icon|flag|timeline|ui|interface)\b/i;
const PHOTO_QUERY_HINT = /\b(photo|photograph|portrait|headshot|cityscape|landscape|landmark|skyline|animal|person|building|campus|scene)\b/i;

async function fetchJsonWithTimeout<T>(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SEARCH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SEARCH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

function parseCaptionText(source: string) {
  if (!source.trim()) {
    return "";
  }

  const xmlSegments = [...source.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => match[1] ?? "")
    .map((segment) =>
      segment
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, "\"")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">"),
    );

  if (xmlSegments.length > 0) {
    return xmlSegments.join(" ");
  }

  const vttLines = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      line &&
      line !== "WEBVTT" &&
      !line.includes("-->") &&
      !/^\d+$/.test(line),
    );

  return vttLines.join(" ");
}

function buildSearchResponse(items: SearchResult[]): SearchResponse {
  return {
    items,
    totalResults: items.length,
    searchTime: 0,
  };
}

function extractYouTubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (pathParts[0] === "shorts" || pathParts[0] === "embed") {
        return pathParts[1] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeVideoSearchQuery(query: string) {
  return query
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(youtube|video|watch|clip|preview)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildVideoSearchCandidates(query: string) {
  const normalized = normalizeVideoSearchQuery(query) || query.trim();
  const compact = normalized.split(/\s+/).slice(0, 8).join(" ");
  return [...new Set([query.trim(), normalized, compact].filter(Boolean))];
}

function parseJinaYouTubeSearch(markdown: string, maxResults: number): VideoResult[] {
  const lines = markdown.split("\n");
  const items: VideoResult[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const titleMatch = lines[index]?.match(/^###\s+\[(.+?)\]\((https?:\/\/www\.youtube\.com\/watch\?v=[^) ]+)/);
    if (!titleMatch) {
      continue;
    }

    const title = titleMatch[1]?.trim();
    const url = titleMatch[2]?.trim();
    const videoId = extractYouTubeVideoId(url);

    if (!title || !videoId || seen.has(videoId)) {
      continue;
    }

    let channelTitle = "YouTube";
    let description = "";

    for (let offset = 1; offset <= 5 && index + offset < lines.length; offset += 1) {
      const candidate = lines[index + offset]?.trim();
      if (!candidate) {
        continue;
      }

      const channelMatch = candidate.match(/^\[(.+?)\]\((https?:\/\/www\.youtube\.com\/@[^)]+|https?:\/\/www\.youtube\.com\/channel\/[^)]+)\)$/);
      if (channelMatch) {
        channelTitle = channelMatch[1]?.trim() || channelTitle;
        continue;
      }

      if (!candidate.startsWith("###") && !candidate.startsWith("![")) {
        description = candidate.replace(/\s+/g, " ").trim();
        if (description) {
          break;
        }
      }
    }

    items.push({
      title,
      videoId,
      thumbnail: getYouTubeThumbnail(videoId, "high"),
      description,
      channelTitle,
      publishedAt: "",
    });
    seen.add(videoId);

    if (items.length >= maxResults) {
      break;
    }
  }

  return items;
}

async function fallbackVideoSearchViaJina(query: string, maxResults: number): Promise<VideoSearchResponse> {
  for (const candidate of buildVideoSearchCandidates(query)) {
    try {
      const url = `${JINA_FETCH_PREFIX}www.youtube.com/results?search_query=${encodeURIComponent(candidate)}`;
      const markdown = await fetchTextWithTimeout(url);
      const items = parseJinaYouTubeSearch(markdown, maxResults);
      if (items.length > 0) {
        return {
          items,
          totalResults: items.length,
        };
      }
    } catch {
      // keep trying shorter candidate queries
    }
  }

  return { items: [], totalResults: 0 };
}

async function fallbackImageSearch(query: string, numResults: number): Promise<SearchResponse> {
  if (SEARCH_API_KEY) {
    try {
      const webResults = await searchWeb(query, numResults);
      const imageItems = webResults.items.filter((item) => item.image?.url);
      if (imageItems.length > 0) {
        return buildSearchResponse(imageItems);
      }
    } catch {
      /* fall through to public sources */
    }
  }

  try {
    const params = new URLSearchParams({
      q: query,
      page_size: String(Math.min(numResults, 10)),
    });
    const data = await fetchJsonWithTimeout<OpenverseImageResponse>(`https://api.openverse.org/v1/images/?${params}`);
    const items = (data.results || [])
      .filter((item) => item.url)
      .map((item) => ({
        title: item.title || query,
        link: item.foreign_landing_url || item.url || "",
        snippet: item.creator ? `Creator: ${item.creator}` : "Openly licensed image",
        displayLink: item.provider || item.source || "openverse.org",
        image: {
          url: item.url || "",
          width: item.width || 0,
          height: item.height || 0,
        },
      }));

    if (items.length > 0) {
      return {
        items,
        totalResults: data.result_count || items.length,
        searchTime: 0,
      };
    }
  } catch {
    /* continue to Wikipedia fallback */
  }

  try {
    const params = new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: String(Math.min(numResults, 10)),
      prop: "pageimages|info",
      piprop: "thumbnail",
      pithumbsize: "1400",
      inprop: "url",
      format: "json",
      origin: "*",
    });
    const data = await fetchJsonWithTimeout<WikipediaQueryResponse>(`https://en.wikipedia.org/w/api.php?${params}`);
    const pages = Object.values(data.query?.pages || {});
    const items = pages
      .filter((page) => page.thumbnail?.source)
      .map((page) => ({
        title: page.title || query,
        link: page.fullurl || page.canonicalurl || page.thumbnail?.source || "",
        snippet: "Wikipedia image result",
        displayLink: "wikipedia.org",
        image: {
          url: page.thumbnail?.source || "",
          width: page.thumbnail?.width || 0,
          height: page.thumbnail?.height || 0,
        },
      }));

    if (items.length > 0) {
      return buildSearchResponse(items);
    }
  } catch {
    /* no fallback left */
  }

  return { items: [], totalResults: 0, searchTime: 0 };
}

async function fallbackVideoSearch(query: string, maxResults: number): Promise<VideoSearchResponse> {
  const jinaResults = await fallbackVideoSearchViaJina(query, maxResults);
  if (jinaResults.items.length > 0) {
    return jinaResults;
  }

  const webResults = await searchWeb(`site:youtube.com/watch ${query}`, Math.min(maxResults, 10));
  const deduped = new Map<string, VideoResult>();

  for (const item of webResults.items) {
    const videoId = extractYouTubeVideoId(item.link);
    if (!videoId || deduped.has(videoId)) {
      continue;
    }

    deduped.set(videoId, {
      title: item.title,
      videoId,
      thumbnail: getYouTubeThumbnail(videoId, "high"),
      description: item.snippet,
      channelTitle: item.displayLink,
      publishedAt: "",
    });
  }

  return {
    items: [...deduped.values()].slice(0, maxResults),
    totalResults: deduped.size,
  };
}

export async function searchWeb(query: string, numResults = 10): Promise<SearchResponse> {
  if (!SEARCH_API_KEY) {
    return { items: [], totalResults: 0, searchTime: 0 };
  }

  const params = new URLSearchParams({
    key: SEARCH_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query,
    num: String(Math.min(numResults, 10)),
    safe: 'active',
  });
  const data = await fetchJsonWithTimeout<GoogleSearchResponse>(`https://www.googleapis.com/customsearch/v1?${params}`);

  return {
    items: (data.items || []).map((item: GoogleSearchItem) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
      image: item.pagemap?.cse_image?.[0] ? {
        url: String(item.pagemap.cse_image[0].src || ''),
        width: item.pagemap.cse_image[0].width || 0,
        height: item.pagemap.cse_image[0].height || 0,
      } : undefined,
    })),
    totalResults: Number(data.searchInformation?.totalResults) || 0,
    searchTime: Number(data.searchInformation?.formattedSearchTime) || 0,
  };
}

export async function searchImages(query: string, numResults = 10): Promise<SearchResponse> {
  if (!SEARCH_API_KEY) {
    return fallbackImageSearch(query, numResults);
  }

  const isDiagramQuery = DIAGRAM_QUERY_HINT.test(query);
  const isPhotoQuery = PHOTO_QUERY_HINT.test(query) && !isDiagramQuery;
  const params = new URLSearchParams({
    key: SEARCH_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query,
    num: String(Math.min(numResults, 10)),
    safe: 'active',
    searchType: 'image',
    imgSize: 'large',
  });
  if (isPhotoQuery) {
    params.set("imgType", "photo");
  }

  let data: GoogleSearchResponse;
  try {
    data = await fetchJsonWithTimeout<GoogleSearchResponse>(`https://www.googleapis.com/customsearch/v1?${params}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("403") || message.includes("429")) {
      return fallbackImageSearch(query, numResults);
    }

    throw error;
  }

  const items = (data.items || []).map((item: GoogleSearchItem) => ({
    title: item.title,
    link: item.link,
    snippet: item.snippet,
    displayLink: item.displayLink,
    image: {
      url: item.link,
      width: item.image?.width || 0,
      height: item.image?.height || 0,
    },
  }));

  if (items.length > 0) {
    return {
      items,
      totalResults: Number(data.searchInformation?.totalResults) || 0,
      searchTime: Number(data.searchInformation?.formattedSearchTime) || 0,
    };
  }

  return fallbackImageSearch(query, numResults);
}

export async function searchVideos(query: string, maxResults = 10): Promise<VideoSearchResponse> {
  if (!SEARCH_API_KEY) {
    return fallbackVideoSearch(query, maxResults);
  }

  const params = new URLSearchParams({
    key: SEARCH_API_KEY,
    q: query,
    part: 'snippet',
    type: 'video',
    maxResults: String(Math.min(maxResults, 50)),
    safeSearch: 'moderate',
    videoEmbeddable: 'true',
  });

  let data: YouTubeSearchResponse;
  try {
    data = await fetchJsonWithTimeout<YouTubeSearchResponse>(`https://www.googleapis.com/youtube/v3/search?${params}`);
  } catch (error) {
    return fallbackVideoSearch(query, maxResults);
  }
  const items = (data.items || []).map((item: YouTubeSearchItem) => ({
    title: item.snippet.title,
    videoId: item.id.videoId,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
    description: item.snippet.description,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
  }));

  if (items.length > 0) {
    return {
      items,
      totalResults: data.pageInfo?.totalResults || 0,
    };
  }

  return fallbackVideoSearch(query, maxResults);
}

export function getYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

export function getYouTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function fetchYouTubeTranscriptPreview(videoId: string): Promise<string | null> {
  const captionUrls = [
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en&fmt=vtt`,
    `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=en`,
    `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=en`,
  ];

  for (const url of captionUrls) {
    try {
      const text = await fetchTextWithTimeout(url);
      const parsed = parseCaptionText(text).replace(/\s+/g, " ").trim();
      if (parsed) {
        return parsed;
      }
    } catch {
      // Browser CORS and caption availability vary by video; keep falling back.
    }
  }

  return null;
}

export function getYouTubeThumbnail(videoId: string, quality: 'default' | 'medium' | 'high' = 'medium'): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

export function getGoogleImageSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

export function getYouTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
