import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchNaverPage } from '../src/collectors/naver.js';
import { fetchYouTubePage } from '../src/collectors/youtube.js';
import { collectUntilKnown, sortOldestFirst } from '../src/collectors/common.js';
import { notifyDiscord } from '../src/notifier/discord.js';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_STATE_PATH = path.join(ROOT_DIR, 'data', 'state.json');
const STATE_PATH = path.resolve(process.env.STATE_PATH || DEFAULT_STATE_PATH);
const MAX_KNOWN_ITEMS_PER_SOURCE = Number.parseInt(process.env.MAX_KNOWN_ITEMS_PER_SOURCE || '300', 10);

const COLLECTORS = {
  NAVER_LOUNGE: fetchNaverPage,
  YOUTUBE: fetchYouTubePage
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = await readState();
  const sources = selectSources(args);
  const summary = [];

  for (const source of sources) {
    const result = await collectSource(state, source);
    summary.push(result);
    console.log(formatResult(result));
  }

  await writeState(state);

  const failed = summary.filter((item) => !item.ok);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function selectSources(args) {
  const requested = args.source || process.env.SOURCES || process.env.SOURCE;
  if (requested) {
    return requested.split(',').map((source) => source.trim()).filter(Boolean);
  }

  const schedule = process.env.GITHUB_EVENT_SCHEDULE || '';
  if (schedule.includes('17,47')) return ['YOUTUBE'];
  return ['NAVER_LOUNGE'];
}

async function collectSource(state, source) {
  const fetchPage = COLLECTORS[source];
  if (!fetchPage) {
    return { source, ok: false, error: `unsupported source: ${source}` };
  }

  const sourceState = ensureSourceState(state, source);

  const db = {
    existsFeedItem(item) {
      return sourceState.knownKeys.includes(makeKnownKey(item));
    }
  };

  try {
    const result = await collectUntilKnown(source, fetchPage, db);
    const orderedItems = sortOldestFirst(result.items);
    const baseline = !sourceState.baselineDone;
    const notifications = [];

    if (!baseline) {
      for (const item of orderedItems) {
        notifications.push(await notify(item));
      }
    }

    rememberItems(sourceState, orderedItems);
    sourceState.baselineDone = true;

    return {
      source,
      ok: true,
      baseline,
      newCount: orderedItems.length,
      pageCount: result.pageCount,
      stopReason: result.stopReason,
      notifications
    };
  } catch (error) {
    return { source, ok: false, error: error.message };
  }
}

async function notify(item) {
  if (isTruthy(process.env.DRY_RUN)) {
    return { id: item.id, sent: false, reason: 'dry-run' };
  }
  try {
    const result = await notifyDiscord(item);
    return { id: item.id, ...result };
  } catch (error) {
    return { id: item.id, sent: false, error: error.message };
  }
}

function rememberItems(sourceState, items) {
  const known = new Set(sourceState.knownKeys);
  for (const item of items) {
    known.add(makeKnownKey(item));
  }
  sourceState.knownKeys = Array.from(known).slice(-MAX_KNOWN_ITEMS_PER_SOURCE);
}

function makeKnownKey(item) {
  return item.sourceItemId ? `${item.sourceItemId}` : item.url;
}

function ensureSourceState(state, source) {
  state.sources[source] ||= {
    baselineDone: false,
    knownKeys: []
  };
  state.sources[source].knownKeys ||= [];
  return state.sources[source];
}

async function readState() {
  try {
    const text = await fs.readFile(STATE_PATH, 'utf8');
    const state = JSON.parse(text);
    return {
      version: 1,
      sources: {},
      ...state,
      sources: state.sources || {}
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { version: 1, sources: {} };
  }
}

async function writeState(state) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseArgs(args) {
  const parsed = {};
  for (const arg of args) {
    if (arg.startsWith('--source=')) parsed.source = arg.slice('--source='.length);
    if (arg === '--force') parsed.force = true;
  }
  return parsed;
}

function formatResult(result) {
  if (!result.ok) return `${result.source}: failed: ${result.error}`;
  const sent = result.notifications?.filter((item) => item.sent).length || 0;
  return [
    `${result.source}: ok`,
    `baseline=${result.baseline}`,
    `new=${result.newCount}`,
    `pages=${result.pageCount}`,
    `stop=${result.stopReason}`,
    `sent=${sent}`
  ].join(' ');
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
