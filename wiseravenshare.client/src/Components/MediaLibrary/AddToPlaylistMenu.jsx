import React, { useState } from 'react';
import { FiCheck, FiPlus } from 'react-icons/fi';

const AddToPlaylistMenu = ({ playlists, onAddToExisting, onCreateAndAdd }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [justAdded, setJustAdded] = useState(null);

  const handleAdd = (playlistId) => {
    onAddToExisting(playlistId);
    setJustAdded(playlistId);
    setTimeout(() => {
      setJustAdded(null);
      setOpen(false);
    }, 700);
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    onCreateAndAdd(newName.trim());
    setNewName('');
    setOpen(false);
  };

  return (
    <div className="add-to-playlist">
      <button
        className="btn-action btn-playlist"
        onClick={() => setOpen((value) => !value)}
        title="Add selection to playlist"
        type="button"
      >
        <FiPlus /> Add to playlist
      </button>

      {open && (
        <div className="add-to-playlist-popover" role="menu">
          {playlists.length === 0 && <p className="muted">No playlists yet.</p>}
          <ul>
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button onClick={() => handleAdd(playlist.id)} type="button">
                  {justAdded === playlist.id ? <FiCheck /> : null}
                  <span>{playlist.name}</span>
                  <span className="count">{playlist.items.length}</span>
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleCreate}>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="New playlist..."
            />
            <button type="submit">Create</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default AddToPlaylistMenu;

