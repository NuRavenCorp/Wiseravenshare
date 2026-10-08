import { useEffect, useRef } from 'react';
import { fetchRemotePlaylists, fetchResumePositions, pushRemotePlaylists, pushResumePosition } from '../Services/playlistsApi.js';
import { useDebouncedEffect } from './useDebouncedEffect.js';

const collectMediaIds = (playlists) => Array.from(
  new Set(
    (Array.isArray(playlists) ? playlists : [])
      .flatMap((playlist) => (Array.isArray(playlist?.items) ? playlist.items : []))
      .map((mediaId) => String(mediaId || '').trim())
      .filter(Boolean)
  )
);

export function usePlaylistSync(playlistsApi, { enabled = true, mergeStrategy = 'union' } = {}) {
  const hydrated = useRef(false);

  useEffect(() => {
    if (!enabled || hydrated.current) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchRemotePlaylists();
        if (cancelled) return;

        if (remote.length === 0) {
          hydrated.current = true;
          return;
        }

        if (mergeStrategy === 'union') {
          const localNames = new Set(playlistsApi.playlists.map((playlist) => playlist.name));
          const toAdd = remote.filter((playlist) => !localNames.has(playlist.name));
          toAdd.forEach((playlist) => {
            const id = playlistsApi.createPlaylist(playlist.name);
            playlistsApi.addManyToPlaylist(id, playlist.items || []);
          });
        } else if (playlistsApi.playlists.length === 0) {
          remote.forEach((playlist) => {
            const id = playlistsApi.createPlaylist(playlist.name);
            playlistsApi.addManyToPlaylist(id, playlist.items || []);
          });
        }

        const remotePositions = await fetchResumePositions(
          collectMediaIds([...playlistsApi.playlists, ...remote])
        );
        if (cancelled) return;

        Object.entries(remotePositions).forEach(([mediaId, seconds]) => {
          const localSeconds = Number(playlistsApi.playback.positions?.[mediaId] || 0);
          if (seconds > localSeconds) {
            playlistsApi.setResumePosition(mediaId, seconds);
          }
        });

        hydrated.current = true;
      } catch (error) {
        console.warn('[playlistSync] pull failed', error?.message);
        hydrated.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, mergeStrategy]);

  useDebouncedEffect(() => {
    if (!enabled || !hydrated.current) return;
    pushRemotePlaylists(playlistsApi.playlists);
  }, [enabled, playlistsApi.playlists], 900);

  useDebouncedEffect(() => {
    if (!enabled || !hydrated.current) return;
    Object.entries(playlistsApi.playback.positions || {}).forEach(([mediaId, seconds]) => {
      pushResumePosition(mediaId, seconds);
    });
  }, [enabled, playlistsApi.playback.positions], 1500);
}
