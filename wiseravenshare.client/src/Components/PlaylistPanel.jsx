import React from 'react';
import { FiHeart, FiMenu, FiTrash2 } from 'react-icons/fi';

export function PlaylistPanel({
  tracks,
  currentIndex,
  favorites,
  onSelect,
  onRemove,
  onToggleFavorite,
  onReorder,
  onClear,
}) {
  const handleDragStart = (event, index) => {
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event, toIndex) => {
    event.preventDefault();
    const fromIndex = parseInt(event.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  };

  return (
    <div className="playlist-panel">
      <div className="playlist-header">
        <h4>Playlist ({tracks.length})</h4>
        {tracks.length > 0 && (
          <button className="playlist-clear" onClick={onClear} title="Clear playlist" type="button">
            Clear
          </button>
        )}
      </div>

      {tracks.length === 0 ? (
        <p className="playlist-empty">No tracks yet. Add some to get started.</p>
      ) : (
        <ul className="playlist-list">
          {tracks.map((track, index) => (
            <li
              key={track.id}
              className={`playlist-item ${index === currentIndex ? 'is-active' : ''}`}
              draggable
              onDragStart={(event) => handleDragStart(event, index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, index)}
              onClick={() => onSelect(index)}
            >
              <FiMenu className="playlist-drag" aria-hidden />
              <div className="playlist-meta">
                <span className="playlist-title">{track.title || 'Untitled'}</span>
                <span className="playlist-artist">{track.artist || 'Unknown artist'}</span>
              </div>
              <button
                className={`playlist-fav ${favorites.includes(track.id) ? 'is-fav' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleFavorite(track.id);
                }}
                title={favorites.includes(track.id) ? 'Unfavorite' : 'Favorite'}
                aria-label="Toggle favorite"
                type="button"
              >
                <FiHeart />
              </button>
              <button
                className="playlist-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(track.id);
                }}
                title="Remove from playlist"
                aria-label="Remove track"
                type="button"
              >
                <FiTrash2 />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

