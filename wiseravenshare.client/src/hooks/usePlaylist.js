import { useCallback, useMemo } from 'react';
import { usePersistedState } from './usePersistedState';

const STORAGE_KEY = 'emp:playlist:v1';

export function usePlaylist(initialTracks = []) {
  const [state, setState] = usePersistedState(STORAGE_KEY, {
    tracks: initialTracks,
    currentIndex: 0,
    favorites: [],
    repeatMode: 'off',
    shuffle: false,
    history: [],
  });

  const {
    tracks = [],
    currentIndex = 0,
    favorites = [],
    repeatMode = 'off',
    shuffle = false,
    history = [],
  } = state;

  const currentTrack = tracks[currentIndex] ?? null;

  const addTrack = useCallback((track) => {
    if (!track?.id) return;
    setState((s) => {
      if (s.tracks.some((t) => t.id === track.id)) return s;
      return { ...s, tracks: [...s.tracks, track] };
    });
  }, [setState]);

  const addTracks = useCallback((newTracks) => {
    if (!Array.isArray(newTracks) || newTracks.length === 0) return;
    setState((s) => {
      const existing = new Set(s.tracks.map((t) => t.id));
      const filtered = newTracks.filter((t) => t?.id && !existing.has(t.id));
      if (filtered.length === 0) return s;
      return { ...s, tracks: [...s.tracks, ...filtered] };
    });
  }, [setState]);

  const removeTrack = useCallback((trackId) => {
    setState((s) => {
      const idx = s.tracks.findIndex((t) => t.id === trackId);
      if (idx === -1) return s;

      const nextTracks = s.tracks.filter((t) => t.id !== trackId);
      let nextIndex = s.currentIndex;
      if (idx < s.currentIndex) nextIndex -= 1;
      else if (idx === s.currentIndex) nextIndex = Math.min(nextIndex, nextTracks.length - 1);

      return {
        ...s,
        tracks: nextTracks,
        currentIndex: Math.max(0, nextIndex),
        favorites: s.favorites.filter((id) => id !== trackId),
      };
    });
  }, [setState]);

  const reorder = useCallback((from, to) => {
    setState((s) => {
      if (from < 0 || to < 0 || from >= s.tracks.length || to >= s.tracks.length || from === to) {
        return s;
      }

      const reordered = [...s.tracks];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);

      const currentId = s.tracks[s.currentIndex]?.id;
      const nextCurrentIndex = reordered.findIndex((t) => t.id === currentId);

      return {
        ...s,
        tracks: reordered,
        currentIndex: nextCurrentIndex === -1 ? 0 : nextCurrentIndex,
      };
    });
  }, [setState]);

  const setCurrentIndex = useCallback((index) => {
    setState((s) => {
      if (s.tracks.length === 0) return { ...s, currentIndex: 0 };
      const nextIndex = Math.max(0, Math.min(index, s.tracks.length - 1));
      return { ...s, currentIndex: nextIndex };
    });
  }, [setState]);

  const nextIndex = useCallback(() => {
    if (tracks.length === 0) return -1;
    if (repeatMode === 'one') return currentIndex;

    if (shuffle) {
      if (tracks.length === 1) return 0;
      let idx = currentIndex;
      while (idx === currentIndex) {
        idx = Math.floor(Math.random() * tracks.length);
      }
      return idx;
    }

    const idx = currentIndex + 1;
    if (idx >= tracks.length) {
      return repeatMode === 'all' ? 0 : -1;
    }
    return idx;
  }, [tracks.length, currentIndex, repeatMode, shuffle]);

  const prevIndex = useCallback(() => {
    if (tracks.length === 0) return -1;
    if (repeatMode === 'one') return currentIndex;

    const idx = currentIndex - 1;
    if (idx < 0) {
      return repeatMode === 'all' ? tracks.length - 1 : 0;
    }
    return idx;
  }, [tracks.length, currentIndex, repeatMode]);

  const goNext = useCallback(() => {
    const idx = nextIndex();
    if (idx === -1) return null;
    setCurrentIndex(idx);
    return tracks[idx] ?? null;
  }, [nextIndex, setCurrentIndex, tracks]);

  const goPrev = useCallback(() => {
    const idx = prevIndex();
    if (idx === -1) return null;
    setCurrentIndex(idx);
    return tracks[idx] ?? null;
  }, [prevIndex, setCurrentIndex, tracks]);

  const toggleFavorite = useCallback((trackId) => {
    setState((s) => ({
      ...s,
      favorites: s.favorites.includes(trackId)
        ? s.favorites.filter((id) => id !== trackId)
        : [...s.favorites, trackId],
    }));
  }, [setState]);

  const isFavorite = useCallback((trackId) => favorites.includes(trackId), [favorites]);

  const toggleShuffle = useCallback(() => {
    setState((s) => ({ ...s, shuffle: !s.shuffle }));
  }, [setState]);

  const cycleRepeat = useCallback(() => {
    setState((s) => {
      const order = ['off', 'all', 'one'];
      const idx = order.indexOf(s.repeatMode);
      const nextMode = order[(idx + 1) % order.length];
      return { ...s, repeatMode: nextMode };
    });
  }, [setState]);

  const recordPlay = useCallback((trackId) => {
    if (!trackId) return;
    setState((s) => ({
      ...s,
      history: [trackId, ...s.history.filter((id) => id !== trackId)].slice(0, 50),
    }));
  }, [setState]);

  const clearPlaylist = useCallback(() => {
    setState((s) => ({ ...s, tracks: [], currentIndex: 0, history: [] }));
  }, [setState]);

  return useMemo(() => ({
    tracks,
    currentIndex,
    currentTrack,
    favorites,
    repeatMode,
    shuffle,
    history,
    addTrack,
    addTracks,
    removeTrack,
    reorder,
    clearPlaylist,
    setCurrentIndex,
    goNext,
    goPrev,
    toggleFavorite,
    isFavorite,
    toggleShuffle,
    cycleRepeat,
    recordPlay,
  }), [
    tracks,
    currentIndex,
    currentTrack,
    favorites,
    repeatMode,
    shuffle,
    history,
    addTrack,
    addTracks,
    removeTrack,
    reorder,
    clearPlaylist,
    setCurrentIndex,
    goNext,
    goPrev,
    toggleFavorite,
    isFavorite,
    toggleShuffle,
    cycleRepeat,
    recordPlay,
  ]);
}

