import type { FeedSource, RssCandidate, RssFeed, RssItem } from './types';

type DocumentPayload = {
  url: string;
  contentType: string;
  body: string;
};

function normalizeUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('URL is empty.');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

async function fetchDocument(url: string): Promise<DocumentPayload> {
  const response = await fetch(`/api/rss?url=${encodeURIComponent(normalizeUrl(url))}`);
  const payload = (await response.json()) as Partial<DocumentPayload> & { error?: string };

  if (!response.ok || payload.error) {
    throw new Error(payload.error || 'Could not fetch RSS document.');
  }

  if (!payload.body || !payload.url) {
    throw new Error('RSS response was empty.');
  }

  return {
    url: payload.url,
    contentType: payload.contentType ?? '',
    body: payload.body,
  };
}

export function decodeHtml(value: string) {
  const element = document.createElement('textarea');
  element.innerHTML = value;
  return element.value;
}

function firstElementByTagName(parent: Element | Document, name: string) {
  const directMatch = parent.getElementsByTagName(name)[0];
  if (directMatch || !name.includes(':')) {
    return directMatch;
  }

  const localName = name.split(':').at(-1) ?? name;
  return parent.getElementsByTagNameNS('*', localName)[0];
}

function textFrom(parent: Element | Document, names: string[]) {
  for (const name of names) {
    const value = firstElementByTagName(parent, name)?.textContent?.trim();
    if (value) {
      return decodeHtml(value);
    }
  }
  return '';
}

function linkFromAtomEntry(entry: Element) {
  const alternate = entry.querySelector('link[rel="alternate"]') as HTMLLinkElement | null;
  const first = entry.querySelector('link') as HTMLLinkElement | null;
  return alternate?.getAttribute('href') ?? first?.getAttribute('href') ?? textFrom(entry, ['link']);
}

function parseRss(xml: Document, feedUrl: string): RssFeed | null {
  const channel = xml.querySelector('channel');
  if (!channel) {
    return null;
  }

  const items = Array.from(channel.querySelectorAll('item')).map<RssItem>((item) => ({
    title: textFrom(item, ['title']) || 'Untitled',
    link: textFrom(item, ['link', 'guid']),
    pubDate: textFrom(item, ['pubDate', 'dc:date', 'published', 'updated', 'date']),
    description: textFrom(item, ['content:encoded', 'description', 'summary']),
  }));

  return {
    url: feedUrl,
    channel: {
      title: textFrom(channel, ['title']) || feedUrl,
      link: textFrom(channel, ['link']),
      description: textFrom(channel, ['description']),
      items,
    },
  };
}

function parseAtom(xml: Document, feedUrl: string): RssFeed | null {
  const feed = xml.querySelector('feed');
  if (!feed) {
    return null;
  }

  const feedLink =
    (feed.querySelector('link[rel="alternate"]') as HTMLLinkElement | null)?.getAttribute('href') ??
    (feed.querySelector('link') as HTMLLinkElement | null)?.getAttribute('href') ??
    '';

  const items = Array.from(feed.querySelectorAll('entry')).map<RssItem>((entry) => ({
    title: textFrom(entry, ['title']) || 'Untitled',
    link: linkFromAtomEntry(entry),
    pubDate: textFrom(entry, ['updated', 'published']),
    description: textFrom(entry, ['content', 'summary']),
  }));

  return {
    url: feedUrl,
    channel: {
      title: textFrom(feed, ['title']) || feedUrl,
      link: feedLink,
      description: textFrom(feed, ['subtitle']),
      items,
    },
  };
}

export function parseFeed(xmlText: string, feedUrl: string): RssFeed {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.querySelector('parsererror')) {
    throw new Error('The document is not valid RSS or Atom XML.');
  }

  const feed = parseRss(xml, feedUrl) ?? parseAtom(xml, feedUrl);
  if (!feed) {
    throw new Error('No RSS or Atom channel was found.');
  }

  return {
    ...feed,
    channel: {
      ...feed.channel,
      items: sortItemsByNewest(feed.channel.items),
    },
  };
}

function absoluteUrl(candidateUrl: string, baseUrl: string) {
  try {
    return new URL(candidateUrl, baseUrl).toString();
  } catch {
    return '';
  }
}

function findCandidatesFromHtml(html: string, baseUrl: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const candidates: RssCandidate[] = [];

  document
    .querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"]')
    .forEach((element) => {
      const href = absoluteUrl(element.getAttribute('href') ?? '', baseUrl);
      if (!href) {
        return;
      }
      candidates.push({
        title: element.getAttribute('title') || href,
        url: href,
      });
    });

  document.querySelectorAll('a[href]').forEach((element) => {
    const href = absoluteUrl(element.getAttribute('href') ?? '', baseUrl);
    if (!href || candidates.some((candidate) => candidate.url === href)) {
      return;
    }
    if (/rss|feed|atom|\.xml$/i.test(href)) {
      candidates.push({
        title: element.textContent?.trim() || href,
        url: href,
      });
    }
  });

  return candidates;
}

export async function fetchFeedContent(url: string) {
  const document = await fetchDocument(url);
  return parseFeed(document.body, document.url);
}

export async function getRssCandidates(inputUrl: string) {
  const url = normalizeUrl(inputUrl);

  try {
    const feed = await fetchFeedContent(url);
    return [{ title: feed.channel.title || url, url: feed.url }];
  } catch {
    const document = await fetchDocument(url);
    const candidates = findCandidatesFromHtml(document.body, document.url);
    if (!candidates.length) {
      throw new Error('No RSS or Atom feeds were found at that URL.');
    }
    return candidates;
  }
}

function dateValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortItemsByNewest(items: RssItem[]) {
  return [...items].sort((left, right) => dateValue(right.pubDate) - dateValue(left.pubDate));
}

export function formatDate(value: string, timeZone: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value || 'No date';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(parsed);
}

export async function mergeFeeds(feeds: FeedSource[], title: string): Promise<RssFeed> {
  const results = await Promise.allSettled(
    feeds.map(async (source) => {
      const feed = await fetchFeedContent(source.rssUrl);
      return feed.channel.items.map((item) => ({
        ...item,
        sourceTitle: source.title || feed.channel.title,
      }));
    }),
  );

  const items = results
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((item, index, allItems) => {
      const key = item.link || `${item.title}-${item.pubDate}`;
      return allItems.findIndex((other) => (other.link || `${other.title}-${other.pubDate}`) === key) === index;
    });

  return {
    url: title.toLowerCase().replace(/\s+/g, '-'),
    channel: {
      title,
      link: '',
      description: `${feeds.length} feed${feeds.length === 1 ? '' : 's'}`,
      items: sortItemsByNewest(items),
    },
  };
}
