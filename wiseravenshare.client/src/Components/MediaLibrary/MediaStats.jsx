// wiseravenshare.client/src/Components/MediaLibrary/MediaStats.jsx
import React from 'react';
import './MediaStats.css';

/**
 * Display statistics about the user's media library
 */
const MediaStats = ({ stats }) => {
  if (!stats) return null;

  const getCount = (...keys) => {
    for (const key of keys) {
      const value = stats?.[key];
      if (Number.isFinite(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="media-stats">
      <div className="stat-card">
        <div className="stat-label">📊 Total Items</div>
        <div className="stat-value">{getCount('totalItems', 'total')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">👁️ Visible</div>
        <div className="stat-value">{getCount('visibleItemsCount', 'visible')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🙈 Hidden</div>
        <div className="stat-value">{getCount('hiddenItemsCount', 'hidden')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">📤 Published</div>
        <div className="stat-value">{getCount('publishedCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">⏱️ Scheduled</div>
        <div className="stat-value">{getCount('scheduledCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">💾 Total Size</div>
        <div className="stat-value">{formatBytes(getCount('totalSizeBytes'))}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🖼️ Photos</div>
        <div className="stat-value">{getCount('photoCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🎥 Videos</div>
        <div className="stat-value">{getCount('videoCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🎵 Music</div>
        <div className="stat-value">{getCount('musicCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🎧 Audio</div>
        <div className="stat-value">{getCount('audioCount')}</div>
      </div>

      <div className="stat-card">
        <div className="stat-label">🎙️ Podcasts</div>
        <div className="stat-value">{getCount('podcastCount')}</div>
      </div>
    </div>
  );
};

export default MediaStats;
