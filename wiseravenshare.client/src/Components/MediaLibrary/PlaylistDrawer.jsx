import React, { useState } from 'react';
import { FiChevronRight, FiMusic, FiPlus, FiTrash2 } from 'react-icons/fi';

const PlaylistDrawer = ({
  playlists,
  activePlaylist,
  onSelectPlaylist,
  onCreatePlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onRemoveItem,
  onReorderItem,
  onPlayPlaylist,
  mediaLookup,
}) => {
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    onCreatePlaylist(newName.trim());
    setNewName('');
  };

  const startRename = (playlist) => {
    setRenamingId(playlist.id);
    setRenameValue(playlist.name);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenamePlaylist(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDragStart = (event, index) => {
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (event, toIndex) => {
    event.preventDefault();
    const fromIndex = parseInt(event.dataTransfer.getData('text/plain'), 10);
    if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
      onReorderItem(fromIndex, toIndex);
    }
  };

  return (
    <aside className="playlist-drawer">
      <header className="playlist-drawer-header">
        <h3>🎵 Playlists</h3>
      </header>

      <form className="playlist-create" onSubmit={handleCreate}>
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New playlist name"
          aria-label="New playlist name"
        />
        <button type="submit" aria-label="Create playlist" title="Create playlist">
          <FiPlus />
        </button>
      </form>

      <ul className="playlist-list">
        {playlists.length === 0 && <li className="playlist-empty">No playlists yet — create one above.</li>}
        {playlists.map((playlist) => {
          const isActive = activePlaylist?.id === playlist.id;
          return (
            <li key={playlist.id} className={`playlist-row ${isActive ? 'is-active' : ''}`}>
              {renamingId === playlist.id ? (
                <input
                  className="playlist-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRename();
                    if (event.key === 'Escape') setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  className="playlist-name"
                  onClick={() => onSelectPlaylist(playlist.id)}
                  onDoubleClick={() => startRename(playlist)}
                  title="Click to select · double-click to rename"
                  type="button"
                >
                  <FiChevronRight className="chev" />
                  <span className="name">{playlist.name}</span>
                  <span className="count">{playlist.items.length}</span>
                </button>
              )}
              <div className="playlist-row-actions">
                <button onClick={() => onPlayPlaylist(playlist.id)} title="Play playlist" aria-label="Play playlist" type="button">
                  ▶
                </button>
                <button onClick={() => onDeletePlaylist(playlist.id)} title="Delete playlist" aria-label="Delete playlist" type="button">
                  <FiTrash2 />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {activePlaylist && (
        <section className="playlist-items">
          <h4>
            <FiMusic /> {activePlaylist.name}
          </h4>
          {activePlaylist.items.length === 0 ? (
            <p className="playlist-empty">Empty — add media from the grid.</p>
          ) : (
            <ul>
              {activePlaylist.items.map((mediaId, index) => {
                const item = mediaLookup[mediaId];
                return (
                  <li
                    key={mediaId}
                    className="playlist-item"
                    draggable
                    onDragStart={(event) => handleDragStart(event, index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, index)}
                  >
                    <span className="grab">≡</span>
                    <span className="title">{item?.title || item?.name || mediaId}</span>
                    <button
                      className="remove"
                      onClick={() => onRemoveItem(activePlaylist.id, mediaId)}
                      aria-label="Remove from playlist"
                      type="button"
                    >
                      <FiTrash2 />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </aside>
  );
};

export default PlaylistDrawer;

