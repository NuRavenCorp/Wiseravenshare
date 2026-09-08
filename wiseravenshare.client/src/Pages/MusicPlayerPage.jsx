import React, { useState, useEffect, useRef } from 'react';
import { FiMusic, FiList, FiGrid, FiX, FiPlay, FiPlus, FiSearch, FiHeart } from 'react-icons/fi';
import AudioPlayer from '../Components/Ravensight/AudioPlayer';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';
import '../Styles/MusicPlayer.css';

const MUSIC_LIBRARY_CACHE_KEY = 'wiseMusic_library';
const MUSIC_PLAYER_STATE_CACHE_KEY = 'wiseMusic_playerState';
const LEGACY_PLAYLISTS_CACHE_KEY = 'wiseMusic_playlists';

const safeReadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const safeWriteJson = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
};

/**
 * Music Player Page
 * Full-featured music player with playlist management
 * Supports all audio formats with equalizer and visualizer
 */
const MusicPlayerPage = ({ onNavigate }) => {
  const { addToast } = useNotification();

  // State management
  const [musicLibrary, setMusicLibrary] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [favoriteTrackIds, setFavoriteTrackIds] = useState([]);
  const [recentHistory, setRecentHistory] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // list or grid
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewPlaylistForm, setShowNewPlaylistForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(null);
  const searchInputRef = useRef(null);
  const persistTimeoutRef = useRef(null);

  const normalizeTrack = (track) => {
    if (!track || typeof track !== 'object') return null;

    const normalizePlaybackUrl = (value = '') => {
      const raw = String(value || '').trim();
      if (!raw) return '';
      if (raw.startsWith('/') || raw.startsWith('api/')) {
        return raw.startsWith('/') ? raw : `/${raw}`;
      }
      if (/^https?:\/\//i.test(raw)) return raw;
      if (raw.startsWith('data:')) return raw;
      // Blob URLs are session-scoped; keep as last resort if present.
      if (raw.startsWith('blob:')) return raw;
      return '';
    };

    const toBlobStreamUrl = (relativePath = '') => {
      const normalized = String(relativePath || '')
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+/, '');
      if (!normalized) return '';
      const encoded = normalized
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      return encoded ? `/api/videostreaming/blob/${encoded}` : '';
    };

    const fileName = String(track.fileName || track.FileName || '').trim();
    const relativePath = String(
      track.relativePath
      || track.RelativePath
      || track.objectKey
      || track.ObjectKey
      || ''
    ).trim();

    const directUrl = normalizePlaybackUrl(
      track.mediaUrl
      || track.url
      || track.fileUrl
      || track.publicUrl
      || track.MediaUrl
      || track.Url
      || ''
    );

    const blobStreamUrl = toBlobStreamUrl(relativePath);
    const fileNameStreamUrl = fileName
      ? `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`
      : '';

    // Prefer stable API streams over potentially expired/local-only URLs.
    const mediaUrl = blobStreamUrl || fileNameStreamUrl || directUrl;

    return {
      id: String(track.id || track.Id || `track-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title: String(track.title || track.Title || 'Untitled').trim(),
      artist: String(track.artist || track.Artist || '').trim(),
      album: String(track.album || track.Album || '').trim(),
      genre: String(track.genre || track.Genre || '').trim(),
      fileName,
      relativePath,
      contentType: String(track.contentType || track.ContentType || '').trim(),
      mediaUrl,
      url: mediaUrl
    };
  };

  const normalizePlayerState = (payload) => {
    const source = payload && typeof payload === 'object' ? payload : {};
    const rawPlaylists = Array.isArray(source.playlists) ? source.playlists : [];

    const normalizedPlaylists = rawPlaylists
      .filter((playlist) => playlist && typeof playlist === 'object' && String(playlist.name || '').trim())
      .map((playlist) => {
        const id = String(playlist.id || `playlist_${Date.now()}_${Math.random().toString(16).slice(2)}`).trim();
        const name = String(playlist.name || '').trim();
        const createdAt = String(playlist.createdAt || new Date().toISOString()).trim();

        const trackIdsFromExplicitList = Array.isArray(playlist.trackIds)
          ? playlist.trackIds
          : Array.isArray(playlist.tracks)
            ? playlist.tracks.map((track) => track?.id)
            : [];

        const trackIds = [...new Set(trackIdsFromExplicitList
          .map((value) => String(value || '').trim())
          .filter(Boolean))];

        return { id, name, trackIds, createdAt };
      });

    const favoriteTrackIds = [...new Set((Array.isArray(source.favoriteTrackIds) ? source.favoriteTrackIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];

    const recentHistoryRows = (Array.isArray(source.recentHistory) ? source.recentHistory : [])
      .map((entry) => ({
        trackId: String(entry?.trackId || '').trim(),
        playedAt: String(entry?.playedAt || new Date().toISOString()).trim(),
        positionSeconds: Math.max(0, Number(entry?.positionSeconds || 0)),
        completed: Boolean(entry?.completed)
      }))
      .filter((entry) => Boolean(entry.trackId));

    return {
      activePlaylistId: String(source.activePlaylistId || '').trim() || null,
      lastTrackId: String(source.lastTrackId || '').trim() || null,
      lastPositionSeconds: Math.max(0, Number(source.lastPositionSeconds || 0)),
      queueTrackIds: [...new Set((Array.isArray(source.queueTrackIds) ? source.queueTrackIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))],
      favoriteTrackIds,
      recentHistory: recentHistoryRows,
      playlists: normalizedPlaylists
    };
  };

  const materializePlaylists = (playlistState, libraryTracks) => {
    const tracksById = new Map((libraryTracks || []).map((track) => [String(track.id), track]));

    return (playlistState || []).map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      createdAt: playlist.createdAt,
      tracks: (playlist.trackIds || [])
        .map((trackId) => tracksById.get(String(trackId)))
        .filter(Boolean)
    }));
  };

  const serializePlaylists = (playlistItems) => {
    return (playlistItems || [])
      .filter((playlist) => playlist && typeof playlist === 'object' && String(playlist.name || '').trim())
      .map((playlist) => ({
        id: String(playlist.id || '').trim() || `playlist_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: String(playlist.name || '').trim(),
        createdAt: String(playlist.createdAt || new Date().toISOString()).trim(),
        trackIds: [...new Set((Array.isArray(playlist.tracks) ? playlist.tracks : [])
          .map((track) => String(track?.id || '').trim())
          .filter(Boolean))]
      }));
  };

  const buildPersistableState = (overrides = {}) => {
    const payload = {
      activePlaylistId: activePlaylist,
      lastTrackId: currentTrack?.id || null,
      lastPositionSeconds: 0,
      queueTrackIds: musicLibrary.map((track) => track.id),
      favoriteTrackIds,
      playlists: serializePlaylists(playlists),
      recentHistory
    };

    const merged = { ...payload, ...(overrides || {}) };
    return {
      activePlaylistId: merged.activePlaylistId || null,
      lastTrackId: merged.lastTrackId || null,
      lastPositionSeconds: Math.max(0, Number(merged.lastPositionSeconds || 0)),
      queueTrackIds: [...new Set((Array.isArray(merged.queueTrackIds) ? merged.queueTrackIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))],
      favoriteTrackIds: [...new Set((Array.isArray(merged.favoriteTrackIds) ? merged.favoriteTrackIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean))],
      playlists: Array.isArray(merged.playlists) ? merged.playlists : [],
      recentHistory: (Array.isArray(merged.recentHistory) ? merged.recentHistory : [])
        .map((entry) => ({
          trackId: String(entry?.trackId || '').trim(),
          playedAt: String(entry?.playedAt || new Date().toISOString()).trim(),
          positionSeconds: Math.max(0, Number(entry?.positionSeconds || 0)),
          completed: Boolean(entry?.completed)
        }))
        .filter((entry) => Boolean(entry.trackId))
        .slice(0, 200)
    };
  };

  const schedulePlayerStatePersist = (overrides = {}) => {
    const payload = buildPersistableState(overrides);
    safeWriteJson(MUSIC_PLAYER_STATE_CACHE_KEY, payload);

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = setTimeout(async () => {
      try {
        await apiService.saveMusicPlayerState(payload);
      } catch {
        // Keep local cache as fallback; avoid noisy UI for background sync failures.
      }
    }, 250);
  };

  // Load music library and state with cache-first hydration for instant retrieval.
  useEffect(() => {
    loadMusicLibrary();

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, []);

  const loadMusicLibrary = async () => {
    const hydrateFromState = (tracks, statePayload) => {
      const state = normalizePlayerState(statePayload);
      const materialized = materializePlaylists(state.playlists, tracks);
      const activeFromState = materialized.some((playlist) => playlist.id === state.activePlaylistId)
        ? state.activePlaylistId
        : null;

      setPlaylists(materialized);
      setActivePlaylist(activeFromState);
      setFavoriteTrackIds(state.favoriteTrackIds);
      setRecentHistory(state.recentHistory);

      const fallbackTrack = tracks[0] || null;
      const selectedByState = state.lastTrackId
        ? tracks.find((track) => track.id === state.lastTrackId)
        : null;
      const selectedTrack = selectedByState || fallbackTrack;

      if (selectedTrack) {
        setCurrentTrack(selectedTrack);
        const index = tracks.findIndex((track) => track.id === selectedTrack.id);
        setCurrentTrackIndex(index >= 0 ? index : 0);
      } else {
        setCurrentTrack(null);
        setCurrentTrackIndex(0);
      }
    };

    try {
      setIsLoading(true);

      const cachedTracks = (safeReadJson(MUSIC_LIBRARY_CACHE_KEY, []) || [])
        .map(normalizeTrack)
        .filter(Boolean);

      if (cachedTracks.length > 0) {
        setMusicLibrary(cachedTracks);
      }

      const cachedState = safeReadJson(MUSIC_PLAYER_STATE_CACHE_KEY, null)
        || { playlists: safeReadJson(LEGACY_PLAYLISTS_CACHE_KEY, []) };

      if (cachedTracks.length > 0 || cachedState) {
        hydrateFromState(cachedTracks, cachedState);
      }

      const [libraryResult, stateResult] = await Promise.allSettled([
        apiService.getMusicLibrary(),
        apiService.getMusicPlayerState()
      ]);

      const tracks = libraryResult.status === 'fulfilled'
        ? (Array.isArray(libraryResult.value?.data) ? libraryResult.value.data : [])
          .map(normalizeTrack)
          .filter(Boolean)
        : cachedTracks;

      const rawState = stateResult.status === 'fulfilled'
        ? (stateResult.value?.data || cachedState)
        : cachedState;
      const normalizedRemoteState = normalizePlayerState(rawState);

      setMusicLibrary(tracks);
      safeWriteJson(MUSIC_LIBRARY_CACHE_KEY, tracks);

      hydrateFromState(tracks, normalizedRemoteState);
      safeWriteJson(MUSIC_PLAYER_STATE_CACHE_KEY, {
        activePlaylistId: normalizedRemoteState.activePlaylistId,
        lastTrackId: normalizedRemoteState.lastTrackId,
        lastPositionSeconds: normalizedRemoteState.lastPositionSeconds,
        queueTrackIds: normalizedRemoteState.queueTrackIds,
        favoriteTrackIds: normalizedRemoteState.favoriteTrackIds,
        playlists: normalizedRemoteState.playlists,
        recentHistory: normalizedRemoteState.recentHistory
      });

      const hydratedPlaylists = materializePlaylists(normalizedRemoteState.playlists, tracks);
      safeWriteJson(LEGACY_PLAYLISTS_CACHE_KEY, hydratedPlaylists);

      if (libraryResult.status === 'rejected' && stateResult.status === 'rejected') {
        addToast('Working from local music cache.', 'warning');
      }
    } catch (error) {
      try {
        const tracks = (safeReadJson(MUSIC_LIBRARY_CACHE_KEY, []) || [])
          .map(normalizeTrack)
          .filter(Boolean);
        setMusicLibrary(tracks);
        const fallbackState = safeReadJson(MUSIC_PLAYER_STATE_CACHE_KEY, null)
          || { playlists: safeReadJson(LEGACY_PLAYLISTS_CACHE_KEY, []) };
        hydrateFromState(tracks, fallbackState);
      } catch {
        setMusicLibrary([]);
      }
      console.error('Failed to load music library:', error);
      addToast('Failed to load music library', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const playbackTracks = activePlaylist
    ? (playlists.find((playlist) => playlist.id === activePlaylist)?.tracks || [])
    : musicLibrary;

  useEffect(() => {
    if (!playbackTracks.length) {
      setCurrentTrack(null);
      setCurrentTrackIndex(0);
      return;
    }

    if (!currentTrack) {
      setCurrentTrack(playbackTracks[0]);
      setCurrentTrackIndex(0);
      return;
    }

    const index = playbackTracks.findIndex((track) => track.id === currentTrack.id);
    if (index >= 0) {
      if (index !== currentTrackIndex) {
        setCurrentTrackIndex(index);
      }
      return;
    }

    setCurrentTrack(playbackTracks[0]);
    setCurrentTrackIndex(0);
  }, [activePlaylist, playlists, musicLibrary, currentTrack?.id]);

  // Opportunistically preload the next track metadata for snappy transitions.
  useEffect(() => {
    if (!playbackTracks.length || playbackTracks.length < 2) {
      return;
    }

    const nextIndex = (currentTrackIndex + 1) % playbackTracks.length;
    const nextTrack = playbackTracks[nextIndex];
    if (!nextTrack?.mediaUrl) {
      return;
    }

    const preloader = new Audio();
    preloader.preload = 'metadata';
    preloader.src = nextTrack.mediaUrl;
  }, [playbackTracks, currentTrackIndex]);

  // Get filtered and searched tracks
  const filteredTracks = playbackTracks;

  const searchedTracks = filteredTracks.filter(track =>
    String(track?.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(track?.artist || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    String(track?.album || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Handlers
  const handleTrackSelect = (track, index) => {
    setCurrentTrack(track);
    setCurrentTrackIndex(index);

    const updatedHistory = [
      {
        trackId: track.id,
        playedAt: new Date().toISOString(),
        positionSeconds: 0,
        completed: false
      },
      ...recentHistory.filter((entry) => entry.trackId !== track.id)
    ].slice(0, 200);

    setRecentHistory(updatedHistory);
    schedulePlayerStatePersist({
      lastTrackId: track.id,
      lastPositionSeconds: 0,
      recentHistory: updatedHistory
    });

    apiService.recordMusicPlay(track.id, { positionSeconds: 0, completed: false }).catch(() => {
      // Non-blocking telemetry write.
    });

    addToast(`Now playing: ${track.title}`, 'info');
  };

  const handleNextTrack = () => {
    const tracks = playbackTracks;
    
    if (tracks.length === 0) return;
    
    const nextIndex = (currentTrackIndex + 1) % tracks.length;
    setCurrentTrackIndex(nextIndex);
    setCurrentTrack(tracks[nextIndex]);
  };

  const handlePreviousTrack = () => {
    const tracks = playbackTracks;
    
    if (tracks.length === 0) return;
    
    const prevIndex = currentTrackIndex === 0 ? tracks.length - 1 : currentTrackIndex - 1;
    setCurrentTrackIndex(prevIndex);
    setCurrentTrack(tracks[prevIndex]);
  };

  const handleTrackEnded = () => {
    if (currentTrack?.id) {
      apiService.recordMusicPlay(currentTrack.id, { positionSeconds: 0, completed: true }).catch(() => {
        // Ignore telemetry failures.
      });
    }

    handleNextTrack();
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
    safeWriteJson(LEGACY_PLAYLISTS_CACHE_KEY, updatedPlaylists);
    schedulePlayerStatePersist({
      playlists: serializePlaylists(updatedPlaylists)
    });
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
    safeWriteJson(LEGACY_PLAYLISTS_CACHE_KEY, updatedPlaylists);
    schedulePlayerStatePersist({
      playlists: serializePlaylists(updatedPlaylists)
    });
    addToast('Track added to playlist!', 'success');
  };

  const handleDeletePlaylist = (playlistId) => {
    if (confirm('Delete this playlist?')) {
      const updatedPlaylists = playlists.filter(p => p.id !== playlistId);
      setPlaylists(updatedPlaylists);
      safeWriteJson(LEGACY_PLAYLISTS_CACHE_KEY, updatedPlaylists);
      
      if (activePlaylist === playlistId) {
        setActivePlaylist(null);
      }

      schedulePlayerStatePersist({
        playlists: serializePlaylists(updatedPlaylists),
        activePlaylistId: activePlaylist === playlistId ? null : activePlaylist
      });
      
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
    safeWriteJson(LEGACY_PLAYLISTS_CACHE_KEY, updatedPlaylists);
    schedulePlayerStatePersist({
      playlists: serializePlaylists(updatedPlaylists)
    });
    addToast('Track removed from playlist', 'success');
  };

  const handleToggleFavorite = async (trackId) => {
    if (!trackId) return;

    const isFavorite = favoriteTrackIds.includes(trackId);
    const nextFavoriteIds = isFavorite
      ? favoriteTrackIds.filter((id) => id !== trackId)
      : [trackId, ...favoriteTrackIds];

    setFavoriteTrackIds(nextFavoriteIds);
    schedulePlayerStatePersist({ favoriteTrackIds: nextFavoriteIds });

    try {
      if (isFavorite) {
        await apiService.removeMusicFavorite(trackId);
      } else {
        await apiService.addMusicFavorite(trackId);
      }
    } catch {
      addToast('Could not sync favorites right now. Local state kept.', 'warning');
    }
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
              onEnded={handleTrackEnded}
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
                onClick={() => {
                  setActivePlaylist(null);
                  schedulePlayerStatePersist({ activePlaylistId: null });
                }}
              >
                <FiMusic /> All Music ({musicLibrary.length})
              </button>

              {playlists.map(playlist => (
                <div key={playlist.id} className="playlist-item-wrapper">
                  <button
                    className={`playlist-item ${activePlaylist === playlist.id ? 'active' : ''}`}
                    onClick={() => {
                      setActivePlaylist(playlist.id);
                      schedulePlayerStatePersist({ activePlaylistId: playlist.id });
                    }}
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
                      handleTrackSelect(
                        track,
                        filteredTracks.findIndex((item) => item.id === track.id)
                      );
                    }}
                    title="Play"
                  >
                    <FiPlay />
                  </button>

                  <button
                    className="play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(track.id);
                    }}
                    title={favoriteTrackIds.includes(track.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <FiHeart color={favoriteTrackIds.includes(track.id) ? '#ef4444' : undefined} />
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
