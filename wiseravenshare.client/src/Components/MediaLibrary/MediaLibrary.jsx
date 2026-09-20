// wiseravenshare.client/src/Components/MediaLibrary/MediaLibrary.jsx
import React, { useState, useEffect } from 'react';
import './MediaLibrary.css';
import MediaGrid from './MediaGrid';
import MediaUpload from './MediaUpload';
import MediaFilters from './MediaFilters';
import MediaStats from './MediaStats';
import MediaPagination from './MediaPagination';
import { useSavedMedia } from '../../hooks/useSavedMedia';

/**
 * Main Media Library component
 * Displays user's saved media with filtering, sorting, and management options
 */
const MediaLibrary = () => {
  const { 
    getLibrary, 
    getLibraryStats, 
    deleteMedia, 
    toggleVisibility,
    bulkToggleVisibility,
    loading, 
    error 
  } = useSavedMedia();

  const [mediaItems, setMediaItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [filterType, setFilterType] = useState(null);
  const [visibilityFilter, setVisibilityFilter] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // all, visible, hidden, scheduled

  useEffect(() => {
    loadMedia();
    loadStats();
  }, [currentPage, pageSize, filterType, visibilityFilter, activeTab]);

  const loadMedia = async () => {
    try {
      let response;
      
      switch (activeTab) {
        case 'visible':
          response = await getVisibleMedia(currentPage, pageSize);
          break;
        case 'hidden':
          response = await getHiddenMedia(currentPage, pageSize);
          break;
        case 'scheduled':
          response = await getScheduledMedia(currentPage, pageSize);
          break;
        default:
          response = await getLibrary(currentPage, pageSize, {
            mediaType: filterType,
            onlyVisible: visibilityFilter
          });
      }

      setMediaItems(response.items || []);
      setTotalCount(response.totalCount || 0);
    } catch (err) {
      console.error('Error loading media:', err);
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getLibraryStats();
      setStats(statsData);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleDeleteMedia = async (mediaId) => {
    if (!window.confirm('Are you sure you want to delete this media?')) return;

    try {
      await deleteMedia(mediaId);
      setMediaItems(mediaItems.filter(item => item.id !== mediaId));
      loadStats();
    } catch (err) {
      console.error('Error deleting media:', err);
    }
  };

  const handleToggleVisibility = async (mediaId, currentVisibility) => {
    try {
      await toggleVisibility(mediaId, !currentVisibility);
      setMediaItems(mediaItems.map(item => 
        item.id === mediaId 
          ? { ...item, isVisibleInFeed: !currentVisibility }
          : item
      ));
      loadStats();
    } catch (err) {
      console.error('Error toggling visibility:', err);
    }
  };

  const handleBulkToggleVisibility = async (isVisible) => {
    if (selectedItems.size === 0) {
      alert('Please select media items first');
      return;
    }

    try {
      await bulkToggleVisibility(Array.from(selectedItems), isVisible);
      setMediaItems(mediaItems.map(item =>
        selectedItems.has(item.id)
          ? { ...item, isVisibleInFeed: isVisible }
          : item
      ));
      setSelectedItems(new Set());
      loadStats();
    } catch (err) {
      console.error('Error in bulk toggle:', err);
    }
  };

  const handleSelectItem = (mediaId) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(mediaId)) {
      newSelected.delete(mediaId);
    } else {
      newSelected.add(mediaId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === mediaItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(mediaItems.map(item => item.id)));
    }
  };

  const handleMediaUploaded = () => {
    setCurrentPage(1);
    loadMedia();
    loadStats();
  };

  return (
    <div className="media-library">
      <div className="media-library-header">
        <h1>📚 Media Library</h1>
        <p className="subtitle">Organize, hide, and manage your media collection</p>
      </div>

      {stats && <MediaStats stats={stats} />}

      <div className="media-library-content">
        {/* Left Sidebar - Upload */}
        <div className="media-library-sidebar">
          <MediaUpload onMediaUploaded={handleMediaUploaded} />
        </div>

        {/* Main Content */}
        <div className="media-library-main">
          {/* Tabs */}
          <div className="media-tabs">
            <button 
              className={`tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
            >
              All Media
            </button>
            <button 
              className={`tab ${activeTab === 'visible' ? 'active' : ''}`}
              onClick={() => { setActiveTab('visible'); setCurrentPage(1); }}
            >
              Visible
            </button>
            <button 
              className={`tab ${activeTab === 'hidden' ? 'active' : ''}`}
              onClick={() => { setActiveTab('hidden'); setCurrentPage(1); }}
            >
              Hidden
            </button>
            <button 
              className={`tab ${activeTab === 'scheduled' ? 'active' : ''}`}
              onClick={() => { setActiveTab('scheduled'); setCurrentPage(1); }}
            >
              Scheduled
            </button>
          </div>

          {/* Filters and Toolbar */}
          <div className="media-toolbar">
            <MediaFilters 
              filterType={filterType}
              onFilterTypeChange={(type) => { setFilterType(type); setCurrentPage(1); }}
              onClearFilters={() => { setFilterType(null); setVisibilityFilter(null); setCurrentPage(1); }}
            />

            {selectedItems.size > 0 && (
              <div className="bulk-actions">
                <span className="selection-count">{selectedItems.size} selected</span>
                <button 
                  className="btn-action btn-show"
                  onClick={() => handleBulkToggleVisibility(true)}
                  title="Show selected items in feed"
                >
                  👁️ Show ({selectedItems.size})
                </button>
                <button 
                  className="btn-action btn-hide"
                  onClick={() => handleBulkToggleVisibility(false)}
                  title="Hide selected items from feed"
                >
                  🙈 Hide ({selectedItems.size})
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
            <div className="loading">Loading media...</div>
          ) : mediaItems.length === 0 ? (
            <div className="empty-state">
              <p>📭 No media found</p>
              <p className="hint">Upload or save media to get started</p>
            </div>
          ) : (
            <>
              {/* Media Grid */}
              <MediaGrid 
                items={mediaItems}
                selectedItems={selectedItems}
                onSelectItem={handleSelectItem}
                onSelectAll={handleSelectAll}
                onToggleVisibility={handleToggleVisibility}
                onDelete={handleDeleteMedia}
                selectAllChecked={selectedItems.size === mediaItems.length && mediaItems.length > 0}
              />

              {/* Pagination */}
              <MediaPagination 
                currentPage={currentPage}
                pageSize={pageSize}
                totalCount={totalCount}
                onPageChange={setCurrentPage}
                onPageSizeChange={(size) => {
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
