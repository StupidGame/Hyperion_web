export type ThemePreference = 'system' | 'light' | 'dark';

export type Folder = {
  id: string;
  name: string;
  createdAt: number;
};

export type FeedSource = {
  id: string;
  url: string;
  rssUrl: string;
  title: string;
  description: string;
  folderId: string | null;
  notificationEnabled: boolean;
  lastUpdated: number;
};

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  sourceTitle?: string;
};

export type RssChannel = {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
};

export type RssFeed = {
  url: string;
  channel: RssChannel;
};

export type RssCandidate = {
  title: string;
  url: string;
};

export type FeedSelection =
  | { kind: 'all' }
  | { kind: 'uncategorized' }
  | { kind: 'folder'; id: string }
  | { kind: 'feed'; id: string };

export type AppSettings = {
  theme: ThemePreference;
  timeZone: string;
  updateInterval: number;
};

export type AppData = {
  feeds: FeedSource[];
  folders: Folder[];
  settings: AppSettings;
};
