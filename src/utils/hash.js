import crypto from 'node:crypto';

export function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function makeFeedItemId(source, sourceItemId, url) {
  return `${source}:${stableHash(sourceItemId || url).slice(0, 32)}`;
}
