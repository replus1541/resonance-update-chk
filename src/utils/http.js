import { config } from '../config.js';

export class HttpError extends Error {
  constructor(message, { status, url, body } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? config.httpTimeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': config.userAgent,
        accept: options.accept || '*/*',
        ...(options.headers || {})
      }
    });
    const body = await response.text();
    if (!response.ok) {
      throw new HttpError(`HTTP ${response.status} for ${url}`, {
        status: response.status,
        url,
        body: body.slice(0, 1000)
      });
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options = {}) {
  const text = await fetchText(url, {
    ...options,
    accept: 'application/json, text/plain, */*',
    headers: {
      referer: options.referer,
      ...(options.headers || {})
    }
  });
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(`Invalid JSON for ${url}: ${error.message}`, { url, body: text.slice(0, 1000) });
  }
}
