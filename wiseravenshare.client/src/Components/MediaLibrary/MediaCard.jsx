// wiseravenshare.client/src/Components/MediaLibrary/MediaCard.jsx
import React, { useState } from 'react';
import './MediaCard.css';

/**
 * Individual media card component with preview and actions
 */
const MediaCard = ({
  media,
  isSelected,
  onSelect,
  onToggleVisibility,
  onDelete
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const getMediaTypeIcon = (type) => {
    const icons = {
      Photo: '🖼️',
      Video: '🎥',
      Music: '🎵',
      Audio: '🎧',
      Podcast: '🎙️',
      Document: '📄'
    };
    return icons[type] || '📁';
  };

  const getMediaPreview = () => {
    if (media.mediaType === 'Video' || media.mediaType === 'Music' || media.mediaType === 'Audio') {
      return (
        <div className="media-preview">
          <div className="media-icon">{getMediaTypeIcon(media.mediaType)}</div>
          {media.thumbnailUrl && (
            <img src={media.thumbnailUrl} alt={media.title} className="media-thumbnail" />
          )}
          {media.durationSeconds && (
            <div className="duration-badge">
              {formatDuration(media.durationSeconds)}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="media-preview">
        <img 
          src={media.mediaUrl || media.thumbnailUrl} 
          alt={media.title}
          className="media-image"
          onError={(e) => {
            e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext x="50%" y="50%" font-size="24" fill="%23999" text-anchor="middle" dominant-baseline="middle"%3ENo Preview%3C/text%3E%3C/svg%3E';
          }}
        />
      </div>
    );
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className={`media-card ${isSelected ? 'selected' : ''}`}>
      {/* Selection Checkbox */}
      <input 
        type="checkbox"
        className="media-checkbox"
        checked={isSelected}
        onChange={onSelect}
        aria-label={`Select ${media.title}`}
      />

      {/* Media Preview */}
      <div className="media-card-preview">
        {getMediaPreview()}
        
        {/* Visibility Badge */}
        <div className={`visibility-badge ${media.isVisibleInFeed ? 'visible' : 'hidden'}`}>
          {media.isVisibleInFeed ? '👁️ Visible' : '🙈 Hidden'}
        </div>

        {/* Published Badge */}
        {media.isPublished && (
          <div className="published-badge">✓ Published</div>
        )}
      </div>

      {/* Media Info */}
      <div className="media-card-info">
        <h3 className="media-title" title={media.title}>
          {media.title}
        </h3>
        
        {media.description && (
          <p className="media-description" title={media.description}>
            {media.description.substring(0, 60)}
            {media.description.length > 60 ? '...' : ''}
          </p>
        )}

        <div className="media-meta">
          <span className="media-type">{getMediaTypeIcon(media.mediaType)} {media.mediaType}</span>
          <span className="media-date">{formatDate(media.createdAt)}</span>
        </div>

        {media.fileSizeBytes && (
          <div className="media-size">
            Size: {formatFileSize(media.fileSizeBytes)}
          </div>
        )}

        {media.tags && media.tags.length > 0 && (
          <div className="media-tags">
            {media.tags.slice(0, 2).map((tag, idx) => (
              <span key={idx} className="tag">#{tag}</span>
            ))}
            {media.tags.length > 2 && (
              <span className="tag-more">+{media.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      {/* Action Menu */}
      <div className="media-card-actions">
        <button 
          className="btn-action-menu"
          onClick={() => setShowMenu(!showMenu)}
          title="More options"
        >
          ⋮
        </button>

        {showMenu && (
          <div className="action-menu">
            <button 
              className={`menu-item ${media.isVisibleInFeed ? 'hide' : 'show'}`}
              onClick={() => {
                onToggleVisibility();
                setShowMenu(false);
              }}
              title={media.isVisibleInFeed ? 'Hide from feed' : 'Show in feed'}
            >
              {media.isVisibleInFeed ? '🙈 Hide from Feed' : '👁️ Show in Feed'}
            </button>
            
            <a 
              href={media.mediaUrl}
              className="menu-item download"
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Download media"
            >
              ⬇️ Download
            </a>

            <button 
              className="menu-item publish"
              title="Publish as post"
            >
              📤 Publish
            </button>

            <button 
              className="menu-item delete"
              onClick={() => {
                if (window.confirm('Delete this media?')) {
                  onDelete();
                  setShowMenu(false);
                }
              }}
              title="Delete media"
            >
              🗑️ Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MediaCard;
