import assert from 'node:assert/strict';
import { collectUntilKnown, sortOldestFirst } from '../src/collectors/common.js';
import { processCollectedItems } from './check-updates.mjs';

const SOURCE = 'NAVER_LOUNGE';

await testCollectsAllNewItemsAndSendsOldestFirst();
await testFailedNotificationIsNotRemembered();

console.log('verify-new-items-fixture: ok');

async function testCollectsAllNewItemsAndSendsOldestFirst() {
  const sourceState = { baselineDone: true, knownKeys: ['A'] };
  const newestFirst = [feedItem('D', 4), feedItem('C', 3), feedItem('B', 2), feedItem('A', 1)];

  const collected = await collectUntilKnown(SOURCE, fixturePage(newestFirst), knownDb(sourceState), {
    maxPages: 1,
    maxNewItems: 10
  });

  assert.deepEqual(collected.items.map((item) => item.sourceItemId), ['D', 'C', 'B']);
  assert.equal(collected.stopReason, 'known-item');

  const orderedItems = sortOldestFirst(collected.items);
  assert.deepEqual(orderedItems.map((item) => item.sourceItemId), ['B', 'C', 'D']);

  const sentOrder = [];
  const processed = await processCollectedItems(sourceState, orderedItems, {
    notifyItem: async (item) => {
      sentOrder.push(item.sourceItemId);
      return { id: item.id, sent: true };
    }
  });

  assert.equal(processed.ok, true);
  assert.equal(processed.rememberedCount, 3);
  assert.deepEqual(sentOrder, ['B', 'C', 'D']);
  assert.deepEqual(sourceState.knownKeys, ['A', 'B', 'C', 'D']);
}

async function testFailedNotificationIsNotRemembered() {
  const sourceState = { baselineDone: true, knownKeys: ['A'] };
  const orderedItems = [feedItem('B', 2), feedItem('C', 3), feedItem('D', 4)];
  const sentOrder = [];

  const processed = await processCollectedItems(sourceState, orderedItems, {
    notifyItem: async (item) => {
      sentOrder.push(item.sourceItemId);
      if (item.sourceItemId === 'C') {
        return { id: item.id, sent: false, error: 'fixture failure' };
      }
      return { id: item.id, sent: true };
    }
  });

  assert.equal(processed.ok, false);
  assert.match(processed.error, /fixture failure/);
  assert.equal(processed.rememberedCount, 1);
  assert.deepEqual(sentOrder, ['B', 'C']);
  assert.deepEqual(sourceState.knownKeys, ['A', 'B']);
}

function fixturePage(items) {
  return async () => ({ items, nextCursor: null });
}

function knownDb(sourceState) {
  return {
    existsFeedItem(item) {
      return sourceState.knownKeys.includes(item.sourceItemId || item.url);
    }
  };
}

function feedItem(id, minute) {
  return {
    id: `fixture-${id}`,
    source: SOURCE,
    sourceItemId: id,
    title: `Fixture ${id}`,
    url: `https://example.invalid/${id}`,
    publishedAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:00.000Z`,
    collectedAt: `2026-01-01T00:${String(minute).padStart(2, '0')}:30.000Z`,
    pinned: false
  };
}
