const TARGET = typeof window !== 'undefined' ? window : new EventTarget();

export const EVENTS = {
  PLAY_PLAYLIST: 'wr:media:play-playlist',
  PLAY_TRACK: 'wr:media:play-track',
  PLAYLIST_CHANGED: 'wr:media:playlist-changed',
  TRACK_ENDED: 'wr:media:track-ended',
  RESUME_SEEK: 'wr:media:resume-seek',
  VOLUME_CHANGED: 'wr:media:volume-changed',
};

export function emit(type, detail) {
  TARGET.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on(type, handler) {
  const wrapped = (event) => handler(event.detail);
  TARGET.addEventListener(type, wrapped);
  return () => TARGET.removeEventListener(type, wrapped);
}

export const playlistEvents = {
  playPlaylist: (playlistId) => emit(EVENTS.PLAY_PLAYLIST, { playlistId }),
  playTrack: (mediaId, playlistId) => emit(EVENTS.PLAY_TRACK, { mediaId, playlistId }),
  playlistChanged: (playlistId) => emit(EVENTS.PLAYLIST_CHANGED, { playlistId }),
  trackEnded: (mediaId) => emit(EVENTS.TRACK_ENDED, { mediaId }),
  resumeSeek: (mediaId, seconds) => emit(EVENTS.RESUME_SEEK, { mediaId, seconds }),
};

