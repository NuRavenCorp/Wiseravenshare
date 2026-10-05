// wiseravenshare.client/src/Components/MediaLibrary/MediaLibrary.jsx

import React, {
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react';

import './MediaLibrary.css';

import MediaGrid from './MediaGrid';
import MediaUpload from './MediaUpload';
import MediaFilters from './MediaFilters';
import MediaStats from './MediaStats';
import MediaPagination from './MediaPagination';

import { useSavedMedia } from '../../hooks/useSavedMedia';

const STORAGE_KEY = 'media-library-state';

const MediaLibrary = () => {
  const {
    getLibrary,
    getLibraryStats,
    getVisibleMedia,
    getHiddenMedia,
    getScheduledMedia,
    deleteMedia,
    toggleVisibility,
    bulkToggleVisibility,
    loading,
    error
  } = useSavedMedia();

  const requestRef = useRef(0);

  const [mediaItems, setMediaItems] = useState([]);
  const [stats, setStats] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const [selectedItems, setSelectedItems] = useState(
    new Set()
  );

  const [filterType, setFilterType] = useState(null);
  const [visibilityFilter, setVisibilityFilter] =
    useState(null);

  const [activeTab, setActiveTab] =
    useState('all');

  const [refreshKey, setRefreshKey] =
    useState(0);

  // Restore previous state
  useEffect(() => {
    try {
      const saved = localStorage.getItem(
        STORAGE_KEY
      );

      if (!saved) return;

      const state = JSON.parse(saved);

      setCurrentPage(state.currentPage || 1);
      setPageSize(state.pageSize || 20);
      setFilterType(state.filterType || null);
      setVisibilityFilter(
        state.visibilityFilter || null
      );
      setActiveTab(state.activeTab || 'all');
    } catch (err) {
      console.error(
        'Failed to restore library state',
        err
      );
    }
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        currentPage,
        pageSize,
        filterType,
        visibilityFilter,
        activeTab
      })
    );
  }, [
    currentPage,
    pageSize,
    filterType,
    visibilityFilter,
    activeTab
  ]);

  // Clear selections when changing views
  useEffect(() => {
    setSelectedItems(new Set());
  }, [
    currentPage,
    activeTab,
    filterType,
    visibilityFilter
  ]);

  const loadStats = useCallback(async () => {
    try {
      const data = await getLibraryStats();
      setStats(data);
    } catch (err) {
      console.error(
        'Error loading stats:',
        err
      );
    }
  }, [getLibraryStats]);

  const loadMedia = useCallback(async () => {
    const requestId =
      ++requestRef.current;

    try {
      let response;

      switch (activeTab) {
        case 'visible':
          response =
            await getVisibleMedia(
              currentPage,
              pageSize
            );
          break;

        case 'hidden':
          response =
            await getHiddenMedia(
              currentPage,
              pageSize
            );
          break;

        case 'scheduled':
          response =
            await getScheduledMedia(
              currentPage,
              pageSize
            );
          break;

        default:
          response =
            await getLibrary(
              currentPage,
              pageSize,
              {
                mediaType:
                  filterType,
                onlyVisible:
                  visibilityFilter
              }
            );
      }

      if (
        requestId !==
        requestRef.current
      ) {
        return;
      }

      const items = Array.isArray(
        response
      )
        ? response
        : response?.items ||
          response?.data ||
          [];

      setMediaItems(items);

      setTotalCount(
        response?.totalCount ??
          response?.total ??
          items.length
      );
    } catch (err) {
      console.error(
        'Error loading media:',
        err
      );
    }
  }, [
    activeTab,
    currentPage,
    pageSize,
    filterType,
    visibilityFilter,
    getLibrary,
    getVisibleMedia,
    getHiddenMedia,
    getScheduledMedia
  ]);

  useEffect(() => {
    loadMedia();
    loadStats();
  }, [
    loadMedia,
    loadStats,
    refreshKey
  ]);

  const refreshLibrary =
    useCallback(() => {
      setRefreshKey(
        prev => prev + 1
      );
    }, []);

  const handleDeleteMedia =
    useCallback(
      async (mediaId) => {
        if (
          !window.confirm(
            'Delete this media item?'
          )
        ) {
          return;
        }

        try {
          await deleteMedia(mediaId);

          setMediaItems(prev =>
            prev.filter(
              item =>
                item.id !== mediaId
            )
          );

          refreshLibrary();
        } catch (err) {
          console.error(
            'Delete failed:',
            err
          );
        }
      },
      [deleteMedia, refreshLibrary]
    );

  const handleToggleVisibility =
    useCallback(
      async (
        mediaId,
        currentVisibility
      ) => {
        try {
          await toggleVisibility(
            mediaId,
            !currentVisibility
          );

          setMediaItems(prev =>
            prev.map(item =>
              item.id === mediaId
                ? {
                    ...item,
                    isVisibleInFeed:
                      !currentVisibility
                  }
                : item
            )
          );

          loadStats();
        } catch (err) {
          console.error(
            'Visibility update failed:',
            err
          );
        }
      },
      [toggleVisibility, loadStats]
    );

  const handleBulkToggleVisibility =
    useCallback(
      async (isVisible) => {
        if (
          selectedItems.size === 0
        ) {
          return;
        }

        try {
          await bulkToggleVisibility(
            Array.from(
              selectedItems
            ),
            isVisible
          );

          setMediaItems(prev =>
            prev.map(item =>
              selectedItems.has(
                item.id
              )
                ? {
                    ...item,
                    isVisibleInFeed:
                      isVisible
                  }
                : item
            )
          );

          setSelectedItems(
            new Set()
          );

          refreshLibrary();
        } catch (err) {
          console.error(
            'Bulk update failed:',
            err
          );
        }
      },
      [
        selectedItems,
        bulkToggleVisibility,
        refreshLibrary
      ]
    );

  const handleSelectItem =
    useCallback((mediaId) => {
      setSelectedItems(prev => {
        const next =
          new Set(prev);

        if (next.has(mediaId)) {
          next.delete(mediaId);
        } else {
          next.add(mediaId);
        }

        return next;
      });
    }, []);

  const handleSelectAll =
    useCallback(() => {
      setSelectedItems(prev => {
        if (
          prev.size ===
          mediaItems.length
        ) {
          return new Set();
        }

        return new Set(
          mediaItems.map(
            item => item.id
          )
        );
      });
    }, [mediaItems]);

  const handleMediaUploaded =
    useCallback(() => {
      setCurrentPage(1);
      refreshLibrary();
    }, [refreshLibrary]);

  return (
    <div className="media-library">
      <div className="media-library-header">
        <h1>📚 Media Library</h1>

        <p className="subtitle">
          Organize, hide, and manage
          your media collection
        </p>
      </div>

      {stats && (
        <MediaStats stats={stats} />
      )}

      <div className="media-library-content">
        <div className="media-library-sidebar">
          <MediaUpload
            onMediaUploaded={
              handleMediaUploaded
            }
          />
        </div>

        <div className="media-library-main">
          <div className="media-tabs">
            {[
              'all',
              'visible',
              'hidden',
              'scheduled'
            ].map(tab => (
              <button
                key={tab}
                className={`tab ${
                  activeTab === tab
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  setActiveTab(tab);
                  setCurrentPage(1);
                }}
              >
                {tab
                  .charAt(0)
                  .toUpperCase() +
                  tab.slice(1)}
              </button>
            ))}
          </div>

          <div className="media-toolbar">
            <MediaFilters
              filterType={
                filterType
              }
              visibilityFilter={
                visibilityFilter
              }
              onFilterTypeChange={(
                type
              ) => {
                setFilterType(type);
                setCurrentPage(1);
              }}
              onVisibilityChange={(
                visible
              ) => {
                setVisibilityFilter(
                  visible
                );
                setCurrentPage(1);
              }}
              onClearFilters={() => {
                setFilterType(
                  null
                );
                setVisibilityFilter(
                  null
                );
                setCurrentPage(1);
              }}
            />

            {selectedItems.size >
              0 && (
              <div className="bulk-actions">
                <span className="selection-count">
                  {
                    selectedItems.size
                  }{' '}
                  selected
                </span>

                <button
                  className="btn-action btn-show"
                  onClick={() =>
                    handleBulkToggleVisibility(
                      true
                    )
                  }
                >
                  👁️ Show
                </button>

                <button
                  className="btn-action btn-hide"
                  onClick={() =>
                    handleBulkToggleVisibility(
                      false
                    )
                  }
                >
                  🙈 Hide
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}

          {loading ? (
            <div className="loading">
              Loading media...
            </div>
          ) : mediaItems.length ===
            0 ? (
            <div className="empty-state">
              <p>
                📭 No media found
              </p>

              <p className="hint">
                Upload or save media
                to get started
              </p>
            </div>
          ) : (
            <>
              <MediaGrid
                items={mediaItems}
                selectedItems={
                  selectedItems
                }
                onSelectItem={
                  handleSelectItem
                }
                onSelectAll={
                  handleSelectAll
                }
                onToggleVisibility={
                  handleToggleVisibility
                }
                onDelete={
                  handleDeleteMedia
                }
                selectAllChecked={
                  mediaItems.length >
                    0 &&
                  selectedItems.size ===
                    mediaItems.length
                }
              />

              <MediaPagination
                currentPage={
                  currentPage
                }
                pageSize={pageSize}
                totalCount={
                  totalCount
                }
                onPageChange={
                  setCurrentPage
                }
                onPageSizeChange={size => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaLibrary;