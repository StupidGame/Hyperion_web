import type { FeedSource, Folder } from './types';

export type ImportStats = {
  added: number;
  updated: number;
  skipped: number;
};

function escapeCsv(value: unknown) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(headers: string[], rows: string[][]) {
  return [headers, ...rows]
    .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
    .join('\r\n');
}

export function foldersToCsv(folders: Folder[]) {
  return rowsToCsv(
    ['id', 'name', 'createdAt'],
    folders.map((folder) => [folder.id, folder.name, String(folder.createdAt)]),
  );
}

export function feedsToCsv(feeds: FeedSource[], folders: Folder[]) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder.name]));

  return rowsToCsv(
    [
      'id',
      'title',
      'url',
      'rssUrl',
      'description',
      'folderId',
      'folderName',
      'notificationEnabled',
      'lastUpdated',
    ],
    feeds.map((feed) => [
      feed.id,
      feed.title,
      feed.url,
      feed.rssUrl,
      feed.description,
      feed.folderId ?? '',
      feed.folderId ? folderById.get(feed.folderId) ?? '' : '',
      String(feed.notificationEnabled),
      String(feed.lastUpdated),
    ]),
  );
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {}),
  );
}

function newId() {
  return crypto.randomUUID();
}

export function importFoldersCsv(csvText: string, currentFolders: Folder[]) {
  const rows = parseCsv(csvText);
  const folders = [...currentFolders];
  const stats: ImportStats = { added: 0, updated: 0, skipped: 0 };

  rows.forEach((row) => {
    const name = (row.name ?? row.folderName ?? '').trim();
    if (!name) {
      stats.skipped += 1;
      return;
    }

    const id = (row.id ?? '').trim() || newId();
    const createdAt = Number(row.createdAt) || Date.now();
    const existingIndex = folders.findIndex(
      (folder) => folder.id === id || folder.name.toLowerCase() === name.toLowerCase(),
    );

    if (existingIndex >= 0) {
      folders[existingIndex] = { ...folders[existingIndex], name };
      stats.updated += 1;
    } else {
      folders.push({ id, name, createdAt });
      stats.added += 1;
    }
  });

  return { folders, stats };
}

export function importFeedsCsv(
  csvText: string,
  currentFeeds: FeedSource[],
  currentFolders: Folder[],
) {
  const rows = parseCsv(csvText);
  const feeds = [...currentFeeds];
  const folders = [...currentFolders];
  const stats: ImportStats = { added: 0, updated: 0, skipped: 0 };

  rows.forEach((row) => {
    const url = (row.url ?? '').trim();
    const rssUrl = (row.rssUrl ?? row.feedUrl ?? url).trim();
    const title = (row.title ?? rssUrl).trim();

    if (!rssUrl) {
      stats.skipped += 1;
      return;
    }

    let folderId = (row.folderId ?? '').trim() || null;
    const folderName = (row.folderName ?? '').trim();

    if (folderName) {
      let folder = folders.find(
        (candidate) => candidate.name.toLowerCase() === folderName.toLowerCase(),
      );
      if (!folder) {
        folder = { id: newId(), name: folderName, createdAt: Date.now() };
        folders.push(folder);
      }
      folderId = folder.id;
    } else if (folderId && !folders.some((folder) => folder.id === folderId)) {
      folderId = null;
    }

    const id = (row.id ?? '').trim() || newId();
    const nextFeed: FeedSource = {
      id,
      title,
      url: url || rssUrl,
      rssUrl,
      description: row.description ?? '',
      folderId,
      notificationEnabled: (row.notificationEnabled ?? 'true').toLowerCase() !== 'false',
      lastUpdated: Number(row.lastUpdated) || Date.now(),
    };

    const existingIndex = feeds.findIndex(
      (feed) => feed.id === id || feed.rssUrl === nextFeed.rssUrl,
    );

    if (existingIndex >= 0) {
      feeds[existingIndex] = { ...feeds[existingIndex], ...nextFeed, id: feeds[existingIndex].id };
      stats.updated += 1;
    } else {
      feeds.push(nextFeed);
      stats.added += 1;
    }
  });

  return { feeds, folders, stats };
}

export function downloadCsv(fileName: string, csvText: string) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
