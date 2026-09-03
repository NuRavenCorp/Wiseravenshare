import React, { useState, useEffect, useRef } from 'react';
import { FiMusic, FiList, FiGrid, FiX, FiPlay, FiPlus, FiSearch } from 'react-icons/fi';
import AudioPlayer from '../Components/Ravensight/AudioPlayer';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import '../Styles/MusicPlayer.css';

/**
 * Music Player Page
 * Full-featured music player with playlist management
 * Supports all audio formats with equalizer and visualizer
 */
const MusicPlayerPage = ({ onNavigate }) => {
  const { user } = useAuth();
  const { addToast } = useNotification();

  // State management
  const [musicLibrary, setMusicLibrary] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // list or grid
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewPlaylistForm, setShowNewPlaylistForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(null);
  const searchInputRef = useRef(null);

  // Load music library from backend or localStorage
  useEffect(() => {
    loadMusicLibrary();
  }, []);

  const loadMusicLibrary = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('authToken');
      
      if (token) {
        const response = await fetch('/api/ravensight/media/music', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          const tracks = Array.isArray(data) ? data : [];
          setMusicLibrary(tracks);
          
          if (tracks.length > 0) {
            setCurrentTrack(tracks[0]);
            setCurrentTrackIndex(0);
          }
        }
      } else {
        // No auth token — load from localStorage or start with empty library
        const stored = localStorage.getItem('wiseMusic_library');
        const tracks = stored ? JSON.parse(stored) : [];
        setMusicLibrary(tracks);
        if (tracks.length > 0) {
          setCurrentTrack(tracks[0]);
        }
      }

      // Load playlists
      const storedPlaylists = localStorage.getItem('wiseMusic_playlists');
      if (storedPlaylists) {
        setPlaylists(JSON.parse(storedPlaylists));
      }
    } catch (error) {
      console.error('Failed to load music library:', error);
      addToast('Failed to load music library', 'error');
      setMusicLibrary([]);
      setCurrentTrack(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Get filtered and searched tracks
  const filteredTracks = activePlaylist 
    ? (playlists.find(p => p.id === activePlaylist)?.tracks || [])
    : musicLibrary;

  const searchedTracks = filteredTracks.filter(track =>
    track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    track.album.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handlers
  const handleTrackSelect = (track, index) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(index);
    addToast(`Now playing: ${track.title}`, 'info');
  };

  const handleNextTrack = () => {
    const tracks = activePlaylist 
      ? (playlists.find(p => p.id === activePlaylist)?.tracks || [])
      : musicLibrary;
    
    if (tracks.length === 0) return;
    
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    setCurrentTrackIndex(nextIndex);
    setCurrentTrack(tracks[nextIndex]);
  };

  const handlePreviousTrack = () => {
    const tracks = activePlaylist 
      ? (playlists.find(p => p.id === activePlaylist)?.tracks || [])
      : musicLibrary;
    
    if (tracks.length === 0) return;
    
    const prevIndex = currentTrackIndex === 0 ? tracks.length - 1 : currentTrackIndex - 1;
    setCurrentTrackIndex(prevIndex);
    setCurrentTrack(tracks[prevIndex]);
  };

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) {
      addToast('Playlist name cannot be empty', 'warning');
      return;
    }

    const newPlaylist = {
      id: `playlist_${Date.now()}`,
      name: newPlaylistName,
      tracks: [],
      createdAt: new Date().toISOString()
    };

    const updatedPlaylists = [...playlists, newPlaylist];
    setPlaylists(updatedPlaylists);
    localStorage.setItem('wiseMusic_playlists', JSON.stringify(updatedPlaylists));
    setNewPlaylistName('');
    setShowNewPlaylistForm(false);
    addToast('Playlist created!', 'success');
  };

  const handleAddToPlaylist = (trackId, playlistId) => {
    const updatedPlaylists = playlists.map(p => {
      if (p.id === playlistId) {
        const track = musicLibrary.find(t => t.id === trackId);
        if (track && !p.tracks.find(t => t.id === trackId)) {
          return { ...p, tracks: [...p.tracks, track] };
        }
      }
      return p;
    });

    setPlaylists(updatedPlaylists);
    localStorage.setItem('wiseMusic_playlists', JSON.stringify(updatedPlaylists));
    addToast('Track added to playlist!', 'success');
  };

  const handleDeletePlaylist = (playlistId) => {
    if (confirm('Delete this playlist?')) {
      const updatedPlaylists = playlists.filter(p => p.id !== playlistId);
      setPlaylists(updatedPlaylists);
      localStorage.setItem('wiseMusic_playlists', JSON.stringify(updatedPlaylists));
      
      if (activePlaylist === playlistId) {
        setActivePlaylist(null);
      }
      
      addToast('Playlist deleted', 'success');
    }
  };

  const handleRemoveFromPlaylist = (trackId, playlistId) => {
    const updatedPlaylists = playlists.map(p => {
      if (p.id === playlistId) {
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) };
      }
      return p;
    });

    setPlaylists(updatedPlaylists);
    localStorage.setItem('wiseMusic_playlists', JSON.stringify(updatedPlaylists));
    addToast('Track removed from playlist', 'success');
  };

  if (isLoading) {
    return (
      <div className="music-player-page">
        <div className="loading-container">
          <div className="spinner" />
          <p>Loading music library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="music-player-page">
      <div className="player-container">
        {/* Player Section */}
        <div className="player-section">
          <div className="player-header">
            <h1>
              <FiMusic /> Music Player
            </h1>
            <p className="subtitle">
              {currentTrack ? `Now Playing: ${currentTrack.title}` : 'Select a track to play'}
            </p>
          </div>

          {currentTrack && (
            <AudioPlayer
              track={currentTrack}
              showVisualizer={true}
              onEnded={handleNextTrack}
              onError={(error) => {
                console.error('Playback error:', error);
                addToast('Error playing audio file', 'error');
              }}
            />
          )}

          {!currentTrack && musicLibrary.length === 0 && (
            <div className="empty-state">
              <FiMusic size={48} />
              <p>No music in your library</p>
              <button onClick={() => onNavigate('music-rights-studio')}>
                Go to Music Rights Studio
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="player-sidebar">
          {/* Queue/Playlist Section */}
          <div className="sidebar-section">
            <div className="section-header">
              <h3>
                <FiList /> Queue / Playlists
              </h3>
            </div>

            {/* View Mode Toggle */}
            <div className="view-mode-toggle">
              <button
                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <FiList />
              </button>
              <button
                className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <FiGrid />
              </button>
            </div>

            {/* New Playlist Button */}
            <button
              className="new-playlist-btn"
              onClick={() => setShowNewPlaylistForm(!showNewPlaylistForm)}
            >
              <FiPlus /> New Playlist
            </button>

            {/* New Playlist Form */}
            {showNewPlaylistForm && (
              <div className="playlist-form">
                <input
                  type="text"
                  placeholder="Playlist name..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                  autoFocus
                />
                <button onClick={handleCreatePlaylist} className="submit-btn">
                  Create
                </button>
                <button
                  onClick={() => setShowNewPlaylistForm(false)}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Playlists */}
            <div className="playlists-list">
              <button
                className={`playlist-item ${!activePlaylist ? 'active' : ''}`}
                onClick={() => setActivePlaylist(null)}
              >
                <FiMusic /> All Music ({musicLibrary.length})
              </button>

              {playlists.map(playlist => (
                <div key={playlist.id} className="playlist-item-wrapper">
                  <button
                    className={`playlist-item ${activePlaylist === playlist.id ? 'active' : ''}`}
                    onClick={() => setActivePlaylist(playlist.id)}
                  >
                    <FiList /> {playlist.name} ({playlist.tracks.length})
                  </button>
                  <button
                    className="playlist-menu-btn"
                    onClick={() => setShowPlaylistMenu(
                      showPlaylistMenu === playlist.id ? null : playlist.id
                    )}
                  >
                    ⋮
                  </button>

                  {showPlaylistMenu === playlist.id && (
                    <div className="playlist-menu">
                      <button
                        onClick={() => {
                          handleDeletePlaylist(playlist.id);
                          setShowPlaylistMenu(null);
                        }}
                        className="menu-item delete"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tracks Section */}
      <div className="tracks-section">
        <div className="tracks-header">
          <h2>
            {activePlaylist
              ? playlists.find(p => p.id === activePlaylist)?.name || 'Playlist'
              : 'Music Library'
            }
          </h2>

          {/* Search */}
          <div className="search-box">
            <FiSearch />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search tracks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="clear-search"
              >
                <FiX />
              </button>
            )}
          </div>
        </div>

        {/* Tracks Display */}
        {searchedTracks.length === 0 ? (
          <div className="empty-tracks">
            <p>
              {activePlaylist
                ? 'This playlist is empty'
                : 'No tracks found'}
            </p>
          </div>
        ) : (
          <div className={`tracks-grid ${viewMode}`}>
            {searchedTracks.map((track, index) => (
              <div
                key={track.id}
                className={`track-card ${currentTrack?.id === track.id ? 'playing' : ''}`}
                onClick={() => handleTrackSelect(
                  track,
                  filteredTracks.findIndex(t => t.id === track.id)
                )}
              >
                {currentTrack?.id === track.id && (
                  <div className="now-playing-badge">
                    <FiPlay /> Playing
                  </div>
                )}

                <div className="track-album-art">
                  <div className="album-placeholder">
                    <FiMusic />
                  </div>
                </div>

                <div className="track-details">
                  <h4 className="track-title">{track.title}</h4>
                  <p className="track-artist">{track.artist}</p>
                  <p className="track-album">{track.album}</p>
                </div>

                <div className="track-actions">
                  <button
                    className="play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTrackSelect(track, index);
                    }}
                    title="Play"
                  >
                    <FiPlay />
                  </button>

                  {activePlaylist && (
                    <button
                      className="remove-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFromPlaylist(track.id, activePlaylist);
                      }}
                      title="Remove from playlist"
                    >
                      <FiX />
                    </button>
                  )}

                  {!activePlaylist && playlists.length > 0 && (
                    <div className="add-to-playlist-menu">
                      <button
                        className="add-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                        title="Add to playlist"
                      >
                        <FiPlus />
                      </button>
                      <div className="playlist-dropdown">
                        {playlists.map(p => (
                          <button
                            key={p.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToPlaylist(track.id, p.id);
                            }}
                            className="dropdown-item"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MusicPlayerPage;
