import { XMLParser } from 'fast-xml-parser';
import { SOURCES } from '../constants.js';
import { fetchText } from '../utils/http.js';
import { inferCategory, inferYouTubeType } from '../utils/category.js';
import { stripHtml, truncate, compactTitle } from '../utils/text.js';
import { makeFeedItem } from './item.js';

const CHANNEL_URL = 'https://www.youtube.com/@resonanceKR';

let cachedChannelId = null;

export async function fetchYouTubePage() {
  const channelId = await getChannelId();
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let entries = [];
  try {
    const xml = await fetchText(rssUrl, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });
    const parsed = parser.parse(xml);
    entries = asArray(parsed?.feed?.entry);
  } catch (error) {
    return fetchYouTubeVideosFallback(error);
  }

  if (entries.length === 0) {
    return fetchYouTubeVideosFallback(new Error('YouTube RSS returned no entries'));
  }

  const source = SOURCES.YOUTUBE;
  return {
    items: entries.map((entry) => {
      const videoId = entry?.['yt:videoId'] || entry?.videoId || entry?.id?.split(':').pop();
      const title = compactTitle(entry?.title, 'YouTube video');
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : getLink(entry?.link) || CHANNEL_URL;
      const summary = truncate(stripHtml(entry?.['media:group']?.['media:description'] || entry?.summary || ''), 480);
      return makeFeedItem({
        source: source.source,
        sourceLabel: source.label,
        sourceItemId: videoId || url,
        type: inferYouTubeType(title, url),
        category: inferCategory(title, summary),
        title,
        summary,
        url,
        publishedAt: normalizeDate(entry?.published),
        author: entry?.author?.name || source.label,
        boardName: null,
        attachments: {
          imageCount: entry?.['media:group']?.['media:thumbnail'] ? 1 : 0,
          hasVideo: true
        },
        raw: entry
      });
    }),
    nextCursor: null
  };
}

async function fetchYouTubeVideosFallback(cause) {
  const html = await fetchText(`${CHANNEL_URL}/videos`, {
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  const source = SOURCES.YOUTUBE;
  const videos = extractVideosFromInitialData(html).slice(0, 30);
  return {
    items: await Promise.all(videos.map(async (video) => {
      const videoId = video.videoId;
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const watchMeta = await fetchWatchPageMeta(videoId);
      const title = watchMeta.title || video.title || `YouTube video ${videoId}`;
      const publishedAt = normalizeDate(watchMeta.publishedAt) || normalizeRelativeKoreanDate(video.relativeDate);
      return makeFeedItem({
        source: source.source,
        sourceLabel: source.label,
        sourceItemId: videoId,
        type: inferYouTubeType(title, url),
        category: inferCategory(title),
        title,
        summary: truncate(video.relativeDate ? `YouTube fallback: ${video.relativeDate}` : `YouTube RSS fallback: ${cause.message}`, 240),
        url,
        publishedAt,
        author: watchMeta.author || source.label,
        boardName: null,
        attachments: {
          imageCount: video.thumbnailUrl ? 1 : 0,
          hasVideo: true
        },
        raw: {
          videoId,
          title: video.title,
          relativeDate: video.relativeDate,
          thumbnailUrl: video.thumbnailUrl,
          fallback: 'channel-videos-html',
          rssError: cause.message,
          watchMeta
        }
      });
    })),
    nextCursor: null
  };
}

async function getChannelId() {
  if (cachedChannelId) return cachedChannelId;
  const html = await fetchText(CHANNEL_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  const match = html.match(/"channelId":"(UC[^"]+)"/)
    || html.match(/"externalId":"(UC[^"]+)"/)
    || html.match(/<meta itemprop="channelId" content="(UC[^"]+)"/)
    || html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)"/);
  if (!match) {
    const candidates = [...new Set([...html.matchAll(/\b(UC[a-zA-Z0-9_-]{22})\b/g)].map((entry) => entry[1]))];
    for (const candidate of candidates) {
      if (await rssExists(candidate)) {
        cachedChannelId = candidate;
        return cachedChannelId;
      }
    }
    throw new Error('YouTube channelId not found from @resonanceKR page');
  }
  cachedChannelId = match[1];
  return cachedChannelId;
}

async function rssExists(channelId) {
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: {
        accept: 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    return xml.includes('<feed') && xml.includes('<entry');
  } catch {
    return false;
  }
}

function getLink(link) {
  if (!link) return null;
  if (typeof link === 'string') return link;
  if (Array.isArray(link)) return link.find((item) => item?.['@_href'])?.['@_href'] ?? null;
  return link?.['@_href'] ?? null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeDate(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
  } catch {
    return value.replace(/\\u0026/g, '&').replace(/\\"/g, '"');
  }
}

function extractVideosFromInitialData(html) {
  const data = extractInitialData(html);
  const videos = [];
  const seen = new Set();

  walk(data, (value) => {
    const lockup = value?.lockupViewModel;
    if (!lockup?.contentId || seen.has(lockup.contentId)) return;
    const title = lockup.metadata?.lockupMetadataViewModel?.title?.content;
    const rows = lockup.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows || [];
    const metadataParts = rows.flatMap((row) => row.metadataParts || []);
    const relativeDate = metadataParts
      .map((part) => part.text?.accessibilityLabel || part.text?.content)
      .find((text) => /전$|ago$/i.test(String(text || '')));
    const thumbnailUrl = lockup.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url || null;
    seen.add(lockup.contentId);
    videos.push({
      videoId: lockup.contentId,
      title,
      relativeDate,
      thumbnailUrl
    });
  });

  if (videos.length > 0) return videos;
  return [...new Set([...html.matchAll(/"videoId":"([^"]+)"/g)].map((match) => match[1]))]
    .map((videoId) => ({ videoId, title: null, relativeDate: null, thumbnailUrl: null }));
}

function extractInitialData(html) {
  const marker = 'var ytInitialData = ';
  let index = html.indexOf(marker);
  if (index < 0) return null;
  index += marker.length;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = index; i < html.length; i += 1) {
    const char = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(html.slice(index, end));
  } catch {
    return null;
  }
}

function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  for (const item of Object.values(value)) walk(item, visit);
}

async function fetchWatchPageMeta(videoId) {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      headers: {
        accept: 'text/html,application/xhtml+xml'
      }
    });
    const title = html.match(/<meta name="title" content="([^"]+)"/)?.[1]
      || html.match(/"title":"([^"]+)"/)?.[1]
      || null;
    const publishedAt = html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1]
      || html.match(/"publishDate":"([^"]+)"/)?.[1]
      || html.match(/"uploadDate":"([^"]+)"/)?.[1]
      || null;
    const author = html.match(/"ownerChannelName":"([^"]+)"/)?.[1] || null;
    return {
      title: title ? decodeJsonString(title) : null,
      publishedAt,
      author: author ? decodeJsonString(author) : null
    };
  } catch (error) {
    return { error: error.message };
  }
}

function normalizeRelativeKoreanDate(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/(\d+)\s*(분|시간|일|주|개월|년)\s*전/);
  if (!match) return null;
  const amount = Number(match[1]);
  const date = new Date();
  const unit = match[2];
  if (unit === '분') date.setMinutes(date.getMinutes() - amount);
  if (unit === '시간') date.setHours(date.getHours() - amount);
  if (unit === '일') date.setDate(date.getDate() - amount);
  if (unit === '주') date.setDate(date.getDate() - amount * 7);
  if (unit === '개월') date.setMonth(date.getMonth() - amount);
  if (unit === '년') date.setFullYear(date.getFullYear() - amount);
  return date.toISOString();
}
