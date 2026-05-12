import {
  Archive,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileInput,
  Folder as FolderIcon,
  ListFilter,
  Loader2,
  Moon,
  Pencil,
  Plus,
  RefreshCcw,
  Rss,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadCsv,
  feedsToCsv,
  foldersToCsv,
  importFeedsCsv,
  importFoldersCsv,
  type ImportStats,
} from './csv';
import { loadData, saveData } from './storage';
import { fetchFeedContent, formatDate, getRssCandidates, mergeFeeds } from './rss';
import type { AppData, FeedSelection, FeedSource, Folder, RssCandidate, RssFeed } from './types';

type ConfirmFeedState = {
  originalUrl: string;
  candidate: RssCandidate;
  feed: RssFeed;
};

type FeedEditState = {
  feed: FeedSource;
  title: string;
  folderId: string;
};

type FolderEditState = {
  folder: Folder;
  name: string;
};

const TIME_ZONES = ['UTC', 'Asia/Tokyo', 'America/New_York', 'Europe/London', 'Europe/Paris'];

function selectionLabel(selection: FeedSelection, folders: Folder[], feeds: FeedSource[]) {
  if (selection.kind === 'all') {
    return 'All feeds';
  }
  if (selection.kind === 'uncategorized') {
    return 'Uncategorized';
  }
  if (selection.kind === 'folder') {
    return folders.find((folder) => folder.id === selection.id)?.name ?? 'Folder';
  }
  return feeds.find((feed) => feed.id === selection.id)?.title ?? 'Feed';
}

function isSameSelection(left: FeedSelection, right: FeedSelection) {
  return left.kind === right.kind && ('id' in left ? left.id : '') === ('id' in right ? right.id : '');
}

function resolveThemePreference(data: AppData) {
  if (data.settings.theme !== 'system') {
    return data.settings.theme;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

function summarizeImport(kind: string, stats: ImportStats) {
  return `${kind}: ${stats.added} added, ${stats.updated} updated, ${stats.skipped} skipped.`;
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [selection, setSelection] = useState<FeedSelection>({ kind: 'all' });
  const [currentFeed, setCurrentFeed] = useState<RssFeed | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Ready');

  const [showAddFeed, setShowAddFeed] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [candidatePicker, setCandidatePicker] = useState<{
    originalUrl: string;
    candidates: RssCandidate[];
  } | null>(null);
  const [confirmFeed, setConfirmFeed] = useState<ConfirmFeedState | null>(null);
  const [confirmFolderId, setConfirmFolderId] = useState('');

  const [newFolderName, setNewFolderName] = useState('');
  const [feedEdit, setFeedEdit] = useState<FeedEditState | null>(null);
  const [folderEdit, setFolderEdit] = useState<FolderEditState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showDataPanel, setShowDataPanel] = useState(false);

  const feedImportRef = useRef<HTMLInputElement>(null);
  const folderImportRef = useRef<HTMLInputElement>(null);

  const resolvedTheme = useMemo(() => resolveThemePreference(data), [data]);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const feedsForSelection = useCallback(
    (target: FeedSelection) => {
      if (target.kind === 'feed') {
        return data.feeds.filter((feed) => feed.id === target.id);
      }
      if (target.kind === 'folder') {
        return data.feeds.filter((feed) => feed.folderId === target.id);
      }
      if (target.kind === 'uncategorized') {
        return data.feeds.filter((feed) => !feed.folderId);
      }
      return data.feeds;
    },
    [data.feeds],
  );

  const visibleFeeds = useMemo(() => feedsForSelection(selection), [feedsForSelection, selection]);
  const title = selectionLabel(selection, data.folders, data.feeds);

  const loadSelection = useCallback(
    async (target: FeedSelection, refresh = false) => {
      const selectedFeeds = feedsForSelection(target);
      if (!selectedFeeds.length) {
        setCurrentFeed({
          url: 'empty',
          channel: {
            title: selectionLabel(target, data.folders, data.feeds),
            link: '',
            description: '0 feeds',
            items: [],
          },
        });
        return;
      }

      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);

      try {
        const nextFeed =
          target.kind === 'feed'
            ? await fetchFeedContent(selectedFeeds[0].rssUrl)
            : await mergeFeeds(selectedFeeds, selectionLabel(target, data.folders, data.feeds));

        setCurrentFeed(nextFeed);
        setStatus(`Updated ${new Date().toLocaleTimeString()}`);
        setData((current) => ({
          ...current,
          feeds: current.feeds.map((feed) =>
            selectedFeeds.some((selected) => selected.id === feed.id)
              ? { ...feed, lastUpdated: Date.now() }
              : feed,
          ),
        }));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Feed loading failed.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [data.feeds, data.folders, feedsForSelection],
  );

  useEffect(() => {
    void loadSelection(selection);
  }, [loadSelection, selection]);

  useEffect(() => {
    if (!data.feeds.length || data.settings.updateInterval < 1) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadSelection(selection, true);
    }, data.settings.updateInterval * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [data.feeds.length, data.settings.updateInterval, loadSelection, selection]);

  function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newFolderName.trim();
    if (!name) {
      return;
    }

    const folder: Folder = {
      id: crypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };

    setData((current) => ({ ...current, folders: [...current.folders, folder] }));
    setNewFolderName('');
    setSelection({ kind: 'folder', id: folder.id });
  }

  function deleteFolder(folder: Folder) {
    setData((current) => ({
      ...current,
      folders: current.folders.filter((item) => item.id !== folder.id),
      feeds: current.feeds.map((feed) =>
        feed.folderId === folder.id ? { ...feed, folderId: null } : feed,
      ),
    }));

    if (selection.kind === 'folder' && selection.id === folder.id) {
      setSelection({ kind: 'all' });
    }
  }

  function deleteFeed(feed: FeedSource) {
    setData((current) => ({ ...current, feeds: current.feeds.filter((item) => item.id !== feed.id) }));
    if (selection.kind === 'feed' && selection.id === feed.id) {
      setSelection({ kind: 'all' });
    }
  }

  async function prepareCandidate(candidate: RssCandidate, originalUrl: string) {
    setIsLoading(true);
    setError(null);

    try {
      const feed = await fetchFeedContent(candidate.url);
      setConfirmFeed({ originalUrl, candidate, feed });
      setConfirmFolderId('');
      setCandidatePicker(null);
      setShowAddFeed(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Feed verification failed.');
    } finally {
      setIsLoading(false);
    }
  }

  async function verifyFeedUrl(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const originalUrl = addUrl.trim();
    if (!originalUrl) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const candidates = await getRssCandidates(originalUrl);
      if (candidates.length === 1) {
        await prepareCandidate(candidates[0], originalUrl);
      } else {
        setCandidatePicker({ originalUrl, candidates });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No feeds found.');
    } finally {
      setIsLoading(false);
    }
  }

  function subscribeConfirmedFeed() {
    if (!confirmFeed) {
      return;
    }

    const existing = data.feeds.find((feed) => feed.rssUrl === confirmFeed.candidate.url);
    const nextFeed: FeedSource = {
      id: existing?.id ?? crypto.randomUUID(),
      url: confirmFeed.originalUrl,
      rssUrl: confirmFeed.candidate.url,
      title: confirmFeed.feed.channel.title || confirmFeed.candidate.title,
      description: confirmFeed.feed.channel.description,
      folderId: confirmFolderId || null,
      notificationEnabled: true,
      lastUpdated: Date.now(),
    };

    setData((current) => ({
      ...current,
      feeds: existing
        ? current.feeds.map((feed) => (feed.id === existing.id ? nextFeed : feed))
        : [...current.feeds, nextFeed],
    }));

    setSelection({ kind: 'feed', id: nextFeed.id });
    setAddUrl('');
    setConfirmFeed(null);
    setStatus(existing ? 'Feed updated' : 'Feed added');
  }

  function saveFeedEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedEdit) {
      return;
    }

    setData((current) => ({
      ...current,
      feeds: current.feeds.map((feed) =>
        feed.id === feedEdit.feed.id
          ? { ...feed, title: feedEdit.title.trim() || feed.title, folderId: feedEdit.folderId || null }
          : feed,
      ),
    }));
    setFeedEdit(null);
  }

  function saveFolderEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderEdit) {
      return;
    }

    setData((current) => ({
      ...current,
      folders: current.folders.map((folder) =>
        folder.id === folderEdit.folder.id
          ? { ...folder, name: folderEdit.name.trim() || folder.name }
          : folder,
      ),
    }));
    setFolderEdit(null);
  }

  function exportFeeds(feeds: FeedSource[], scope: string) {
    downloadCsv(`hyperion-${scope}-feeds-${fileStamp()}.csv`, feedsToCsv(feeds, data.folders));
    setStatus(`${feeds.length} feeds exported`);
  }

  function exportFolders() {
    downloadCsv(`hyperion-folders-${fileStamp()}.csv`, foldersToCsv(data.folders));
    setStatus(`${data.folders.length} folders exported`);
  }

  async function importFeedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    const text = await file.text();
    setData((current) => {
      const result = importFeedsCsv(text, current.feeds, current.folders);
      setStatus(summarizeImport('Feeds', result.stats));
      return { ...current, feeds: result.feeds, folders: result.folders };
    });
  }

  async function importFolderFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) {
      return;
    }

    const text = await file.text();
    setData((current) => {
      const result = importFoldersCsv(text, current.folders);
      setStatus(summarizeImport('Folders', result.stats));
      return { ...current, folders: result.folders };
    });
  }

  return (
    <div className={`app theme-${resolvedTheme}`}>
      <header className="topbar">
        <div className="brand-lockup" aria-label="Hyperion RSS Reader">
          <div className="brand-mark">
            <Rss size={22} />
          </div>
          <div>
            <p>Hyperion</p>
            <span>RSS Reader</span>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="icon-button" type="button" title="Refresh" onClick={() => void loadSelection(selection, true)}>
            <RefreshCcw size={18} />
          </button>
          <button className="icon-button" type="button" title="Data" onClick={() => setShowDataPanel(true)}>
            <Archive size={18} />
          </button>
          <button className="icon-button" type="button" title="Settings" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
          <button className="primary-button" type="button" onClick={() => setShowAddFeed(true)}>
            <Plus size={18} />
            <span>Add feed</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar" aria-label="Feeds and folders">
          <div className="section-heading">
            <ListFilter size={16} />
            <span>Views</span>
          </div>

          <nav className="nav-stack">
            <button
              className={isSameSelection(selection, { kind: 'all' }) ? 'nav-item active' : 'nav-item'}
              type="button"
              onClick={() => setSelection({ kind: 'all' })}
            >
              <Rss size={17} />
              <span>All feeds</span>
              <strong>{data.feeds.length}</strong>
            </button>
            <button
              className={isSameSelection(selection, { kind: 'uncategorized' }) ? 'nav-item active' : 'nav-item'}
              type="button"
              onClick={() => setSelection({ kind: 'uncategorized' })}
            >
              <Archive size={17} />
              <span>Uncategorized</span>
              <strong>{data.feeds.filter((feed) => !feed.folderId).length}</strong>
            </button>
          </nav>

          <div className="section-heading folder-heading">
            <FolderIcon size={16} />
            <span>Folders</span>
          </div>

          <form className="inline-form" onSubmit={createFolder}>
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder"
            />
            <button className="icon-button" type="submit" title="Create folder">
              <Plus size={16} />
            </button>
          </form>

          <div className="nav-stack folders">
            {data.folders.map((folder) => (
              <div className="folder-row" key={folder.id}>
                <button
                  className={selection.kind === 'folder' && selection.id === folder.id ? 'nav-item active' : 'nav-item'}
                  type="button"
                  onClick={() => setSelection({ kind: 'folder', id: folder.id })}
                >
                  <FolderIcon size={17} />
                  <span>{folder.name}</span>
                  <strong>{data.feeds.filter((feed) => feed.folderId === folder.id).length}</strong>
                </button>
                <button
                  className="micro-button"
                  type="button"
                  title="Edit folder"
                  onClick={() => setFolderEdit({ folder, name: folder.name })}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="micro-button danger"
                  type="button"
                  title="Delete folder"
                  onClick={() => deleteFolder(folder)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="feed-rail" aria-label="Saved feeds">
          <div className="panel-title">
            <span>Feeds</span>
            <strong>{visibleFeeds.length}</strong>
          </div>

          <div className="feed-list">
            {visibleFeeds.map((feed) => (
              <article
                className={selection.kind === 'feed' && selection.id === feed.id ? 'feed-source active' : 'feed-source'}
                key={feed.id}
              >
                <button type="button" onClick={() => setSelection({ kind: 'feed', id: feed.id })}>
                  <span>{feed.title}</span>
                  <small>{feed.rssUrl}</small>
                </button>
                <div className="row-actions">
                  <button
                    className="micro-button"
                    type="button"
                    title="Edit feed"
                    onClick={() => setFeedEdit({ feed, title: feed.title, folderId: feed.folderId ?? '' })}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="micro-button danger"
                    type="button"
                    title="Delete feed"
                    onClick={() => deleteFeed(feed)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
            {!visibleFeeds.length && <div className="empty-list">No feeds here.</div>}
          </div>
        </section>

        <section className="reader" aria-label="RSS articles">
          <div className="reader-header">
            <div>
              <span className="eyebrow">{status}</span>
              <h1>{title}</h1>
              <p>{currentFeed?.channel.description || `${visibleFeeds.length} feeds`}</p>
            </div>
            <div className="reader-tools">
              <button className="secondary-button" type="button" onClick={() => exportFeeds(visibleFeeds, 'current')}>
                <Download size={17} />
                <span>Export view</span>
              </button>
              <button className="icon-button" type="button" title="Refresh" onClick={() => void loadSelection(selection, true)}>
                {isRefreshing ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="notice error">
              <span>{error}</span>
              <button className="micro-button" type="button" title="Dismiss" onClick={() => setError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="loading-state">
              <Loader2 className="spin" size={28} />
              <span>Loading feed signal...</span>
            </div>
          ) : (
            <div className="article-grid">
              {currentFeed?.channel.items.map((item) => (
                <a className="article-card" href={item.link} key={`${item.link}-${item.title}`} target="_blank" rel="noreferrer">
                  <span>{item.sourceTitle ?? currentFeed.channel.title}</span>
                  <h2>{item.title}</h2>
                  <p>{formatDate(item.pubDate, data.settings.timeZone)}</p>
                  <ExternalLink size={16} />
                </a>
              ))}
              {currentFeed && !currentFeed.channel.items.length && (
                <div className="empty-reader">
                  <Rss size={26} />
                  <span>No articles loaded.</span>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {showAddFeed && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={verifyFeedUrl}>
            <div className="modal-header">
              <h2>Add feed</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setShowAddFeed(false)}>
                <X size={16} />
              </button>
            </div>
            <label>
              <span>URL</span>
              <input value={addUrl} onChange={(event) => setAddUrl(event.target.value)} placeholder="https://example.com/feed.xml" />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setShowAddFeed(false)}>
                <X size={16} />
                <span>Cancel</span>
              </button>
              <button className="primary-button" type="submit">
                <Search size={16} />
                <span>Search</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {candidatePicker && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide">
            <div className="modal-header">
              <h2>Select feed</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setCandidatePicker(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="candidate-list">
              {candidatePicker.candidates.map((candidate) => (
                <button
                  className="candidate-row"
                  type="button"
                  key={candidate.url}
                  onClick={() => void prepareCandidate(candidate, candidatePicker.originalUrl)}
                >
                  <div>
                    <strong>{candidate.title}</strong>
                    <span>{candidate.url}</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {confirmFeed && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <h2>Subscribe</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setConfirmFeed(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="feed-preview">
              <strong>{confirmFeed.feed.channel.title}</strong>
              <span>{confirmFeed.candidate.url}</span>
              <p>{confirmFeed.feed.channel.description || 'No description'}</p>
            </div>
            <label>
              <span>Folder</span>
              <select value={confirmFolderId} onChange={(event) => setConfirmFolderId(event.target.value)}>
                <option value="">None</option>
                {data.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmFeed(null)}>
                <X size={16} />
                <span>Cancel</span>
              </button>
              <button className="primary-button" type="button" onClick={subscribeConfirmedFeed}>
                <Check size={16} />
                <span>Subscribe</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {feedEdit && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveFeedEdit}>
            <div className="modal-header">
              <h2>Edit feed</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setFeedEdit(null)}>
                <X size={16} />
              </button>
            </div>
            <label>
              <span>Title</span>
              <input value={feedEdit.title} onChange={(event) => setFeedEdit({ ...feedEdit, title: event.target.value })} />
            </label>
            <label>
              <span>Folder</span>
              <select value={feedEdit.folderId} onChange={(event) => setFeedEdit({ ...feedEdit, folderId: event.target.value })}>
                <option value="">None</option>
                {data.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setFeedEdit(null)}>
                <X size={16} />
                <span>Cancel</span>
              </button>
              <button className="primary-button" type="submit">
                <Check size={16} />
                <span>Save</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {folderEdit && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveFolderEdit}>
            <div className="modal-header">
              <h2>Edit folder</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setFolderEdit(null)}>
                <X size={16} />
              </button>
            </div>
            <label>
              <span>Name</span>
              <input value={folderEdit.name} onChange={(event) => setFolderEdit({ ...folderEdit, name: event.target.value })} />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setFolderEdit(null)}>
                <X size={16} />
                <span>Cancel</span>
              </button>
              <button className="primary-button" type="submit">
                <Check size={16} />
                <span>Save</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal">
            <div className="modal-header">
              <h2>Settings</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setShowSettings(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="segmented">
              <button
                className={data.settings.theme === 'light' ? 'active' : ''}
                type="button"
                onClick={() => setData((current) => ({ ...current, settings: { ...current.settings, theme: 'light' } }))}
              >
                <Sun size={16} />
                <span>Light</span>
              </button>
              <button
                className={data.settings.theme === 'dark' ? 'active' : ''}
                type="button"
                onClick={() => setData((current) => ({ ...current, settings: { ...current.settings, theme: 'dark' } }))}
              >
                <Moon size={16} />
                <span>Dark</span>
              </button>
              <button
                className={data.settings.theme === 'system' ? 'active' : ''}
                type="button"
                onClick={() => setData((current) => ({ ...current, settings: { ...current.settings, theme: 'system' } }))}
              >
                <Settings size={16} />
                <span>System</span>
              </button>
            </div>
            <label>
              <span>Time zone</span>
              <select
                value={data.settings.timeZone}
                onChange={(event) =>
                  setData((current) => ({
                    ...current,
                    settings: { ...current.settings, timeZone: event.target.value },
                  }))
                }
              >
                {Array.from(new Set([...TIME_ZONES, data.settings.timeZone])).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Refresh minutes</span>
              <input
                min="1"
                max="120"
                type="number"
                value={data.settings.updateInterval}
                onChange={(event) =>
                  setData((current) => ({
                    ...current,
                    settings: {
                      ...current.settings,
                      updateInterval: Number(event.target.value) || 15,
                    },
                  }))
                }
              />
            </label>
          </div>
        </div>
      )}

      {showDataPanel && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal wide">
            <div className="modal-header">
              <h2>CSV</h2>
              <button className="micro-button" type="button" title="Close" onClick={() => setShowDataPanel(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="csv-grid">
              <button className="data-action" type="button" onClick={() => exportFeeds(data.feeds, 'all')}>
                <Download size={18} />
                <strong>Export feeds</strong>
                <span>{data.feeds.length} rows</span>
              </button>
              <button className="data-action" type="button" onClick={exportFolders}>
                <Download size={18} />
                <strong>Export folders</strong>
                <span>{data.folders.length} rows</span>
              </button>
              <button className="data-action" type="button" onClick={() => feedImportRef.current?.click()}>
                <Upload size={18} />
                <strong>Import feeds</strong>
                <span>CSV merge</span>
              </button>
              <button className="data-action" type="button" onClick={() => folderImportRef.current?.click()}>
                <FileInput size={18} />
                <strong>Import folders</strong>
                <span>CSV merge</span>
              </button>
            </div>
            <input ref={feedImportRef} className="hidden-input" type="file" accept=".csv,text/csv" onChange={importFeedFile} />
            <input ref={folderImportRef} className="hidden-input" type="file" accept=".csv,text/csv" onChange={importFolderFile} />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
