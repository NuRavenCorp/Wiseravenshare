/**
 * fmTrackBridge.js
 *
 * Storage/persistence bridge between the media library (MyLibraryPage)
 * and the FM Radio page (FMRadioPage).
 *
 * This bridge is dedicated to original music tracks: uploading
 * original tracks and working on them with the FM Radio graphic equalizer.
 *
 * Responsibilities (Single Responsibility Principle):
 *   1. HANDOFF — queue a library track so FMRadioPage picks it up, plays it
 *      in its cassette deck (via the `wr_track_player_handoff` key) and
 *      applies the requested graphic-equalizer enhancement preset.
 *   2. PERSISTENCE — mirror the proprietary music library into localStorage
 *      (`wr_music_library_cache`) so FMRadioPage can seed its queue without
 *      re-fetching from the API.
 *
 * The payload shapes produced here MUST stay compatible with the readers in
 * FMRadioPage.jsx (TRACK_PLAYER_HANDOFF_KEY effect + MUSIC_LIBRARY_CACHE_KEY effect).
 */

export const TRACK_PLAYER_HANDOFF_KEY = 'wr_track_player_handoff';
export const MUSIC_LIBRARY_CACHE_KEY = 'wr_music_library_cache';
const LEGACY_MUSIC_LIBRARY_CACHE_KEY = 'wiseMusic_library';

const safeGet = (key) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSet = (key, value) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage unavailable (private mode / quota) — persistence is best effort.
    }
};

const safeRemove = (key) => {
    try {
        localStorage.removeItem(key);
    } catch {
        // Best effort.
    }
};

/** Preset names accepted by FMRadioPage's graphic equalizer. */
export const ENHANCEMENT_PRESETS = ['flat', 'bassBoost', 'treble', 'vShape', 'vocal', 'rock', 'jazz', 'classical', 'karaoke'];

const normalizePresetName = (value) => {
    const name = String(value || '').trim();
    return ENHANCEMENT_PRESETS.includes(name) ? name : '';
};

/**
 * Map a normalized library item (see normalizeMusic in MyLibraryPage) to the
 * flat track shape FMRadioPage's normalizeLibraryTrack understands.
 */
export const toFmTrack = (item) => ({
    id: String(item?.id || ''),
    name: String(item?.fileName || item?.title || 'Untitled'),
    title: String(item?.title || item?.fileName || 'Untitled track'),
    artist: String(item?.artist || ''),
    album: String(item?.album || ''),
    genre: String(item?.genre || ''),
    fileName: String(item?.fileName || ''),
    relativePath: String(item?.relativePath || ''),
    mediaUrl: String(item?.mediaUrl || ''),
    url: String(item?.mediaUrl || ''),
    sizeBytes: Number(item?.sizeBytes || 0)
});

/**
 * Queue a track for playback in the FM Radio cassette deck.
 * `enhancementPreset` names an EQ preset (see EQ_PRESETS in FMRadioPage)
 * that FMRadioPage applies to its graphic equalizer when it consumes the
 * handoff — used by the media library so original/proprietary music can be
 * shaped right after playback starts.
 * Returns true when the handoff payload was written successfully.
 */
export const queueTrackForFmRadio = (item, { source = 'media-library', enhancementPreset = '' } = {}) => {
    if (!item) return false;

    const track = toFmTrack(item);
    if (!track.mediaUrl && !track.relativePath) return false;

    const payload = {
        source,
        enhancementPreset: normalizePresetName(enhancementPreset),
        requestedAtUtc: new Date().toISOString(),
        track
    };

    try {
        safeSet(TRACK_PLAYER_HANDOFF_KEY, JSON.stringify(payload));
        return true;
    } catch {
        return false;
    }
};

/** Read and clear a pending handoff. Returns the payload or null. */
export const consumeTrackHandoff = () => {
    const raw = safeGet(TRACK_PLAYER_HANDOFF_KEY);
    if (!raw) return null;

    safeRemove(TRACK_PLAYER_HANDOFF_KEY);

    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

/** Mirror the durable music library into the cache FMRadioPage seeds from. */
export const persistMusicLibrary = (items = []) => {
    if (!Array.isArray(items)) return;
    const payload = JSON.stringify(items.map(toFmTrack));
    safeSet(MUSIC_LIBRARY_CACHE_KEY, payload);
    // Backward compatibility for older readers during migration.
    safeSet(LEGACY_MUSIC_LIBRARY_CACHE_KEY, payload);
};

/** Read the cached music library previously persisted for FM radio. */
export const readCachedMusicLibrary = () => {
    try {
        const raw = safeGet(MUSIC_LIBRARY_CACHE_KEY) || safeGet(LEGACY_MUSIC_LIBRARY_CACHE_KEY) || 'null';
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
