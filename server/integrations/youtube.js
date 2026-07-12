const { XMLParser } = require("fast-xml-parser");

const RSS_TTL_MS = 15 * 60 * 1000;
const CHANNEL_MAPPING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com"]);

class YouTubeSyncError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class RequestThrottle {
  constructor(minIntervalMs = 2000) {
    this.minIntervalMs = minIntervalMs;
    this.nextAt = 0;
    this.chain = Promise.resolve();
  }

  schedule(task) {
    const run = async () => {
      const waitMs = Math.max(0, this.nextAt - Date.now());
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextAt = Date.now() + this.minIntervalMs;
      return task();
    };
    const result = this.chain.then(run, run);
    this.chain = result.catch(() => {});
    return result;
  }
}

function createYouTubeClient({ fetchImpl = globalThis.fetch, mappingStore, throttle = new RequestThrottle(), now = () => Date.now(), timeoutMs = 10000 } = {}) {
  const rssCache = new Map();
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, trimValues: true });

  async function syncCreator(creator) {
    const youtubeUrl = creator.youtubeUrl || (creator.platform === "YouTube" ? creator.url : "");
    if (!youtubeUrl) {
      if (["TikTok", "Twitch", "X", "X/Twitter"].includes(creator.platform)) {
        throw new YouTubeSyncError("manual", "Manual Update Required");
      }
      throw new YouTubeSyncError("invalid_url", "YouTube channel URL is missing.");
    }
    const channel = parseYouTubeChannelUrl(youtubeUrl);
    const channelId = channel.channelId || await resolveHandle(channel, youtubeUrl);
    const feed = await fetchFeed(channelId);
    return { ...feed, channelId };
  }

  async function resolveHandle(channel, originalUrl) {
    const cached = await mappingStore?.get(channel.cacheKey);
    const resolvedAt = cached?.resolved_at ? Date.parse(cached.resolved_at) : 0;
    if (cached?.channel_id && CHANNEL_ID_PATTERN.test(cached.channel_id) && resolvedAt > now() - CHANNEL_MAPPING_TTL_MS) return cached.channel_id;
    const response = await request(originalUrl, "text/html");
    const html = await limitedText(response);
    const channelId = extractChannelIdFromHtml(html);
    if (!channelId) throw new YouTubeSyncError("channel_not_found", "Channel not found.");
    await mappingStore?.set(channel.cacheKey, channelId);
    return channelId;
  }

  async function fetchFeed(channelId) {
    const cached = rssCache.get(channelId);
    if (cached && cached.expiresAt > now()) return cached.value;
    const response = await request(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, "application/atom+xml");
    const xml = await limitedText(response);
    const value = parseYouTubeFeed(xml, parser);
    rssCache.set(channelId, { value, expiresAt: now() + RSS_TTL_MS });
    return value;
  }

  async function request(url, accept) {
    return throttle.schedule(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { headers: { Accept: accept, "User-Agent": "NSAP-Creator-Manager/1.0" }, redirect: "follow", signal: controller.signal });
        if (response.status === 404) throw new YouTubeSyncError("channel_not_found", "Channel not found.");
        if (!response.ok) throw new YouTubeSyncError("rss_unavailable", `YouTube RSS unavailable (${response.status}).`);
        return response;
      } catch (error) {
        if (error.name === "AbortError") throw new YouTubeSyncError("timeout", "YouTube request timed out.");
        if (error instanceof YouTubeSyncError) throw error;
        throw new YouTubeSyncError("rss_unavailable", "YouTube RSS unavailable.");
      } finally { clearTimeout(timeout); }
    });
  }

  return { syncCreator, clearCache: () => rssCache.clear() };
}

function parseYouTubeChannelUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new YouTubeSyncError("invalid_url", "Invalid YouTube channel URL."); }
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) throw new YouTubeSyncError("invalid_url", "Invalid YouTube channel URL.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length === 2 && parts[0] === "channel" && CHANNEL_ID_PATTERN.test(parts[1])) return { channelId: parts[1], cacheKey: `channel:${parts[1]}` };
  if (parts.length === 1 && parts[0].startsWith("@") && parts[0].length > 1) return { handle: decodeURIComponent(parts[0]), cacheKey: `handle:${decodeURIComponent(parts[0]).toLowerCase()}` };
  throw new YouTubeSyncError("invalid_url", "Unsupported YouTube channel URL.");
}

function extractChannelIdFromHtml(html) {
  const patterns = [
    /feeds\/videos\.xml\?channel_id=(UC[A-Za-z0-9_-]{22})/i,
    /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    /"browseId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    /<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/channel\/(UC[A-Za-z0-9_-]{22})/i,
    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{22})/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function parseYouTubeFeed(xml, parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, trimValues: true })) {
  let parsed;
  try { parsed = parser.parse(xml); } catch { throw new YouTubeSyncError("rss_unavailable", "YouTube RSS could not be parsed."); }
  const entries = parsed?.feed?.entry ? (Array.isArray(parsed.feed.entry) ? parsed.feed.entry : [parsed.feed.entry]) : [];
  if (!entries.length) throw new YouTubeSyncError("no_uploads", "No uploads found.");
  const newest = entries
    .map((entry) => ({
      title: String(entry.title || "Untitled video"),
      published: String(entry.published || ""),
      videoId: String(entry.videoId || ""),
      url: getAtomLink(entry.link) || (entry.videoId ? `https://www.youtube.com/watch?v=${entry.videoId}` : ""),
    }))
    .filter((entry) => !Number.isNaN(Date.parse(entry.published)))
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))[0];
  if (!newest) throw new YouTubeSyncError("no_uploads", "No uploads found.");
  return { lastUploadDate: newest.published.slice(0, 10), latestVideoTitle: newest.title, latestVideoUrl: newest.url };
}

function getAtomLink(link) {
  const links = Array.isArray(link) ? link : link ? [link] : [];
  return links.find((item) => item?.["@_rel"] === "alternate")?.["@_href"] || links.find((item) => item?.["@_href"])?.["@_href"] || "";
}

async function limitedText(response) {
  const length = Number(response.headers?.get?.("content-length") || 0);
  if (length > 2_000_000) throw new YouTubeSyncError("rss_unavailable", "YouTube response was too large.");
  return (await response.text()).slice(0, 2_000_000);
}

module.exports = { RequestThrottle, YouTubeSyncError, createYouTubeClient, extractChannelIdFromHtml, parseYouTubeChannelUrl, parseYouTubeFeed };
