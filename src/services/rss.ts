/**
 * Lightweight RSS/Atom parsing + fetch fallbacks for client-side feeds.
 */

export interface RssLink {
  href: string;
  text: string;
}

export interface RssItem {
  title: string;
  link: string;
  description: string;
  contentHtml: string;
  contentText: string;
  links: RssLink[];
  pubDate?: string;
  author?: string;
  thumbnail?: string;
  source?: string;
  categories: string[];
}

export interface RssFeed {
  title: string;
  link: string;
  description?: string;
  items: RssItem[];
  source?: string;
}

const FETCH_TIMEOUT_MS = 16_000;
const CORS_PROXIES = [
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

export function looksLikeFeedResponse(value: string) {
  const trimmed = value.trimStart();
  if (!trimmed.startsWith("<")) {
    return false;
  }

  const head = trimmed.slice(0, 512).toLowerCase();
  if (head.includes("<!doctype html") || head.includes("<html")) {
    return false;
  }

  return /<(rss|feed|rdf:rdf)\b/i.test(trimmed);
}

function extractText(el: Element | null, tag: string): string {
  if (!el) return "";
  const node = el.querySelector(tag);
  return node?.textContent?.trim() || "";
}

function extractAttribute(el: Element | null, tag: string, attr: string): string {
  if (!el) return "";
  const node = el.querySelector(tag);
  return node?.getAttribute(attr) || "";
}

export function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2019;/gi, "'")
    .replace(/&#x2014;/gi, "—")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value: string, max = 320) {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 3).trimEnd()}...`;
}

function extractHtmlFromNode(item: Element): string {
  const preferredSelectors = [
    "content\\:encoded",
    "content",
    "summary",
    "description",
  ];

  for (const selector of preferredSelectors) {
    const node = item.querySelector(selector);
    if (node?.textContent?.trim()) {
      return node.textContent.trim();
    }
  }

  return "";
}

function extractLinksFromHtml(html: string): RssLink[] {
  const links: RssLink[] = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(regex)) {
    const href = match[1]?.trim();
    if (!href) {
      continue;
    }

    links.push({
      href,
      text: stripHtml(match[2] || ""),
    });
  }

  return links;
}

function extractThumbnail(item: Element, html: string): string | undefined {
  const enclosure = item.querySelector("enclosure[type^='image']");
  if (enclosure?.getAttribute("url")) {
    return enclosure.getAttribute("url") || undefined;
  }

  const mediaContent = item.querySelector("media\\:content, content");
  if (mediaContent?.getAttribute("url")) {
    return mediaContent.getAttribute("url") || undefined;
  }

  const mediaThumbnail = item.querySelector("media\\:thumbnail, thumbnail");
  if (mediaThumbnail?.getAttribute("url")) {
    return mediaThumbnail.getAttribute("url") || undefined;
  }

  const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  return undefined;
}

export function parseRss(xml: string, sourceName?: string): RssFeed {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const items: RssItem[] = [];

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid RSS/Atom feed");
  }

  const channelEl = doc.querySelector("channel") || doc.documentElement;
  const channel = channelEl as Element;
  const feedTitle = extractText(channel, "title") || sourceName || "Feed";
  const feedLink = extractText(channel, "link") || "";
  const feedDescription = extractText(channel, "description");

  const itemElements = doc.querySelectorAll("item, entry");

  itemElements.forEach((item) => {
    const title = extractText(item, "title");
    const link =
      extractAttribute(item, "link", "href") ||
      item.querySelector("link")?.textContent?.trim() ||
      extractText(item, "link");
    const contentHtml = extractHtmlFromNode(item);
    const contentText = stripHtml(contentHtml);
    const description = truncateText(contentText);
    const links = extractLinksFromHtml(contentHtml);

    const pubDate =
      extractText(item, "pubDate") ||
      extractText(item, "published") ||
      extractText(item, "updated") ||
      extractText(item, "dc\\:date");

    const author =
      extractText(item, "author") ||
      extractText(item, "dc\\:creator") ||
      extractText(item, "creator");

    const thumbnail = extractThumbnail(item, contentHtml);
    const categories = [...item.querySelectorAll("category")]
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean);

    if (title && link) {
      items.push({
        title,
        link,
        description,
        contentHtml,
        contentText,
        links,
        pubDate,
        author,
        thumbnail,
        source: sourceName,
        categories,
      });
    }
  });

  return { title: feedTitle, link: feedLink, description: feedDescription, items, source: sourceName };
}

async function fetchTextWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchFeedXml(url: string) {
  let lastError: unknown;

  for (const buildUrl of CORS_PROXIES) {
    try {
      const xml = await fetchTextWithTimeout(buildUrl(url));
      if (looksLikeFeedResponse(xml)) {
        return xml;
      }
      lastError = new Error("Non-XML response");
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch feed");
}

export async function fetchFeed(url: string, sourceName?: string): Promise<RssFeed> {
  const xml = await fetchFeedXml(url);
  return parseRss(xml, sourceName);
}
