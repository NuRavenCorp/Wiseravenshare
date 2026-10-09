import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './MediaLibrary.css';
import PlaylistDrawer from './PlaylistDrawer';
import AddToPlaylistMenu from './AddToPlaylistMenu';
import { useNotification } from '../../Contexts/NotificationContext';
import { useAuth } from '../../Contexts/AuthContext';
import { buildMediaSharePayload, socialService } from '../../Services/socialService';
import { apiService } from '../../Services/api';
import { useSavedMedia } from '../../hooks/useSavedMedia';
import { usePersistedState } from '../../hooks/usePersistedState';
import { usePlaylists } from '../../hooks/usePlaylists';
import { usePlaylistSync } from '../../hooks/usePlaylistSync';

// ─── Constants ────────────────────────────────────────────────────────────────
const LIMITS = { music: 30, photo: 30, video: 30 };

const TYPE_ICON = {
  photo: '🖼️', image: '🖼️',
  music: '🎵', audio: '🎧',
  video: '🎬',
  podcast: '🎙️',
  document: '📄',
};

const UI_KEY = 'ml:ui:v2';
const LOCAL_ITEMS_KEY = 'ml:local:v1';

const DEFAULT_UI = {
  activeTab: 'all',
  filterType: null,
  sortBy: 'createdAt',
  sortDir: 'desc',
  showPlaylists: true,
};

function getIcon(type) {
  return TYPE_ICON[String(type || '').toLowerCase()] || '📦';
}

function formatBytes(value) {
  const n = Number(value) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function normalizeType(item) {
  return String(item?.mediaType || item?.type || '').toLowerCase().replace('image', 'photo');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CapacityBar({ items }) {
  const counts = useMemo(() => {
    const all = Array.isArray(items) ? items : [];
    return {
      music: all.filter(i => ['music', 'audio'].includes(normalizeType(i))).length,
      photo: all.filter(i => ['photo', 'image'].includes(normalizeType(i))).length,
      video: all.filter(i => normalizeType(i) === 'video').length,
      archive: all.filter(i => i?.archived || i?.isArchived).length,
    };
  }, [items]);

  const bar = (count, limit) => {
    const pct = Math.min(100, (count / limit) * 100);
    const color = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : '#34d399';
    return (
      <div className="ml-cap-bar-track">
        <div className="ml-cap-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    );
  };

  return (
    <div className="ml-capacity">
      <div className="ml-cap-item">
        <span>🎵 Music</span>
        <strong>{counts.music}/{LIMITS.music}</strong>
        {bar(counts.music, LIMITS.music)}
      </div>
      <div className="ml-cap-item">
        <span>📷 Photos</span>
        <strong>{counts.photo}/{LIMITS.photo}</strong>
        {bar(counts.photo, LIMITS.photo)}
      </div>
      <div className="ml-cap-item">
        <span>🎬 Videos</span>
        <strong>{counts.video}/{LIMITS.video}</strong>
        {bar(counts.video, LIMITS.video)}
      </div>
      <div className="ml-cap-item">
        <span>📦 Archive</span>
        <strong>{counts.archive}</strong>
      </div>
    </div>
  );
}

function MediaCard({ item, isSelected, onSelect, onDoubleClick }) {
  const type = normalizeType(item);
  const icon = getIcon(type);
  const title = String(item?.title || item?.name || 'Untitled').trim();
  const thumb = String(item?.thumbnailUrl || '').trim();

  return (
    <div
      className={`ml-card ${isSelected ? 'ml-card--selected' : ''}`}
      onClick={() => onSelect(item.id)}
      onDoubleClick={() => onDoubleClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onDoubleClick(item); }}
      title={`Double-click to preview: ${title}`}
    >
      {thumb ? (
        <div className="ml-card__thumb">
          <img src={thumb} alt={title} loading="lazy" />
        </div>
      ) : (
        <div className="ml-card__icon">{icon}</div>
      )}
      <div className="ml-card__name">{title}</div>
      <span className="ml-card__badge">{type || 'file'}</span>
      {item.fileSizeBytes > 0 && (
        <div className="ml-card__size">{formatBytes(item.fileSizeBytes)}</div>
      )}
      {!item.isVisibleInFeed && item.isVisibleInFeed !== undefined && (
        <div className="ml-card__hidden-badge">hidden</div>
      )}
    </div>
  );
}

function InlinePreview({ item, onClose }) {
  if (!item) return null;
  const type = normalizeType(item);
  const url = String(item?.mediaUrl || item?.blobUrl || '').trim();
  const thumb = String(item?.thumbnailUrl || '').trim();
  const title = String(item?.title || item?.name || 'Untitled').trim();
  const desc = String(item?.description || item?.desc || '').trim();

  let mediaEl;
  if (type === 'photo' || type === 'image') {
    const src = url || thumb;
    mediaEl = src
      ? <img src={src} alt={title} className="ml-preview__media" />
      : null;
  } else if (type === 'video') {
    mediaEl = url
      ? <video controls src={url} className="ml-preview__media" />
      : null;
  } else if (['music', 'audio', 'podcast'].includes(type)) {
    mediaEl = url
      ? <audio controls src={url} className="ml-preview__audio" />
      : null;
  }

  return (
    <div className="ml-preview">
      <div className="ml-preview__header">
        <span>{getIcon(type)} {title}</span>
        <button className="ml-preview__close" onClick={onClose} type="button" aria-label="Close preview">✕</button>
      </div>
      <div className="ml-preview__body">
        {mediaEl || (
          <div className="ml-preview__placeholder">
            {getIcon(type)} No inline preview available for this file type.
          </div>
        )}
        {(title || desc) && (
          <div className="ml-preview__meta">
            {title && <strong>{title}</strong>}
            {desc && <span className="ml-preview__desc">{desc}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const MediaLibrary = () => {
  const {
    getLibrary,
    deleteMedia,
    toggleVisibility,
    bulkToggleVisibility,
    loading: apiLoading,
    error: apiError,
  } = useSavedMedia();

  const [ui, setUi] = usePersistedState(UI_KEY, DEFAULT_UI);
  const { activeTab, filterType, sortBy, sortDir, showPlaylists } = ui;
  const patchUi = useCallback((patch) => setUi((c) => ({ ...c, ...patch })), [setUi]);

  const playlistsApi = usePlaylists();
  usePlaylistSync(playlistsApi);
  const { addToast } = useNotification();
  const { user } = useAuth();

  const [apiItems, setApiItems] = useState([]);
  const [localItems, setLocalItems] = usePersistedState(LOCAL_ITEMS_KEY, []);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [previewItem, setPreviewItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 40;
  const [publishing, setPublishing] = useState(false);
  const [connectingPlatform, setConnectingPlatform] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDesc, setUploadDesc] = useState('');
  const fileInputRef = useRef(null);

  const allItems = useMemo(() => {
    const seen = new Set(apiItems.map((i) => i.id));
    const extras = (localItems || []).filter((i) => {
      const mediaUrl = String(i?.mediaUrl || i?.blobUrl || '').trim().toLowerCase();
      return i.id && !seen.has(i.id) && mediaUrl && !mediaUrl.startsWith('blob:') && !mediaUrl.startsWith('file:');
    });
    return [...apiItems, ...extras];
  }, [apiItems, localItems]);

  const mediaLookup = useMemo(() => {
    const map = {};
    allItems.forEach((item) => { if (item?.id) map[item.id] = item; });
    return map;
  }, [allItems]);

  const typeCounts = useMemo(() => {
    const c = { all: 0, photo: 0, music: 0, video: 0, podcast: 0, archive: 0 };
    allItems.forEach((item) => {
      c.all++;
      const t = normalizeType(item);
      if (t === 'photo') c.photo++;
      else if (t === 'music' || t === 'audio') c.music++;
      else if (t === 'video') c.video++;
      else if (t === 'podcast') c.podcast++;
      if (item?.archived || item?.isArchived) c.archive++;
    });
    return c;
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let list = [...allItems];
    if (activeTab === 'archive') {
      list = list.filter((i) => i?.archived || i?.isArchived);
    } else if (activeTab === 'visible') {
      list = list.filter((i) => i?.isVisibleInFeed === true);
    } else if (activeTab === 'hidden') {
      list = list.filter((i) => i?.isVisibleInFeed === false);
    } else if (activeTab !== 'all') {
      list = list.filter((i) => {
        const t = normalizeType(i);
        return activeTab === 'music' ? (t === 'music' || t === 'audio') : t === activeTab;
      });
    }
    if (filterType) {
      list = list.filter((i) => normalizeType(i) === filterType);
    }
    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'title') return String(a?.title || '').localeCompare(String(b?.title || '')) * dir;
      return (new Date(a?.[sortBy] || 0).getTime() - new Date(b?.[sortBy] || 0).getTime()) * dir;
    });
    return list;
  }, [allItems, activeTab, filterType, sortBy, sortDir]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredItems.slice(start, start + PAGE_SIZE);
  }, [filteredItems, currentPage]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));

  const loadApiItems = useCallback(async () => {
    try {
      const res = await getLibrary(1, 200, { sortBy, sortDir });
      const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
      setApiItems(items);
    } catch { /* use local items only */ }
  }, [getLibrary, sortBy, sortDir]);

  useEffect(() => { loadApiItems(); }, [loadApiItems]);

  const handleLocalUpload = useCallback(async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) { addToast('Please select a file.', 'warning'); return; }
    const raw = file.type;
    let type = 'document';
    if (raw.startsWith('image/')) type = 'photo';
    else if (raw.startsWith('video/')) type = 'video';
    else if (raw.startsWith('audio/')) type = 'music';
    const limit = LIMITS[type];
    if (limit) {
      const existing = allItems.filter((i) => {
        const t = normalizeType(i);
        return type === 'music' ? (t === 'music' || t === 'audio') : t === type;
      }).length;
      if (existing >= limit) { addToast(`${type} capacity full (${limit}).`, 'warning'); return; }
    }
    const title = uploadTitle.trim() || file.name;
    const destinationFolder = `wiseravenshare/media-library/${type}`;

    try {
      const uploadResponse = type === 'music'
        ? await apiService.uploadMusicTrack(file, {
            title,
            artist: '',
            album: '',
            genre: '',
            destinationFolder,
          })
        : await apiService.uploadMedia(file, type, {
            title,
            description: uploadDesc.trim(),
            caption: uploadDesc.trim(),
            destinationFolder,
          });

      const data = uploadResponse?.data || uploadResponse || {};
      const mediaUrl = String(
        data.track?.mediaUrl ||
        data.mediaUrl ||
        data.url ||
        data.file?.mediaUrl ||
        data.filePath ||
        ''
      ).trim();
      const relativePath = String(
        data.track?.relativePath ||
        data.relativePath ||
        data.file?.relativePath ||
        data.objectKey ||
        data.filePath ||
        ''
      ).trim();

      const saved = await saveMedia({
        title,
        description: uploadDesc.trim(),
        mediaType: type,
        mediaUrl: mediaUrl || relativePath || '',
        thumbnailUrl: type === 'photo' ? (mediaUrl || '') : undefined,
        mediaMetadata: {
          fileName: file.name,
          relativePath,
          source: 'media-library',
          archived: false,
          protected: false,
        },
        isVisibleInFeed: true,
        tags: [],
        fileSizeBytes: file.size,
        durationSeconds: null,
      });

      const nextItem = {
        ...saved,
        id: saved.id,
        title: saved.title || title,
        name: saved.title || title,
        description: saved.description || uploadDesc.trim(),
        mediaType: saved.mediaType,
        type: saved.mediaType,
        mediaUrl: saved.mediaUrl || mediaUrl || relativePath,
        thumbnailUrl: saved.thumbnailUrl || (type === 'photo' ? (mediaUrl || relativePath) : ''),
        fileSizeBytes: saved.fileSizeBytes || file.size,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };

      setLocalItems((prev) => [nextItem, ...(prev || []).filter((item) => item.id !== nextItem.id)]);
      setUploadTitle(''); setUploadDesc('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      addToast(`"${nextItem.title}" added.`, 'success');
      await loadApiItems();
    } catch (error) {
      addToast(error?.message || 'Upload failed.', 'error');
    }
  }, [addToast, loadApiItems, saveMedia, uploadDesc, uploadTitle, setLocalItems]);

  const handleSelectItem = useCallback((id) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleVisibility = useCallback(async (id, current) => {
    try {
      await toggleVisibility(id, !current);
      setApiItems((prev) => prev.map((i) => (i.id === id ? { ...i, isVisibleInFeed: !current } : i)));
    } catch { /* ignore */ }
  }, [toggleVisibility]);

  const handleBulkToggleVisibility = useCallback(async (isVisible) => {
    if (!selectedItems.size) { addToast('Select items first.', 'warning'); return; }
    try {
      await bulkToggleVisibility(Array.from(selectedItems), isVisible);
      setApiItems((prev) =>
        prev.map((i) => (selectedItems.has(i.id) ? { ...i, isVisibleInFeed: isVisible } : i))
      );
      setSelectedItems(new Set());
    } catch { /* ignore */ }
  }, [addToast, bulkToggleVisibility, selectedItems]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Delete this item?')) return;
    const item = mediaLookup[id];
    if (item?._isLocal) {
      if (item.blobUrl) URL.revokeObjectURL(item.blobUrl);
      setLocalItems((prev) => (prev || []).filter((i) => i.id !== id));
    } else {
      try { await deleteMedia(id); } catch { return; }
      setApiItems((prev) => prev.filter((i) => i.id !== id));
    }
    setSelectedItems((prev) => { const n = new Set(prev); n.delete(id); return n; });
    if (previewItem?.id === id) setPreviewItem(null);
  }, [deleteMedia, mediaLookup, previewItem, setLocalItems]);

  const handleAddSelectionToPlaylist = useCallback((playlistId) => {
    playlistsApi.addManyToPlaylist(playlistId, Array.from(selectedItems));
  }, [playlistsApi, selectedItems]);

  const handleCreateAndAdd = useCallback((name) => {
    const id = playlistsApi.createPlaylist(name);
    playlistsApi.addManyToPlaylist(id, Array.from(selectedItems));
  }, [playlistsApi, selectedItems]);

  const runPublish = useCallback(async (buildPayload, platformLabel) => {
    const selection = Array.from(selectedItems).map((id) => mediaLookup[id]).filter(Boolean);
    if (!selection.length) { setPublishMessage(`Select items to publish to ${platformLabel}.`); return; }
    setPublishing(true); setPublishMessage('');
    try {
      const results = await Promise.allSettled(selection.map((item) => {
        const url = String(item?.mediaUrl || '').trim();
        if (!url || url.startsWith('blob:')) throw new Error(`"${item?.title || 'Item'}" has no public URL.`);
        return socialService.publishContent(buildPayload(item, url));
      }));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const err = results.find((r) => r.status === 'rejected')?.reason?.message;
      if (ok) { const m = `Published ${ok} item(s) to ${platformLabel}.`; setPublishMessage(m); addToast(m, 'success'); }
      if (err) { setPublishMessage(err); addToast(err, 'warning'); }
    } catch (e) {
      const m = e?.message || `Failed to publish to ${platformLabel}.`;
      setPublishMessage(m); addToast(m, 'error');
    } finally { setPublishing(false); }
  }, [addToast, mediaLookup, selectedItems]);

  const ensureUserPlatformAccess = useCallback(async (platform, label) => {
    const userId = String(user?.id || '').trim();
    if (!userId) {
      const msg = `Sign in to connect your ${label} account.`;
      setPublishMessage(msg);
      addToast(msg, 'warning');
      return false;
    }

    try {
      setConnectingPlatform(platform);
      const statusResponse = await apiService.getSocialConnectStatus(platform, userId);
      const status = statusResponse?.data || {};
      const connected = Boolean(status.connected || status.isConnected || status.active || status.enabled);
      if (connected) {
        return true;
      }

      const startResponse = await apiService.startSocialConnect(platform, userId);
      const authUrl = String(
        startResponse?.data?.authorize_url
        || startResponse?.data?.authorizeUrl
        || startResponse?.data?.url
        || ''
      ).trim();

      if (authUrl) {
        const msg = `Complete ${label} access for your account to continue publishing.`;
        setPublishMessage(msg);
        addToast(msg, 'info');
        window.location.assign(authUrl);
        return false;
      }

      const fallback = `Connect your ${label} account from Settings before publishing.`;
      setPublishMessage(fallback);
      addToast(fallback, 'warning');
      return false;
    } catch (error) {
      const msg = error?.message || `Unable to verify ${label} account access.`;
      setPublishMessage(msg);
      addToast(msg, 'error');
      return false;
    } finally {
      setConnectingPlatform('');
    }
  }, [addToast, user?.id]);

  const handleMetaPublish = useCallback(async () => {
    const hasAccess = await ensureUserPlatformAccess('facebook', 'Facebook');
    if (!hasAccess) return;
    await runPublish(
      (item, url) => buildMediaSharePayload({
        message: `${item?.title || 'Media'} via WiseRavenShare`,
        mediaUrl: url,
        linkUrl: url,
        publishToFacebook: true,
        publishToInstagram: true
      }),
      'Meta'
    );
  }, [ensureUserPlatformAccess, runPublish]);

  const handleTikTokPublish = useCallback(async () => {
    const hasAccess = await ensureUserPlatformAccess('tiktok', 'TikTok');
    if (!hasAccess) return;
    await runPublish(
      (item, url) => buildMediaSharePayload({
        message: `${item?.title || 'Video'} via WiseRavenShare`,
        mediaUrl: url,
        linkUrl: url,
        publishToTikTok: true
      }),
      'TikTok'
    );
  }, [ensureUserPlatformAccess, runPublish]);

  const handleRedditShare = useCallback(() => {
    const item = Array.from(selectedItems).map((id) => mediaLookup[id]).filter(Boolean)[0];
    if (!item) { setPublishMessage('Select an item for Reddit.'); return; }
    const url = String(item?.mediaUrl || item?.thumbnailUrl || '').trim();
    if (!url || url.startsWith('blob:')) { addToast('Reddit requires a public URL.', 'warning'); return; }
    window.open(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(item?.title || 'WiseRaven')}`, '_blank', 'noopener,noreferrer');
    const m = 'Opened Reddit draft.'; setPublishMessage(m); addToast(m, 'success');
  }, [addToast, mediaLookup, selectedItems]);

  const TABS = [
    { id: 'all', label: 'All', count: typeCounts.all },
    { id: 'photo', label: 'Photos', count: typeCounts.photo },
    { id: 'music', label: 'Music', count: typeCounts.music },
    { id: 'video', label: 'Videos', count: typeCounts.video },
    { id: 'podcast', label: 'Podcasts', count: typeCounts.podcast },
    { id: 'visible', label: 'Visible' },
    { id: 'hidden', label: 'Hidden' },
    { id: 'archive', label: 'Archive', count: typeCounts.archive },
  ];

  return (
    <div className="media-library">
      <header className="media-library-header">
        <h1>📀 Media Library</h1>
        <p className="subtitle">All your photos, music, videos, and more in one unified library.
          <br /><small>Double-click any card to preview it inline.</small>
        </p>
      </header>

      <CapacityBar items={allItems} />

      <div className="ml-upload-panel">
        <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*" className="ml-upload-file" />
        <input type="text" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Optional title" className="ml-upload-text" />
        <input type="text" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Optional description" className="ml-upload-text" />
        <button className="ml-upload-btn" onClick={handleLocalUpload} type="button">⬆ Add to Library</button>
        <button className="ml-upload-btn ml-upload-btn--outline" onClick={loadApiItems} type="button" title="Reload from server">↻ Sync</button>
      </div>

      <div className={`media-library-content ${showPlaylists ? 'with-playlists' : ''}`}>
        <div className="media-library-sidebar">
          <button className="toggle-playlists-btn" onClick={() => patchUi({ showPlaylists: !showPlaylists })} aria-pressed={showPlaylists} type="button">
            {showPlaylists ? '◀ Hide playlists' : '▶ Show playlists'}
          </button>
          {showPlaylists && (
            <PlaylistDrawer
              playlists={playlistsApi.playlists}
              activePlaylist={playlistsApi.activePlaylist}
              mediaLookup={mediaLookup}
              onSelectPlaylist={playlistsApi.setActivePlaylist}
              onCreatePlaylist={playlistsApi.createPlaylist}
              onRenamePlaylist={playlistsApi.renamePlaylist}
              onDeletePlaylist={playlistsApi.deletePlaylist}
              onRemoveItem={(playlistId, mediaId) => playlistsApi.removeFromPlaylist(playlistId, mediaId)}
              onReorderItem={(from, to) => { if (playlistsApi.activePlaylist) playlistsApi.reorderPlaylist(playlistsApi.activePlaylist.id, from, to); }}
              onPlayPlaylist={(id) => window.dispatchEvent(new CustomEvent('media:play-playlist', { detail: { playlistId: id } }))}
            />
          )}
        </div>

        <main className="media-library-main">
          <div className="media-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.id} role="tab" aria-selected={activeTab === tab.id}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => { patchUi({ activeTab: tab.id }); setCurrentPage(1); }}
                type="button"
              >
                {tab.label}
                {tab.count !== undefined && <span className="ml-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>

          <div className="ml-sort-row">
            <label className="ml-sort-label">
              Sort&nbsp;
              <select className="ml-sort-select" value={sortBy} onChange={(e) => { patchUi({ sortBy: e.target.value }); setCurrentPage(1); }}>
                <option value="createdAt">Date</option>
                <option value="title">Title</option>
                <option value="fileSizeBytes">Size</option>
              </select>
            </label>
            <button className="ml-sort-dir" onClick={() => patchUi({ sortDir: sortDir === 'desc' ? 'asc' : 'desc' })} type="button">
              {sortDir === 'desc' ? '↓' : '↑'}
            </button>
            {selectedItems.size > 0 && (
              <button className="btn-action" type="button"
                onClick={() => setSelectedItems((p) => p.size === pagedItems.length ? new Set() : new Set(pagedItems.map((i) => i.id)))}>
                {selectedItems.size === pagedItems.length ? 'Deselect all' : `Select all (${pagedItems.length})`}
              </button>
            )}
          </div>

          {selectedItems.size > 0 && (
            <div className="bulk-actions">
              <span className="selection-count">{selectedItems.size} selected</span>
              <button className="btn-action btn-show" onClick={() => handleBulkToggleVisibility(true)} type="button">👁️ Show</button>
              <button className="btn-action btn-hide" onClick={() => handleBulkToggleVisibility(false)} type="button">🙈 Hide</button>
              <AddToPlaylistMenu playlists={playlistsApi.playlists} onAddToExisting={handleAddSelectionToPlaylist} onCreateAndAdd={handleCreateAndAdd} />
              <button className="btn-action" onClick={handleTikTokPublish} disabled={publishing || connectingPlatform === 'tiktok'} type="button">🎵 TikTok</button>
              <button className="btn-action" onClick={handleMetaPublish} disabled={publishing || connectingPlatform === 'facebook'} type="button">📘 Meta</button>
              <button className="btn-action" onClick={handleRedditShare} type="button">🤖 Reddit</button>
            </div>
          )}

          {publishMessage && <div className="ml-publish-msg">{publishMessage}</div>}
          {apiError && <div className="error-message">⚠️ {apiError}</div>}

          {apiLoading && !allItems.length ? (
            <div className="loading">Loading library…</div>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <p>📭 No media in this view</p>
              <p className="hint">Upload a file above or switch tabs.</p>
            </div>
          ) : (
            <div className="ml-grid">
              {pagedItems.map((item) => (
                <MediaCard key={item.id} item={item} isSelected={selectedItems.has(item.id)} onSelect={handleSelectItem} onDoubleClick={setPreviewItem} />
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="ml-pagination">
              <button className="btn-action" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} type="button">← Prev</button>
              <span className="ml-page-label">Page {currentPage} / {pageCount}</span>
              <button className="btn-action" onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage === pageCount} type="button">Next →</button>
            </div>
          )}

          {selectedItems.size === 1 && (() => {
            const [id] = selectedItems;
            const item = mediaLookup[id];
            if (!item) return null;
            return (
              <div className="ml-item-actions">
                <button className="btn-action" onClick={() => handleToggleVisibility(item.id, item.isVisibleInFeed)} type="button">
                  {item.isVisibleInFeed ? '🙈 Hide from feed' : '👁️ Show in feed'}
                </button>
                <button className="btn-action btn-danger" onClick={() => handleDelete(item.id)} type="button">🗑️ Delete</button>
              </div>
            );
          })()}

          <InlinePreview item={previewItem} onClose={() => setPreviewItem(null)} />
        </main>
      </div>
    </div>
  );
};

export default MediaLibrary;
