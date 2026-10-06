const NS = 'wr';
const VERSION = 'v1';

export const KEYS = {
  UI: `${NS}:ml:ui:${VERSION}`,
  CACHE: `${NS}:ml:cache:${VERSION}`,
  PLAYLISTS: `${NS}:ml:playlists:${VERSION}`,
  PLAYBACK: `${NS}:ml:playback:${VERSION}`,
  MIGRATION: `${NS}:migration:${VERSION}`,
};

export const perItem = {
  resumePosition: (mediaId) => `${NS}:ml:resume:${VERSION}:${mediaId}`,
};

export const NAMESPACE_PREFIX = `${NS}:`;

