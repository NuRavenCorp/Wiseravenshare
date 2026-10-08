import api from './api.js';

const PLAYLISTS_ENDPOINT = '/media-library/playlists';
const MEDIA_LIBRARY_ENDPOINT = '/media-library';

const normalizePlaylistName = (value) => String(value || '').trim().toLowerCase();

const mapRemotePlaylist = (playlist) => {
  const items = Array.isArray(playlist?.items) ? playlist.items : [];
  return {
    id: String(playlist?.id || ''),
    name: String(playlist?.name || 'Untitled Playlist').trim() || 'Untitled Playlist',
    items: items
      .map((item) => String(item?.id || item?.mediaId || '').trim())
      .filter(Boolean),
    updatedAt: playlist?.updatedAt || playlist?.createdAt || null,
  };
};

export async function fetchRemotePlaylists() {
  try {
    const response = await api.get(PLAYLISTS_ENDPOINT);
    const payload = response?.data;
    const playlists = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.playlists)
        ? payload.playlists
        : [];

    return playlists.map(mapRemotePlaylist);
  } catch (error) {
    if (error?.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

async function ensurePlaylist(localPlaylist, remoteByName) {
  const playlistName = String(localPlaylist?.name || '').trim();
  if (!playlistName) {
    return null;
  }

  const lookupKey = normalizePlaylistName(playlistName);
  let remotePlaylist = remoteByName.get(lookupKey) || null;
  if (remotePlaylist) {
    return remotePlaylist;
  }

  const response = await api.post(PLAYLISTS_ENDPOINT, {
    name: playlistName,
    visibility: 'Private',
  });
  remotePlaylist = mapRemotePlaylist(response?.data);
  remoteByName.set(lookupKey, remotePlaylist);
  return remotePlaylist;
}

async function reconcilePlaylistItems(remotePlaylist, desiredMediaIds) {
  const playlistId = remotePlaylist?.id;
  if (!playlistId) {
    return;
  }

  const desiredIds = Array.from(
    new Set((Array.isArray(desiredMediaIds) ? desiredMediaIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  );
  let currentIds = Array.isArray(remotePlaylist.items) ? [...remotePlaylist.items] : [];

  const toRemove = currentIds.filter((mediaId) => !desiredIds.includes(mediaId));
  for (const mediaId of toRemove) {
    await api.delete(`${PLAYLISTS_ENDPOINT}/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(mediaId)}`);
  }
  currentIds = currentIds.filter((mediaId) => !toRemove.includes(mediaId));

  const toAdd = desiredIds.filter((mediaId) => !currentIds.includes(mediaId));
  for (const mediaId of toAdd) {
    await api.post(`${PLAYLISTS_ENDPOINT}/${encodeURIComponent(playlistId)}/items`, { mediaId });
    currentIds.push(mediaId);
  }

  for (let index = 0; index < desiredIds.length; index += 1) {
    const mediaId = desiredIds[index];
    const currentIndex = currentIds.indexOf(mediaId);
    if (currentIndex === -1 || currentIndex === index) {
      continue;
    }

    await api.post(`${PLAYLISTS_ENDPOINT}/${encodeURIComponent(playlistId)}/reorder`, {
      mediaId,
      newIndex: index,
    });

    currentIds.splice(currentIndex, 1);
    currentIds.splice(index, 0, mediaId);
  }
}

export async function pushRemotePlaylists(playlists) {
  const localPlaylists = Array.isArray(playlists) ? playlists : [];

  try {
    const remotePlaylists = await fetchRemotePlaylists();
    const remoteByName = new Map(remotePlaylists.map((playlist) => [normalizePlaylistName(playlist.name), playlist]));
    const desiredNames = new Set(
      localPlaylists
        .map((playlist) => normalizePlaylistName(playlist?.name))
        .filter(Boolean)
    );

    for (const remotePlaylist of remotePlaylists) {
      if (!desiredNames.has(normalizePlaylistName(remotePlaylist.name))) {
        await api.delete(`${PLAYLISTS_ENDPOINT}/${encodeURIComponent(remotePlaylist.id)}`);
      }
    }

    for (const localPlaylist of localPlaylists) {
      const remotePlaylist = await ensurePlaylist(localPlaylist, remoteByName);
      if (!remotePlaylist) {
        continue;
      }

      await reconcilePlaylistItems(remotePlaylist, localPlaylist.items);
    }

    return true;
  } catch (error) {
    console.warn('[playlistsApi] push failed', error?.message);
    return false;
  }
}

export async function fetchResumePositions(mediaIds = []) {
  const ids = Array.from(
    new Set((Array.isArray(mediaIds) ? mediaIds : []).map((id) => String(id || '').trim()).filter(Boolean))
  );

  if (ids.length === 0) {
    return {};
  }

  try {
    const response = await api.get(`${MEDIA_LIBRARY_ENDPOINT}/resume`, {
      params: { mediaIds: ids.join(',') },
    });
    const positions = response?.data?.positions;
    if (!positions || typeof positions !== 'object') {
      return {};
    }

    return Object.fromEntries(
      Object.entries(positions)
        .map(([mediaId, seconds]) => [String(mediaId || '').trim(), Math.max(0, Math.round(Number(seconds) || 0))])
        .filter(([mediaId, seconds]) => mediaId && seconds > 0)
    );
  } catch (error) {
    if (error?.response?.status === 404) {
      return {};
    }
    throw error;
  }
}

export async function pushResumePosition(mediaId, seconds, extra = {}) {
  const normalizedMediaId = String(mediaId || '').trim();
  if (!normalizedMediaId) {
    return;
  }

  try {
    const payload = {
      mediaId: normalizedMediaId,
      position: Math.max(0, Math.round(Number(seconds) || 0)),
      isPlaying: Boolean(extra?.isPlaying),
    };

    await api.put(`${MEDIA_LIBRARY_ENDPOINT}/resume/${encodeURIComponent(normalizedMediaId)}`, payload);
  } catch {
    try {
      await api.post(`${MEDIA_LIBRARY_ENDPOINT}/${encodeURIComponent(normalizedMediaId)}/progress`, {
        mediaId: normalizedMediaId,
        position: Math.max(0, Math.round(Number(seconds) || 0)),
        isPlaying: Boolean(extra?.isPlaying),
      });
    } catch {
      // Best effort sync only.
    }
  }
}
