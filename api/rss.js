import dns from 'node:dns/promises';
import net from 'node:net';

const USER_AGENT =
  'HyperionRSSReader/1.0 (+https://github.com/StupidGame/HyperionRSSReader)';
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10000;

function isPrivateIPv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return true;
  }

  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIPv6(address) {
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isBlockedAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    return isPrivateIPv4(address);
  }
  if (version === 6) {
    return isPrivateIPv6(address);
  }
  return true;
}

async function assertPublicHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are supported.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Local network URLs are not supported.');
  }

  if (net.isIP(hostname) && isBlockedAddress(hostname)) {
    throw new Error('Private network URLs are not supported.');
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!records.length || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error('Private network URLs are not supported.');
  }

  return parsed.toString();
}

export async function fetchRssDocument(rawUrl) {
  const targetUrl = await assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept:
          'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
        'User-Agent': USER_AGENT,
      },
    });

    const contentLength = Number(upstream.headers.get('content-length') ?? '0');
    if (contentLength > MAX_BYTES) {
      throw new Error('Response is too large.');
    }

    const body = await upstream.text();
    if (body.length > MAX_BYTES) {
      throw new Error('Response is too large.');
    }

    if (!upstream.ok) {
      throw new Error(`Upstream returned ${upstream.status}.`);
    }

    return {
      url: upstream.url,
      contentType: upstream.headers.get('content-type') ?? '',
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    const requestUrl = new URL(request.url, `https://${request.headers.host}`);
    const targetUrl = requestUrl.searchParams.get('url');

    if (!targetUrl) {
      response.status(400).json({ error: 'Missing url parameter.' });
      return;
    }

    const payload = await fetchRssDocument(targetUrl);
    response.status(200).json(payload);
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'RSS request failed.',
    });
  }
}
