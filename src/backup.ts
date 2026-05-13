import { createDefaultData } from './storage';
import type { AppData, AppSettings, FeedSource, Folder, ThemePreference } from './types';

const BACKUP_APP = 'hyperion-rss-reader-web';
const BACKUP_VERSION = 1;

export type BackupImportStats = {
  feeds: {
    added: number;
    updated: number;
    skipped: number;
  };
  folders: {
    added: number;
    updated: number;
    skipped: number;
  };
  settingsUpdated: boolean;
};

type BackupPayload = {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: AppData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value: unknown, fallback: number) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function booleanValue(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.toLowerCase() !== 'false';
  }
  return fallback;
}

function newId() {
  return crypto.randomUUID();
}

function normalizeFolder(value: unknown): Folder | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = stringValue(value.name).trim();
  if (!name) {
    return null;
  }

  return {
    id: stringValue(value.id).trim() || newId(),
    name,
    createdAt: numberValue(value.createdAt, Date.now()),
  };
}

function normalizeFeed(value: unknown): FeedSource | null {
  if (!isRecord(value)) {
    return null;
  }

  const rssUrl = stringValue(value.rssUrl || value.feedUrl || value.url).trim();
  if (!rssUrl) {
    return null;
  }

  const title = stringValue(value.title).trim() || rssUrl;

  return {
    id: stringValue(value.id).trim() || newId(),
    url: stringValue(value.url).trim() || rssUrl,
    rssUrl,
    title,
    description: stringValue(value.description),
    folderId: stringValue(value.folderId).trim() || null,
    notificationEnabled: booleanValue(value.notificationEnabled, true),
    lastUpdated: numberValue(value.lastUpdated, Date.now()),
  };
}

function normalizeSettings(value: unknown, currentSettings: AppSettings): AppSettings {
  if (!isRecord(value)) {
    return currentSettings;
  }

  const defaults = createDefaultData().settings;
  const theme = stringValue(value.theme);
  const allowedThemes: ThemePreference[] = ['system', 'light', 'dark'];

  return {
    theme: allowedThemes.includes(theme as ThemePreference) ? (theme as ThemePreference) : currentSettings.theme,
    timeZone: stringValue(value.timeZone).trim() || currentSettings.timeZone || defaults.timeZone,
    updateInterval: Math.max(1, numberValue(value.updateInterval, currentSettings.updateInterval)),
  };
}

function extractData(value: unknown): Partial<AppData> | null {
  if (!isRecord(value)) {
    return null;
  }

  if (isRecord(value.data)) {
    return value.data as Partial<AppData>;
  }

  if ('feeds' in value || 'folders' in value || 'settings' in value) {
    return value as Partial<AppData>;
  }

  return null;
}

function createEmptyStats(): BackupImportStats {
  return {
    feeds: { added: 0, updated: 0, skipped: 0 },
    folders: { added: 0, updated: 0, skipped: 0 },
    settingsUpdated: false,
  };
}

export function appDataToBackupJson(data: AppData) {
  const payload: BackupPayload = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  return JSON.stringify(payload, null, 2);
}

export function importBackupJson(text: string, currentData: AppData) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  const importedData = extractData(parsed);
  if (!importedData) {
    throw new Error('Backup file does not contain feed data.');
  }

  const stats = createEmptyStats();
  const folders = [...currentData.folders];
  const folderIdMap = new Map<string, string>();
  const importedFolders = Array.isArray(importedData.folders) ? importedData.folders : [];

  importedFolders.forEach((folderValue) => {
    const folder = normalizeFolder(folderValue);
    if (!folder) {
      stats.folders.skipped += 1;
      return;
    }

    const existingIndex = folders.findIndex(
      (candidate) =>
        candidate.id === folder.id || candidate.name.toLowerCase() === folder.name.toLowerCase(),
    );

    if (existingIndex >= 0) {
      const existing = folders[existingIndex];
      folders[existingIndex] = { ...existing, name: folder.name };
      folderIdMap.set(folder.id, existing.id);
      stats.folders.updated += 1;
    } else {
      folders.push(folder);
      folderIdMap.set(folder.id, folder.id);
      stats.folders.added += 1;
    }
  });

  const feeds = [...currentData.feeds];
  const importedFeeds = Array.isArray(importedData.feeds) ? importedData.feeds : [];

  importedFeeds.forEach((feedValue) => {
    const feed = normalizeFeed(feedValue);
    if (!feed) {
      stats.feeds.skipped += 1;
      return;
    }

    if (feed.folderId) {
      feed.folderId = folderIdMap.get(feed.folderId) ?? feed.folderId;
      if (!folders.some((folder) => folder.id === feed.folderId)) {
        feed.folderId = null;
      }
    }

    const existingIndex = feeds.findIndex(
      (candidate) => candidate.id === feed.id || candidate.rssUrl === feed.rssUrl,
    );

    if (existingIndex >= 0) {
      feeds[existingIndex] = { ...feeds[existingIndex], ...feed, id: feeds[existingIndex].id };
      stats.feeds.updated += 1;
    } else {
      feeds.push(feed);
      stats.feeds.added += 1;
    }
  });

  const settingsUpdated = isRecord(importedData.settings);
  const settings = settingsUpdated
    ? normalizeSettings(importedData.settings, currentData.settings)
    : currentData.settings;

  return {
    data: {
      ...currentData,
      feeds,
      folders,
      settings,
    },
    stats: {
      ...stats,
      settingsUpdated,
    },
  };
}

export function downloadJson(fileName: string, jsonText: string) {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
