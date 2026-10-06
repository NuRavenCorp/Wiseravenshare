import { useCallback, useEffect, useMemo, useState } from 'react';
import './MediaLibrary.css';
import MediaGrid from './MediaGrid';
import MediaUpload from './MediaUpload';
import MediaFilters from './MediaFilters';
import MediaStats from './MediaStats';
import MediaPagination from './MediaPagination';
import PlaylistDrawer from './PlaylistDrawer';
import AddToPlaylistMenu from './AddToPlaylistMenu';
import { useSavedMedia } from '../../hooks/useSavedMedia';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useMediaCache } from '../../hooks/useMediaCache';
import { usePlaylists } from '../../hooks/usePlaylists';
import { usePlaylistSync } from '../../hooks/usePlaylistSync';

const UI_KEY = 'ml:ui:v1';
const SELECTED_KEY = 'ml:selected:v1';

const DEFAULT_UI = {
  activeTab: 'all',
  filterType: null,
  visibilityFilter: null,
  currentPage: 1,
  pageSize: 20,
  sortBy: 'createdAt',
  sortDir: 'desc',
  viewMode: 'grid',
  showPlaylists: true,
};

const darkThemeStyle = {
  background: '#0b1020',
  color: '#e2e8f0',
  minHeight: '100vh',
  padding: '24px 16px',
  boxSizing: 'border-box',
};

const headerStyle = {
  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.9))',
  border: '1px solid rgba(148, 163, 184, 0.2)',
  borderRadius: '16px',
  padding: '20px 24px',
  boxShadow: '0 12px 30px rgba(15, 23, 42, 0.35)',
};

const MediaLibrary = () => {
  const {
    getLibrary,
    getLibraryStats,
    deleteMedia,
    toggleVisibility,
    bulkToggleVisibility,
    loading,
    error,
  } = useSavedMedia();

  const [ui, setUi] = usePersistedState(UI_KEY, DEFAULT_UI);
  const [persistedSelectedIds, setPersistedSelectedIds] = usePersistedState(SELECTED_KEY, []);
  const {
    activeTab,
    filterType,
    visibilityFilter,
    currentPage,
    pageSize,
    sortBy,
    sortDir,
    viewMode,
    showPlaylists,
  } = ui;

  const patchUi = useCallback((patch) => {
    setUi((current) => ({ ...current, ...patch }));
  }, [setUi]);

  const cache = useMediaCache();
  const playlistsApi = usePlaylists();
  usePlaylistSync(playlistsApi);

  const [mediaItems, setMediaItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItems, setSelectedItems] = useState(() => new Set(persistedSelectedIds || []));
  const [hydratedFromCache, setHydratedFromCache] = useState(false);

  const mediaLookup = useMemo(() => {
    const map = {};
    mediaItems.forEach((item) => {
      if (item?.id) map[item.id] = item;
    });
    return map;
  }, [mediaItems]);

  useEffect(() => {
    setPersistedSelectedIds(Array.from(selectedItems));
  }, [selectedItems, setPersistedSelectedIds]);

  const fetchPage = useCallback(async ({
    tab,
    page,
    size,
    type,
    visibility,
    orderBy,
    orderDirection,
  }) => {
    const baseFilters = {
      mediaType: type,
      onlyVisible: visibility,
      sortBy: orderBy,
      sortDir: orderDirection,
    };

    switch (tab) {
      case 'visible':
        return getLibrary(page, size, { ...baseFilters, onlyVisible: true });
      case 'hidden':
        return getLibrary(page, size, { ...baseFilters, onlyVisible: false });
      case 'scheduled':
        return getLibrary(page, size, { ...baseFilters, scheduledOnly: true });
      default:
        return getLibrary(page, size, baseFilters);
    }
  }, [getLibrary]);

  useEffect(() => {
    const cached = cache.read(
      currentPage,
      pageSize,
      activeTab,
      filterType,
      visibilityFilter,
      sortBy,
      sortDir,
      viewMode
    );

    if (cached.items) {
      setMediaItems(cached.items);
      setTotalCount(cached.total ?? cached.items.length);
      setHydratedFromCache(true);
    }

    if (cached.stats) {
      setStats(cached.stats);
    }
  }, [activeTab, cache, currentPage, filterType, pageSize, sortBy, sortDir, viewMode, visibilityFilter]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetchPage({
          tab: activeTab,
          page: currentPage,
          size: pageSize,
          type: filterType,
          visibility: visibilityFilter,
          orderBy: sortBy,
          orderDirection: sortDir,
        });

        if (cancelled) return;
        const items = Array.isArray(response) ? response : (response.items || response.data || []);
        const total = response?.totalCount ?? response?.total ?? items.length;

        setMediaItems(items);
        setTotalCount(total);

        cache.write(
          currentPage,
          pageSize,
          activeTab,
          filterType,
          visibilityFilter,
          sortBy,
          sortDir,
          viewMode,
          items,
          total
        );
      } catch (loadError) {
        console.error('Error loading media:', loadError);
      } finally {
        if (!cancelled) setHydratedFromCache(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    cache,
    currentPage,
    fetchPage,
    filterType,
    pageSize,
    sortBy,
    sortDir,
    viewMode,
    visibilityFilter,
  ]);

  const refreshStats = useCallback(async () => {
    try {
      const data = await getLibraryStats();
      setStats(data);
      cache.writeStats(data);
    } catch {
      // Ignore transient stats fetch errors.
    }
  }, [cache, getLibraryStats]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleDeleteMedia = useCallback(async (mediaId) => {
    if (!window.confirm('Are you sure you want to delete this media?')) return;

    try {
      await deleteMedia(mediaId);
      setMediaItems((items) => items.filter((item) => item.id !== mediaId));
      setSelectedItems((selected) => {
        const next = new Set(selected);
        next.delete(mediaId);
        return next;
      });

      playlistsApi.playlists.forEach((playlist) => {
        if (playlist.items.includes(mediaId)) {
          playlistsApi.removeFromPlaylist(playlist.id, mediaId);
        }
      });

      cache.invalidate();
      refreshStats();
    } catch (deleteError) {
      console.error('Error deleting media:', deleteError);
    }
  }, [cache, deleteMedia, playlistsApi, refreshStats]);

  const handleToggleVisibility = useCallback(async (mediaId, currentVisibility) => {
    try {
      await toggleVisibility(mediaId, !currentVisibility);
      setMediaItems((items) =>
        items.map((item) => (
          item.id === mediaId ? { ...item, isVisibleInFeed: !currentVisibility } : item
        ))
      );
      refreshStats();
    } catch (toggleError) {
      console.error('Error toggling visibility:', toggleError);
    }
  }, [refreshStats, toggleVisibility]);

  const handleBulkToggleVisibility = useCallback(async (isVisible) => {
    if (selectedItems.size === 0) {
      alert('Please select media items first');
      return;
    }

    try {
      await bulkToggleVisibility(Array.from(selectedItems), isVisible);
      setMediaItems((items) =>
        items.map((item) => (
          selectedItems.has(item.id) ? { ...item, isVisibleInFeed: isVisible } : item
        ))
      );
      setSelectedItems(new Set());
      refreshStats();
    } catch (bulkError) {
      console.error('Error in bulk toggle:', bulkError);
    }
  }, [bulkToggleVisibility, refreshStats, selectedItems]);

  const handleSelectItem = useCallback((mediaId) => {
    setSelectedItems((selected) => {
      const next = new Set(selected);
      if (next.has(mediaId)) {
        next.delete(mediaId);
      } else {
        next.add(mediaId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedItems((selected) => (
      selected.size === mediaItems.length
        ? new Set()
        : new Set(mediaItems.map((item) => item.id))
    ));
  }, [mediaItems]);

  const handleMediaUploaded = useCallback(() => {
    patchUi({ currentPage: 1 });
    cache.invalidate();
    refreshStats();
  }, [cache, patchUi, refreshStats]);

  const handleAddSelectionToPlaylist = useCallback((playlistId) => {
    playlistsApi.addManyToPlaylist(playlistId, Array.from(selectedItems));
  }, [playlistsApi, selectedItems]);

  const handleCreateAndAdd = useCallback((name) => {
    const playlistId = playlistsApi.createPlaylist(name);
    playlistsApi.addManyToPlaylist(playlistId, Array.from(selectedItems));
  }, [playlistsApi, selectedItems]);

  const handleRemoveFromPlaylist = useCallback((playlistId, mediaId) => {
    playlistsApi.removeFromPlaylist(playlistId, mediaId);
  }, [playlistsApi]);

  const handleReorderPlaylist = useCallback((from, to) => {
    if (!playlistsApi.activePlaylist) return;
    playlistsApi.reorderPlaylist(playlistsApi.activePlaylist.id, from, to);
  }, [playlistsApi]);

  const handlePlayPlaylist = useCallback((playlistId) => {
    window.dispatchEvent(new CustomEvent('media:play-playlist', { detail: { playlistId } }));
  }, []);

  return (
    <div className="media-library">
      <header className="media-library-header">
        <h1>📚 Media Library</h1>
        <p className="subtitle">Organize, hide, and manage your media collection</p>
      </header>

      {stats && <MediaStats stats={stats} />}

      <div className={`media-library-content ${showPlaylists ? 'with-playlists' : ''}`}>
        <div className="media-library-sidebar">
          <MediaUpload onMediaUploaded={handleMediaUploaded} />

          <button
            className="toggle-playlists-btn"
            onClick={() => patchUi({ showPlaylists: !showPlaylists })}
            aria-pressed={showPlaylists}
            type="button"
          >
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
              onRemoveItem={handleRemoveFromPlaylist}
              onReorderItem={handleReorderPlaylist}
              onPlayPlaylist={handlePlayPlaylist}
            />
          )}
        </div>

        <main className="media-library-main">
          <div className="media-tabs" role="tablist">
            {['all', 'visible', 'hidden', 'scheduled'].map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => patchUi({ activeTab: tab, currentPage: 1 })}
                type="button"
              >
                {tab[0].toUpperCase() + tab.slice(1)} Media
              </button>
            ))}
          </div>

          <div className="media-toolbar">
            <MediaFilters
              filterType={filterType}
              onFilterTypeChange={(type) => patchUi({ filterType: type, currentPage: 1 })}
              onClearFilters={() => patchUi({ filterType: null, visibilityFilter: null, currentPage: 1 })}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={(by, dir) => patchUi({ sortBy: by, sortDir: dir, currentPage: 1 })}
              viewMode={viewMode}
              onViewModeChange={(mode) => patchUi({ viewMode: mode })}
            />

            {selectedItems.size > 0 && (
              <div className="bulk-actions">
                <span className="selection-count">{selectedItems.size} selected</span>
                <button
                  className="btn-action btn-show"
                  onClick={() => handleBulkToggleVisibility(true)}
                  title="Show selected items in feed"
                  type="button"
                >
                  👁️ Show ({selectedItems.size})
                </button>
                <button
                  className="btn-action btn-hide"
                  onClick={() => handleBulkToggleVisibility(false)}
                  title="Hide selected items from feed"
                  type="button"
                >
                  🙈 Hide ({selectedItems.size})
                </button>
                <AddToPlaylistMenu
                  playlists={playlistsApi.playlists}
                  onAddToExisting={handleAddSelectionToPlaylist}
                  onCreateAndAdd={handleCreateAndAdd}
                />
              </div>
            )}
          </div>

          {error && <div className="error-message">⚠️ {error}</div>}

          {loading && !hydratedFromCache ? (
            <div className="loading">Loading media...</div>
          ) : mediaItems.length === 0 ? (
            <div className="empty-state">
              <p>📭 No media found</p>
              <p className="hint">Upload or save media to get started</p>
            </div>
          ) : (
            <>
              <MediaGrid
                items={mediaItems}
                viewMode={viewMode}
                selectedItems={selectedItems}
                onSelectItem={handleSelectItem}
                onSelectAll={handleSelectAll}
                onToggleVisibility={handleToggleVisibility}
                onDelete={handleDeleteMedia}
                onAddToPlaylist={handleAddSelectionToPlaylist}
                playlists={playlistsApi.playlists}
                selectAllChecked={selectedItems.size === mediaItems.length && mediaItems.length > 0}
              />

              <MediaPagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={(page) => patchUi({ currentPage: page })}
                onPageSizeChange={(size) => patchUi({ pageSize: size, currentPage: 1 })}
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default MediaLibrary;
