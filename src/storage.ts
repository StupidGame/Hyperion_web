import type { AppData } from './types';

const STORAGE_KEY = 'hyperion-rss-reader-web-state-v1';

function defaultTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function createDefaultData(): AppData {
  return {
    feeds: [],
    folders: [],
    settings: {
      theme: 'system',
      timeZone: defaultTimeZone(),
      updateInterval: 15,
    },
  };
}

export function loadData(): AppData {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createDefaultData();
    }

    const parsed = JSON.parse(stored) as Partial<AppData>;
    const defaults = createDefaultData();

    return {
      feeds: Array.isArray(parsed.feeds) ? parsed.feeds : defaults.feeds,
      folders: Array.isArray(parsed.folders) ? parsed.folders : defaults.folders,
      settings: {
        ...defaults.settings,
        ...(parsed.settings ?? {}),
      },
    };
  } catch {
    return createDefaultData();
  }
}

export function saveData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
