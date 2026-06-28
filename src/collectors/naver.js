import { config } from '../config.js';
import { SOURCES } from '../constants.js';
import { fetchJson } from '../utils/http.js';
import { inferCategory } from '../utils/category.js';
import { compactTitle, stripHtml, truncate } from '../utils/text.js';
import { makeFeedItem } from './item.js';

const PROFILE_ID = '777ff8c47a8bcd406196c695e959ac7a';
const LOUNGE_ID = 'RES';
const BASE = 'https://m.game.naver.com';
const API_BASE_V1 = 'https://comm-api.game.naver.com/nng_main/v1';
const API_BASE_V2 = 'https://comm-api.game.naver.com/nng_main/v2';

export async function fetchNaverPage({ cursor }) {
  const attempts = buildNaverApiUrls(cursor);
  const errors = [];

  for (const url of attempts) {
    try {
      const json = await fetchJson(url, {
        referer: `${BASE}/profile/${PROFILE_ID}/${LOUNGE_ID}#feed`,
        headers: {
          'x-requested-with': 'XMLHttpRequest'
        }
      });
      const items = normalizeNaverItems(json);
      if (items.length > 0) {
        return {
          items,
          nextCursor: findNaverNextCursor(json, items)
        };
      }
      errors.push(`${url}: no feed items`);
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  if (config.enablePlaywrightFallback) {
    return fetchNaverWithPlaywright();
  }

  throw new Error(`Naver feed API candidates failed. ${errors.slice(0, 5).join(' | ')}`);
}

function buildNaverApiUrls(cursor) {
  if (cursor) {
    const offset = Number(cursor);
    const feedId = encodeURIComponent(String(cursor).replace(/^exclude:/, ''));
    if (Number.isFinite(offset)) {
      return [
        `${API_BASE_V1}/community/lounge/${LOUNGE_ID}/feed?offset=${offset}&limit=20&order=NEW&buffFilteringYN=N`
      ];
    }
    return [
      `${API_BASE_V1}/profile/user/feeds/${PROFILE_ID}/loungeFirst?limit=20&excludeFeedIds=${feedId}&loungeId=${LOUNGE_ID}`,
      `${API_BASE_V1}/community/lounge/${LOUNGE_ID}/feed?offset=20&limit=20&order=NEW&buffFilteringYN=N`
    ];
  }
  return [
    `${API_BASE_V1}/profile/user/feeds/${PROFILE_ID}/loungeFirst?limit=20&loungeId=${LOUNGE_ID}`,
    `${API_BASE_V1}/community/lounge/${LOUNGE_ID}/feed?offset=0&limit=20&order=NEW&buffFilteringYN=N`,
    `${API_BASE_V2}/user/${PROFILE_ID}/profile?loungeId=${LOUNGE_ID}`
  ];
}

function normalizeNaverItems(json) {
  const candidates = [
    json?.content,
    json?.contents,
    json?.data?.content,
    json?.data?.contents,
    json?.data?.feeds,
    json?.feeds,
    json?.result?.feeds,
    json?.result?.content,
    json?.result?.list
  ].find(Array.isArray) || deepFindFeedArrays(json)[0] || [];

  const source = SOURCES.NAVER_LOUNGE;
  return candidates
    .map((wrapper) => ({ wrapper, entry: wrapper?.feed || wrapper?.article || wrapper }))
    .filter(({ entry }) => entry && (entry.feedId || entry.articleId || entry.id || entry.url || entry.title || entry.content || entry.contents))
    .map(({ wrapper, entry }) => {
      const feedId = String(entry.feedId || entry.articleId || entry.id || entry.feedNo || entry.postId || entry.url);
      const contentText = extractNaverContentText(entry.contents || entry.content || entry.body || '');
      const titleText = entry.title || entry.subject || contentText;
      const summaryText = contentText || stripHtml(entry.description || '');
      const publishedAt = normalizeNaverDate(entry.createdAt || entry.createdDate || entry.regDate || entry.registeredAt || entry.writeDate);
      const detailUrl = wrapper?.feedLink?.mobile || entry.url || `${BASE}/lounge/${LOUNGE_ID}/board/detail/${feedId}`;
      const images = entry.images || entry.imageList || entry.image || entry.thumbnailImages || [];
      const media = entry.media || entry.video || entry.attachments || [];
      return makeFeedItem({
        source: source.source,
        sourceLabel: source.label,
        sourceItemId: feedId,
        type: hasVideo(media) || entry.attachIconType === 'VIDEO' ? 'video' : 'post',
        category: inferCategory(titleText, summaryText, entry.boardName),
        title: compactTitle(titleText, 'Naver lounge post'),
        summary: truncate(summaryText || (publishedAt ? '' : '작성시간 확인 불가'), 480),
        url: detailUrl,
        publishedAt,
        author: wrapper?.user?.nickname || entry.writerName || entry.nickname || entry.profileName || entry.writer?.name || source.label,
        boardName: wrapper?.board?.boardName || entry.boardName || entry.board?.name || null,
        attachments: {
          imageCount: entry.attachIconType === 'PHOTO' ? Math.max(entry.attachCount || 0, Array.isArray(images) ? images.length : images ? 1 : 0) : Array.isArray(images) ? images.length : images ? 1 : 0,
          hasVideo: hasVideo(media)
        },
        raw: entry,
        pinned: Boolean(entry.pinned || entry.pin || entry.fixed || entry.top || entry.notice)
      });
    });
}

function findNaverNextCursor(json, items) {
  const apiCursor = json?.nextCursor
    || json?.data?.nextCursor
    || json?.result?.nextCursor
    || json?.cursor
    || json?.data?.cursor;
  if (apiCursor) return apiCursor;

  if (items.length > 0) {
    return `exclude:${items.map((item) => item.sourceItemId).filter(Boolean).join(',')}`;
  }
  const content = json?.content || json?.data?.content || json?.result?.content;
  if (Number.isFinite(content?.offset) && Number.isFinite(content?.count) && content.count > 0) {
    return String(content.offset + content.count);
  }
  return null;
}

function deepFindFeedArrays(value, depth = 0) {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) {
    if (value.some((entry) => entry && typeof entry === 'object' && (entry.feedId || entry.articleId || entry.content))) return [value];
    return value.flatMap((entry) => deepFindFeedArrays(entry, depth + 1));
  }
  if (typeof value !== 'object') return [];
  return Object.values(value).flatMap((entry) => deepFindFeedArrays(entry, depth + 1));
}

function normalizeNaverDate(value) {
  if (!value) return null;
  if (typeof value === 'number') {
    const millis = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(millis).toISOString();
  }
  if (/^\d{14}$/.test(String(value))) {
    const text = String(value);
    const year = text.slice(0, 4);
    const month = text.slice(4, 6);
    const day = text.slice(6, 8);
    const hour = text.slice(8, 10);
    const minute = text.slice(10, 12);
    const second = text.slice(12, 14);
    const parsed = Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+09:00`);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function extractNaverContentText(value) {
  if (!value) return '';
  if (typeof value !== 'string') return stripHtml(String(value));
  const trimmed = value.trim();
  if (!trimmed.startsWith('{')) return stripHtml(trimmed);
  try {
    const parsed = JSON.parse(trimmed);
    const texts = [];
    walkContent(parsed, texts);
    return stripHtml(texts.join(' '));
  } catch {
    return stripHtml(trimmed);
  }
}

function walkContent(value, texts) {
  if (!value) return;
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    for (const item of value) walkContent(item, texts);
    return;
  }
  if (typeof value !== 'object') return;
  if (typeof value.value === 'string') texts.push(value.value);
  if (typeof value.text === 'string') texts.push(value.text);
  for (const child of Object.values(value)) walkContent(child, texts);
}

function hasVideo(value) {
  if (!value) return false;
  if (Array.isArray(value)) return value.some(hasVideo);
  if (typeof value === 'object') return Boolean(value.videoId || value.videoUrl || value.mediaType === 'VIDEO' || value.type === 'video');
  return /video|mp4|youtube/i.test(String(value));
}

async function fetchNaverWithPlaywright() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Playwright fallback requested but playwright is not installed');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: config.userAgent });
  try {
    await page.goto(`${BASE}/profile/${PROFILE_ID}/${LOUNGE_ID}#feed`, { waitUntil: 'networkidle', timeout: config.httpTimeoutMs });
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/lounge/RES/board/detail/"]')).slice(0, 20).map((link) => ({
        title: link.textContent?.trim() || 'Naver lounge post',
        url: link.href,
        feedId: link.href.split('/').pop()
      }));
    });
    const source = SOURCES.NAVER_LOUNGE;
    return {
      items: items.map((entry) => makeFeedItem({
        source: source.source,
        sourceLabel: source.label,
        sourceItemId: entry.feedId,
        type: 'post',
        category: inferCategory(entry.title),
        title: compactTitle(entry.title, 'Naver lounge post'),
        summary: '작성시간 확인 불가',
        url: entry.url,
        publishedAt: null,
        author: source.label,
        raw: entry
      })),
      nextCursor: null
    };
  } finally {
    await browser.close();
  }
}
