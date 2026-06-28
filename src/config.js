import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const rootDir = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function boolEnv(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function intEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  rootDir,
  host: process.env.HOST || '127.0.0.1',
  port: intEnv('PORT', 4317),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/resonance-feed.sqlite'),
  cronExpression: process.env.CRON_EXPRESSION || '*/1 * * * *',
  runOnStart: boolEnv('RUN_ON_START', true),
  discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
  discordUsername: process.env.DISCORD_USERNAME || 'RES Update Monitor',
  discordBotEnabled: boolEnv('DISCORD_BOT_ENABLED', false),
  discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
  discordClientId: process.env.DISCORD_CLIENT_ID || '',
  discordPublicKey: process.env.DISCORD_PUBLIC_KEY || '',
  userAgent: process.env.COLLECTOR_USER_AGENT || 'RESUpdateMonitor/0.1',
  httpTimeoutMs: intEnv('HTTP_TIMEOUT_MS', 20_000),
  maxPages: intEnv('MAX_PAGES', 10),
  maxNewItems: intEnv('MAX_NEW_ITEMS', 100),
  enablePlaywrightFallback: boolEnv('ENABLE_PLAYWRIGHT_FALLBACK', false),
  sourceIntervalsMinutes: {
    NAVER_LOUNGE: intEnv('INTERVAL_NAVER_LOUNGE_MINUTES', 5),
    WEIBO: intEnv('INTERVAL_WEIBO_MINUTES', 30),
    X: intEnv('INTERVAL_X_MINUTES', 30),
    YOUTUBE: intEnv('INTERVAL_YOUTUBE_MINUTES', 30)
  },
  enabledCollectors: {
    NAVER_LOUNGE: boolEnv('ENABLE_NAVER_COLLECTOR', true),
    WEIBO: boolEnv('ENABLE_WEIBO_COLLECTOR', true),
    X: boolEnv('ENABLE_X_COLLECTOR', false),
    YOUTUBE: boolEnv('ENABLE_YOUTUBE_COLLECTOR', true)
  }
};
