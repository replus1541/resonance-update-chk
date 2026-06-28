import { config } from '../config.js';

export async function collectUntilKnown(source, fetchPage, db, options = {}) {
  const newItems = [];
  let cursor = options.initialCursor ?? null;
  let pageCount = 0;
  let stopReason = 'completed';

  const maxPages = options.maxPages ?? config.maxPages;
  const maxNewItems = options.maxNewItems ?? config.maxNewItems;

  while (pageCount < maxPages && newItems.length < maxNewItems) {
    const page = await fetchPage({ cursor, page: pageCount + 1 });
    const items = page.items ?? [];
    pageCount += 1;

    if (items.length === 0) {
      stopReason = 'empty-page';
      break;
    }

    for (const item of items) {
      const exists = db.existsFeedItem({
        source,
        sourceItemId: item.sourceItemId,
        url: item.url
      });

      if (exists && !item.pinned) {
        stopReason = 'known-item';
        return { items: newItems, cursor, pageCount, stopReason };
      }

      if (!exists) {
        newItems.push(item);
        if (newItems.length >= maxNewItems) {
          stopReason = 'max-new-items';
          break;
        }
      }
    }

    if (newItems.length >= maxNewItems) break;
    if (!page.nextCursor) {
      stopReason = 'no-next-cursor';
      break;
    }

    cursor = page.nextCursor;
  }

  if (pageCount >= maxPages) stopReason = 'max-pages';
  return { items: newItems, cursor, pageCount, stopReason };
}

export function sortOldestFirst(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || a.collectedAt || '');
    const bTime = Date.parse(b.publishedAt || b.collectedAt || '');
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
    if (Number.isFinite(aTime) && !Number.isFinite(bTime)) return -1;
    if (!Number.isFinite(aTime) && Number.isFinite(bTime)) return 1;
    return String(a.url).localeCompare(String(b.url));
  });
}

export function newestItem(items) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.publishedAt || a.collectedAt || '');
    const bTime = Date.parse(b.publishedAt || b.collectedAt || '');
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  })[0] ?? null;
}
