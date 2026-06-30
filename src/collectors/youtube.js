import { XMLParser } from 'fast-xml-parser';
import { SOURCES } from '../constants.js';
import { fetchText } from '../utils/http.js';
import { inferCategory, inferYouTubeType } from '../utils/category.js';
import { stripHtml, truncate, compactTitle } from '../utils/text.js';
import { makeFeedItem } from './item.js';

const CHANNEL_URL = 'https://www.youtube.com/@resonanceKR';
const CHANNEL_HANDLE = 'resonanceKR';

let cachedRssUrl = null;

export async function fetchYouTubePage() {
  const rssUrl = await getRssUrl();
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
  const items = entries.map((entry) => normalizeYouTubeRssEntry(entry, source));
  logYouTubeMetadata('rss', items);
  return {
    items,
    nextCursor: null
  };
}

export function normalizeYouTubeRssEntry(entry, source = SOURCES.YOUTUBE) {
  const videoId = extractVideoId(entry);
  const url = getLink(entry?.link) || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : CHANNEL_URL);
  const title = compactTitle(firstUsableText(entry?.title, entry?.['media:group']?.['media:title']), videoId ? `YouTube video ${videoId}` : 'YouTube video');
  const description = readText(entry?.['media:group']?.['media:description'])
    || readText(entry?.summary)
    || readText(entry?.content)
    || '';
  const summary = truncate(stripHtml(description), 480);
  const publishedAt = normalizeDate(entry?.published) || normalizeDate(entry?.updated);
  const thumbnailUrl = getThumbnailUrl(entry?.['media:group']?.['media:thumbnail']);

  return makeFeedItem({
    source: source.source,
    sourceLabel: source.label,
    sourceItemId: videoId || url,
    type: inferYouTubeType(title, url),
    category: inferCategory(title, summary),
    title,
    summary,
    url,
    publishedAt,
    author: readText(entry?.author?.name) || source.label,
    boardName: CHANNEL_HANDLE,
    attachments: {
      imageCount: thumbnailUrl ? 1 : 0,
      hasVideo: true
    },
    raw: {
      ...entry,
      parserUsed: 'rss',
      thumbnailUrl
    }
  });
}

async function fetchYouTubeVideosFallback(cause) {
  const html = await fetchText(`${CHANNEL_URL}/videos`, {
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  const source = SOURCES.YOUTUBE;
  const videos = extractVideosFromInitialData(html).slice(0, 30);
  const items = await Promise.all(videos.map(async (video) => {
    const videoId = video.videoId;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const watchMeta = await fetchWatchPageMeta(videoId);
    const title = compactTitle(firstUsableText(watchMeta.title, video.title), `YouTube video ${videoId}`);
    const fallbackDescription = stripHtml(watchMeta.description || video.description || '');
    const publishedAt = normalizeDate(watchMeta.publishedAt) || normalizeRelativeKoreanDate(video.relativeDate);
    return makeFeedItem({
      source: source.source,
      sourceLabel: source.label,
      sourceItemId: videoId,
      type: inferYouTubeType(title, url),
      category: inferCategory(title, fallbackDescription),
      title,
      summary: truncate(fallbackDescription, 480),
      url,
      publishedAt,
      author: watchMeta.author || source.label,
      boardName: CHANNEL_HANDLE,
      attachments: {
        imageCount: video.thumbnailUrl ? 1 : 0,
        hasVideo: true
      },
      raw: {
        videoId,
        parserUsed: 'html-fallback',
        fallbackTitle: video.title,
        fallbackRelativeTime: video.relativeDate,
        fallbackDescription,
        thumbnailUrl: video.thumbnailUrl,
        fallback: 'channel-videos-html',
        rssError: cause.message,
        watchMeta
      }
    });
  }));
  logYouTubeMetadata('html-fallback', items);
  return {
    items,
    nextCursor: null
  };
}

async function getRssUrl() {
  if (cachedRssUrl) return cachedRssUrl;
  const html = await fetchText(CHANNEL_URL, {
    headers: {
      accept: 'text/html,application/xhtml+xml'
    }
  });
  const rssUrl = html.match(/"rssUrl":"([^"]+)"/)?.[1]?.replace(/\\u0026/g, '&');
  if (rssUrl) {
    cachedRssUrl = rssUrl;
    return cachedRssUrl;
  }

  const candidates = [
    html.match(/<meta itemprop="channelId" content="(UC[^"]+)"/)?.[1],
    html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)"/)?.[1],
    html.match(/"externalId":"(UC[^"]+)"/)?.[1],
    html.match(/"channelId":"(UC[^"]+)"/)?.[1]
  ].filter(Boolean);
  const channelId = candidates[0];
  if (!channelId) {
    throw new Error('YouTube channelId not found from @resonanceKR page');
  }
  cachedRssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  return cachedRssUrl;
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

function readText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text'];
    if (typeof value.content === 'string') return value.content;
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.runs)) return value.runs.map((run) => readText(run?.text)).filter(Boolean).join('');
  }
  return '';
}

function firstUsableText(...values) {
  for (const value of values) {
    const text = stripHtml(readText(value));
    if (text && !/^\d+$/.test(text)) return text;
  }
  return '';
}

function extractVideoId(entry) {
  const fromField = readText(entry?.['yt:videoId'] || entry?.videoId);
  if (fromField) return fromField;
  const link = getLink(entry?.link);
  if (link) {
    try {
      const parsed = new URL(link);
      const videoId = parsed.searchParams.get('v');
      if (videoId) return videoId;
    } catch {
      const match = link.match(/[?&]v=([^&]+)/);
      if (match) return match[1];
    }
  }
  const id = readText(entry?.id);
  return id.split(':').pop() || null;
}

function getThumbnailUrl(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(getThumbnailUrl).find(Boolean) || null;
  if (typeof value === 'object') return value['@_url'] || value.url || null;
  return null;
}

function logYouTubeMetadata(parserUsed, items) {
  const item = items[0] || null;
  const titlePresent = Boolean(item?.title && !/^\d+$/.test(item.title));
  const publishedAtPresent = Boolean(item?.publishedAt);
  const descriptionLength = item?.summary?.length || 0;
  console.log(`YOUTUBE metadata parserUsed=${parserUsed} titlePresent=${titlePresent} publishedAtPresent=${publishedAtPresent} descriptionLength=${descriptionLength}`);
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
    const description = html.match(/<meta name="description" content="([^"]*)"/)?.[1]
      || html.match(/"shortDescription":"((?:\\.|[^"])*)"/)?.[1]
      || null;
    const publishedAt = html.match(/itemprop="datePublished" content="([^"]+)"/)?.[1]
      || html.match(/"publishDate":"([^"]+)"/)?.[1]
      || html.match(/"uploadDate":"([^"]+)"/)?.[1]
      || null;
    const author = html.match(/"ownerChannelName":"([^"]+)"/)?.[1] || null;
    return {
      title: title ? decodeJsonString(title) : null,
      description: description ? decodeJsonString(description) : null,
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
