import { useCallback, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';
import { KEYS } from '../utils/storageKeys';
import { uid } from '../utils/id';
import { playlistEvents } from '../utils/playlistEvents';

const EMPTY = { playlists: [], activeId: null };

export function usePlaylists() {
  const [state, setState] = usePersistedState(KEYS.PLAYLISTS, EMPTY);
  const [playback, setPlayback] = usePersistedState(KEYS.PLAYBACK, {
    positions: {},
    lastMediaId: null,
    lastPlaylistId: null,
    volume: 0.8,
    muted: false,
    repeat: 'off',
    shuffle: false,
  });

  const { playlists, activeId } = state;
  const activePlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === activeId) || null,
    [playlists, activeId]
  );

  const notifyChange = useCallback((id) => {
    playlistEvents.playlistChanged(id);
  }, []);

  const createPlaylist = useCallback((name) => {
    const id = uid('pl');
    const playlist = {
      id,
      name: name?.trim() || 'Untitled Playlist',
      items: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setState((current) => ({ playlists: [...current.playlists, playlist], activeId: id }));
    notifyChange(id);
    return id;
  }, [notifyChange, setState]);

  const renamePlaylist = useCallback((id, name) => {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => (
        playlist.id === id ? { ...playlist, name, updatedAt: Date.now() } : playlist
      )),
    }));
    notifyChange(id);
  }, [notifyChange, setState]);

  const deletePlaylist = useCallback((id) => {
    setState((current) => {
      const nextPlaylists = current.playlists.filter((playlist) => playlist.id !== id);
      const nextActiveId = current.activeId === id ? (nextPlaylists[0]?.id ?? null) : current.activeId;
      return { playlists: nextPlaylists, activeId: nextActiveId };
    });
    notifyChange(id);
  }, [notifyChange, setState]);

  const setActivePlaylist = useCallback((id) => {
    setState((current) => ({ ...current, activeId: id }));
  }, [setState]);

  const addToPlaylist = useCallback((playlistId, mediaId) => {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        if (playlist.items.includes(mediaId)) return playlist;
        return { ...playlist, items: [...playlist.items, mediaId], updatedAt: Date.now() };
      }),
    }));
    notifyChange(playlistId);
  }, [notifyChange, setState]);

  const addManyToPlaylist = useCallback((playlistId, mediaIds) => {
    const safeIds = Array.isArray(mediaIds) ? mediaIds : [];
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const seen = new Set(playlist.items);
        const additions = safeIds.filter((id) => !seen.has(id));
        if (additions.length === 0) return playlist;
        return { ...playlist, items: [...playlist.items, ...additions], updatedAt: Date.now() };
      }),
    }));
    notifyChange(playlistId);
  }, [notifyChange, setState]);

  const removeFromPlaylist = useCallback((playlistId, mediaId) => {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => (
        playlist.id === playlistId
          ? { ...playlist, items: playlist.items.filter((id) => id !== mediaId), updatedAt: Date.now() }
          : playlist
      )),
    }));
    notifyChange(playlistId);
  }, [notifyChange, setState]);

  const removeManyFromPlaylist = useCallback((playlistId, mediaIds) => {
    const mediaIdsSet = new Set(mediaIds);
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => (
        playlist.id === playlistId
          ? { ...playlist, items: playlist.items.filter((id) => !mediaIdsSet.has(id)), updatedAt: Date.now() }
          : playlist
      )),
    }));
    notifyChange(playlistId);
  }, [notifyChange, setState]);

  const reorderPlaylist = useCallback((playlistId, from, to) => {
    setState((current) => ({
      ...current,
      playlists: current.playlists.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const next = [...playlist.items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...playlist, items: next, updatedAt: Date.now() };
      }),
    }));
    notifyChange(playlistId);
  }, [notifyChange, setState]);

  const setResumePosition = useCallback((mediaId, seconds) => {
    setPlayback((current) => ({
      ...current,
      positions: { ...current.positions, [mediaId]: seconds },
    }));
  }, [setPlayback]);

  const clearResumePosition = useCallback((mediaId) => {
    setPlayback((current) => {
      const { [mediaId]: _removed, ...rest } = current.positions;
      return { ...current, positions: rest };
    });
  }, [setPlayback]);

  const setPlaybackPrefs = useCallback((patch) => {
    setPlayback((current) => ({ ...current, ...patch }));
  }, [setPlayback]);

  const setLastPlayed = useCallback((mediaId, playlistId) => {
    setPlayback((current) => ({
      ...current,
      lastMediaId: mediaId,
      lastPlaylistId: playlistId ?? current.lastPlaylistId,
    }));
  }, [setPlayback]);

  return useMemo(() => ({
    playlists,
    activePlaylist,
    playback,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setActivePlaylist,
    addToPlaylist,
    addManyToPlaylist,
    removeFromPlaylist,
    removeManyFromPlaylist,
    reorderPlaylist,
    setResumePosition,
    clearResumePosition,
    setPlaybackPrefs,
    setLastPlayed,
  }), [
    playlists,
    activePlaylist,
    playback,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setActivePlaylist,
    addToPlaylist,
    addManyToPlaylist,
    removeFromPlaylist,
    removeManyFromPlaylist,
    reorderPlaylist,
    setResumePosition,
    clearResumePosition,
    setPlaybackPrefs,
    setLastPlayed,
  ]);
}
