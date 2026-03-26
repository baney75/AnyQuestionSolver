/**
 * Merriam-Webster Word of the Day service.
 * Uses rss2json first for speed, then falls back to the official RSS feed when needed.
 */

import { fetchFeedXml, stripHtml } from "./rss";

const WOTD_FEED_URL = "https://www.merriam-webster.com/wotd/feed/rss2";
const RSS2JSON_API = "https://api.rss2json.com/v1/api.json";
const CACHE_TTL_MS = 1000 * 60 * 60;
const WOTD_FETCH_TIMEOUT_MS = 10_000;

export interface WordOfTheDay {
  word: string;
  phonetic?: string;
  partOfSpeech?: string;
  definition: string;
  example?: string;
  didYouKnow?: string;
  date: string;
  audioUrl?: string;
  sourceUrl: string;
}

let cachedWotd: WordOfTheDay | null = null;
let cacheTime = 0;

function normalizeWhitespace(value: string) {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstMatch(value: string, regex: RegExp) {
  const match = value.match(regex);
  return match?.[1] ? normalizeWhitespace(match[1]) : undefined;
}

function extractXmlTag(xml: string, tagName: string) {
  const escaped = tagName.replace(":", "\\:");
  return extractFirstMatch(xml, new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
}

function extractXmlAttribute(xml: string, tagName: string, attribute: string) {
  const escaped = tagName.replace(":", "\\:");
  return extractFirstMatch(
    xml,
    new RegExp(`<${escaped}[^>]*\\b${attribute}=["']([^"']+)["'][^>]*\\/?>`, "i"),
  );
}

function extractDefinitionFromHtml(html: string, fallbackWord: string) {
  const shortDef = extractFirstMatch(html, /<merriam:shortdef><!\[CDATA\[(.*?)\]\]><\/merriam:shortdef>/i);
  if (shortDef) {
    return shortDef;
  }

  const paragraphs = html.match(/<p[\s\S]*?<\/p>/gi) || [];
  for (const paragraph of paragraphs) {
    const text = stripHtml(paragraph);
    const normalized = normalizeWhitespace(text);
    if (
      !normalized ||
      normalized.includes("Word of the Day") ||
      normalized.startsWith("Examples:") ||
      normalized.startsWith("Did you know?") ||
      normalized.startsWith("See the entry") ||
      normalized.startsWith("//") ||
      normalized.includes("\\") ||
      normalized.length < 20
    ) {
      continue;
    }

    return normalized;
  }

  return `${fallbackWord} is Merriam-Webster's featured word for today.`;
}

function extractExampleFromHtml(html: string) {
  const slashExample = extractFirstMatch(html, /\/\/\s*([\s\S]*?)<\/p>/i);
  if (slashExample) {
    return stripHtml(slashExample).replace(/^["“]|["”]$/g, "").trim();
  }

  const quotedExample = extractFirstMatch(html, /Examples:<\/strong><br\s*\/?>\s*<p>(.*?)<\/p>/i);
  if (quotedExample) {
    return stripHtml(quotedExample).replace(/^["“]|["”]$/g, "").trim();
  }

  return undefined;
}

function extractDidYouKnowFromHtml(html: string) {
  const didYouKnow = extractFirstMatch(html, /Did you know\?<\/strong><br\s*\/?>\s*<p>([\s\S]*?)<\/p>/i);
  return didYouKnow ? stripHtml(didYouKnow) : undefined;
}

export function parseMerriamWotdXml(xml: string): WordOfTheDay {
  const itemXml = extractFirstMatch(xml, /<item>([\s\S]*?)<\/item>/i);
  if (!itemXml) {
    throw new Error("No word of the day found");
  }

  const word = extractXmlTag(itemXml, "title") || "Word of the Day";
  const link = extractXmlTag(itemXml, "link") || "https://www.merriam-webster.com/word-of-the-day";
  const pubDate = extractXmlTag(itemXml, "pubDate") || new Date().toISOString();
  const descriptionHtml = extractXmlTag(itemXml, "description") || "";
  const shortDef = extractXmlTag(itemXml, "merriam:shortdef");
  const phonetic = extractFirstMatch(descriptionHtml, /\\([^\\]+)\\/);
  const partOfSpeech =
    extractFirstMatch(descriptionHtml, /(?:•|&#149;)\s*<em>([^<]+)<\/em>/i) ||
    extractFirstMatch(descriptionHtml, /\\[^\\]+\\(?:&nbsp;|\s)*(?:•|&#149;)\s*<em>([^<]+)<\/em>/i);
  const definition = shortDef || extractDefinitionFromHtml(descriptionHtml, word);
  const example = extractExampleFromHtml(descriptionHtml);
  const didYouKnow = extractDidYouKnowFromHtml(descriptionHtml);
  const audioUrl = extractXmlAttribute(itemXml, "enclosure", "url");

  return {
    word,
    phonetic,
    partOfSpeech,
    definition,
    example,
    didYouKnow,
    date: pubDate,
    audioUrl,
    sourceUrl: link,
  };
}

interface Rss2JsonItem {
  title: string;
  pubDate: string;
  link: string;
  description: string;
  enclosure?: {
    link?: string;
  };
}

interface Rss2JsonResponse {
  status: string;
  items?: Rss2JsonItem[];
}

function parseFallbackJson(data: Rss2JsonResponse): WordOfTheDay {
  const item = data.items?.[0];
  if (!item) {
    throw new Error("No word of the day found");
  }

  const html = item.description || "";
  return {
    word: item.title?.trim() || "Word of the Day",
    phonetic: extractFirstMatch(html, /\\([^\\]+)\\/),
    partOfSpeech:
      extractFirstMatch(html, /(?:•|&#149;)\s*<em>([^<]+)<\/em>/i) ||
      extractFirstMatch(html, /\\[^\\]+\\(?:&nbsp;|\s)*(?:•|&#149;)\s*<em>([^<]+)<\/em>/i),
    definition: extractDefinitionFromHtml(html, item.title || "Word of the Day"),
    example: extractExampleFromHtml(html),
    didYouKnow: extractDidYouKnowFromHtml(html),
    date: item.pubDate || new Date().toISOString(),
    audioUrl: item.enclosure?.link,
    sourceUrl: item.link || "https://www.merriam-webster.com/word-of-the-day",
  };
}

async function fetchWordOfTheDayFromFeed() {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), WOTD_FETCH_TIMEOUT_MS);
    let data: Rss2JsonResponse;

    try {
      const response = await fetch(`${RSS2JSON_API}?rss_url=${encodeURIComponent(WOTD_FEED_URL)}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Failed to fetch word of the day");
      }

      data = await response.json();
    } finally {
      window.clearTimeout(timer);
    }

    if (data.status !== "ok") {
      throw new Error("Failed to fetch word of the day");
    }

    return parseFallbackJson(data);
  } catch (error) {
    const xml = await fetchFeedXml(WOTD_FEED_URL);
    return parseMerriamWotdXml(xml);
  }
}

export async function getWordOfTheDay(forceRefresh = false): Promise<WordOfTheDay> {
  const now = Date.now();
  if (!forceRefresh && cachedWotd && now - cacheTime < CACHE_TTL_MS) {
    return cachedWotd;
  }

  try {
    cachedWotd = await fetchWordOfTheDayFromFeed();
    cacheTime = now;
    return cachedWotd;
  } catch (error) {
    if (cachedWotd) {
      return cachedWotd;
    }

    throw error;
  }
}
