import { makeFeedItemId } from '../utils/hash.js';

export function makeFeedItem({
  source,
  sourceLabel,
  sourceItemId,
  type = 'unknown',
  category = '기타',
  title,
  summary = '',
  url,
  publishedAt = null,
  author = null,
  boardName = null,
  attachments = {},
  raw = null,
  pinned = false
}) {
  const collectedAt = new Date().toISOString();
  return {
    id: makeFeedItemId(source, sourceItemId, url),
    source,
    sourceLabel,
    sourceItemId: sourceItemId ?? null,
    type,
    category,
    title,
    summary,
    url,
    publishedAt,
    author,
    boardName,
    attachments: {
      imageCount: attachments.imageCount ?? 0,
      hasVideo: Boolean(attachments.hasVideo)
    },
    collectedAt,
    notifiedAt: null,
    status: 'new',
    raw,
    pinned: Boolean(pinned)
  };
}
