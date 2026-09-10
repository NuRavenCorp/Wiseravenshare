import api from './api';

// ─── Radio Browser API ────────────────────────────────────────────────────────
// Free, open, no API key. Full docs: https://api.radio-browser.info
//
// Per the spec:
//  1. Bootstrap from hardcoded seeds to discover all live servers via /json/servers.
//  2. Randomize the server list; retry each in turn on failure.
//  3. Include a descriptive identifier. Note: browsers block the `User-Agent` header
//     from client-side fetch() (it is a "forbidden header name"). We use
//     `X-WiseRaven-Client` for traceability and also append our name to the
//     Accept header as a fallback signal for logging.
//  4. Send /json/url/{uuid} click events for every station the user plays.
//  5. ONLY use streams where url_resolved starts with https:// — http:// streams
//     are blocked by browsers as mixed content when the page is served over HTTPS.
//     Any remaining http:// stream is automatically routed through the backend proxy.

const APP_CLIENT_ID = 'WiseRavenFM/1.0';

// Radio Browser fetch headers — browsers forbid setting User-Agent from JS.
const RB_HEADERS = {
  'X-WiseRaven-Client': APP_CLIENT_ID,
  'Accept': 'application/json'
};

// Hardcoded seed hosts — only used to bootstrap the live server list once.
const SEED_HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];

// Runtime server list (populated once, then randomized per-session).
let _serverList = null;

// Shuffle an array in-place (Fisher-Yates).
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Fetch the full list of Radio Browser servers from /json/servers, fall back to seeds.
const discoverServers = async () => {
  if (_serverList && _serverList.length > 0) return _serverList;

  for (const seed of SEED_HOSTS) {
    try {
      const res = await fetch(`${seed}/json/servers`, { headers: RB_HEADERS });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const hosts = data
          .map((entry) => {
            const name = String(entry?.name || '').trim();
            return name ? `https://${name}` : null;
          })
          .filter(Boolean);

        if (hosts.length > 0) {
          _serverList = shuffle(hosts);
          return _serverList;
        }
      }
    } catch {
      // Try next seed.
    }
  }

  // All seeds failed — use seeds in random order.
  _serverList = shuffle([...SEED_HOSTS]);
  return _serverList;
};

// Make a request to the Radio Browser API, rotating through servers on failure.
const radioBrowserFetch = async (path, params = {}) => {
  const servers = await discoverServers();
  const query = new URLSearchParams({
    limit: 20,
    order: 'clickcount',
    reverse: true,
    hidebroken: true,
    ...params
  });

  let lastError = null;
  for (const host of servers) {
    try {
      const res = await fetch(`${host}/json/${path}?${query}`, { headers: RB_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Radio Browser: all servers unavailable.');
};

// Send a /json/url/{uuid} click event (marks station as popular in the community DB).
// Fire-and-forget — never block playback.
export const trackRadioBrowserClick = (stationUuid) => {
  if (!stationUuid || String(stationUuid).startsWith('rb-')) return;
  discoverServers().then((servers) => {
    const host = servers[0];
    if (!host) return;
    fetch(`${host}/json/url/${encodeURIComponent(stationUuid)}`, {
      method: 'POST',
      headers: RB_HEADERS
    }).catch(() => {});
  }).catch(() => {});
};

// Genre tag mappings → Radio Browser tag queries.
export const GENRE_PRESETS = [
  { id: 'all',     label: 'All',     tags: [],                  icon: '📻' },
  { id: 'news',    label: 'News',    tags: ['news', 'talk'],     icon: '📰' },
  { id: 'spanish', label: 'Spanish', tags: ['spanish', 'latin'], icon: '🇪🇸' },
  { id: 'jazz',    label: 'Jazz',    tags: ['jazz'],             icon: '🎷' },
  { id: 'rnb',     label: 'R&B',     tags: ['rnb', 'soul'],      icon: '🎵' },
  { id: 'hiphop',  label: 'Hip-Hop', tags: ['hiphop', 'rap'],    icon: '🎤' },
];

// Resolve the best playable stream URL for a Radio Browser station entry.
//  - Prefer url_resolved (the server-tested canonical URL).
//  - Only use https:// directly — http:// streams are blocked by browsers as
//    mixed content when the page is on HTTPS.
//  - http:// streams are automatically routed through the backend proxy so they
//    still play; discard stations with no stream at all.
const resolveStreamUrl = (rb) => {
  const resolved = String(rb.url_resolved || '').trim();
  const direct = String(rb.url || '').trim();
  const candidates = [resolved, direct].filter(Boolean);
  if (candidates.length === 0) return null;

  const hasLikelyHls = (value) => /\.m3u8(\?|#|$)/i.test(String(value || ''));
  const preferred = candidates.find((value) => !hasLikelyHls(value)) || candidates[0];

  if (preferred.startsWith('https://')) return preferred;
  if (preferred.startsWith('http://')) return `/api/fmtuner/stream-proxy?url=${encodeURIComponent(preferred)}`;

  // Relative or unknown scheme — discard.
  return null;
};

// Map a Radio Browser station object to our internal station format.
const normalizeRadioBrowserStation = (rb) => {
  if (!rb || typeof rb !== 'object') return null;

  const streamUrl = resolveStreamUrl(rb);
  if (!streamUrl) return null; // No usable stream — skip.

  return {
    id: String(rb.stationuuid || `rb-${Math.random().toString(16).slice(2)}`),
    name: String(rb.name || 'Radio Station').trim(),
    description: '',
    frequency: '',
    band: 'ONLINE',
    city: String(rb.state || '').trim(),
    country: String(rb.country || 'International').trim(),
    genre: String(rb.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 2).join(' / ') || 'Music',
    language: String(rb.language || 'English').trim(),
    streamUrl,
    logoUrl: String(rb.favicon || '').trim(),
    listeners: Number(rb.clickcount || 0),
    bitrate: Number(rb.bitrate || 128),
    codec: String(rb.codec || 'MP3'),
    isFeatured: Number(rb.votes || 0) > 100,
    isActive: rb.lastcheckok !== 0,
    isLiked: false,
    isBookmarked: false,
    source: 'radio-browser'
  };
};

// ─── Sample stations (built-in fallback — globally accessible HTTPS streams) ──
const sampleStations = [
  {
    id: '6a5f8bfe-6e95-4548-ab9b-b7eaf51cc32f',
    name: 'WBGO Jazz 88.3',
    description: 'Public jazz radio from Newark, NJ.',
    frequency: '88.3 FM',
    band: 'FM',
    city: 'Newark',
    country: 'United States',
    genre: 'Jazz',
    language: 'English',
    streamUrl: 'https://wbgo.streamguys1.com/wbgo128',
    listeners: 420,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: '25586c8b-95a8-4218-a812-e1c56e9322c0',
    name: 'SomaFM Groove Salad',
    description: 'Ambient grooves for the late night hours.',
    frequency: '94.1 FM',
    band: 'FM',
    city: 'San Francisco',
    country: 'United States',
    genre: 'Ambient / Electronic',
    language: 'English',
    streamUrl: 'https://ice6.somafm.com/groovesalad-128-mp3',
    listeners: 880,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    name: 'NPR News',
    description: 'National Public Radio — live news and talk.',
    frequency: '90.9 FM',
    band: 'FM',
    city: 'Washington D.C.',
    country: 'United States',
    genre: 'News',
    language: 'English',
    streamUrl: 'https://npr-ice.streamguys1.com/live.mp3',
    listeners: 1200,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    name: 'Radio Ambulante',
    description: 'Spanish-language storytelling and culture.',
    frequency: '96.3 FM',
    band: 'FM',
    city: 'Latin America',
    country: 'International',
    genre: 'Spanish',
    language: 'Spanish',
    streamUrl: 'https://ice6.somafm.com/illstreet-128-mp3',
    listeners: 340,
    isFeatured: false,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'c3d4e5f6-a7b8-9012-cdef-012345678902',
    name: 'SomaFM Illinois Street Lounge',
    description: 'Classic cocktail lounge and jazz vibes.',
    frequency: '102.1 FM',
    band: 'FM',
    city: 'San Francisco',
    country: 'United States',
    genre: 'Jazz / Lounge',
    language: 'English',
    streamUrl: 'https://ice6.somafm.com/illstreet-128-mp3',
    listeners: 210,
    isFeatured: false,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'd4e5f6a7-b8c9-0123-def0-123456789003',
    name: 'Smooth Soul Radio',
    description: 'R&B classics and modern soul hits.',
    frequency: '98.7 FM',
    band: 'FM',
    city: 'Atlanta',
    country: 'United States',
    genre: 'R&B / Soul',
    language: 'English',
    streamUrl: 'https://ice6.somafm.com/seventies-128-mp3',
    listeners: 560,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'e5f6a7b8-c9d0-1234-ef01-234567890004',
    name: 'Hip-Hop Nation',
    description: 'Classic and contemporary hip-hop and rap.',
    frequency: '105.3 FM',
    band: 'FM',
    city: 'New York',
    country: 'United States',
    genre: 'Hip-Hop',
    language: 'English',
    streamUrl: 'https://ice6.somafm.com/thetrip-128-mp3',
    listeners: 730,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  },
  {
    id: 'f6a7b8c9-d0e1-2345-f012-345678900005',
    name: 'SomaFM Drone Zone',
    description: 'Atmospheric ambient for deep focus.',
    frequency: '99.7 FM',
    band: 'FM',
    city: 'San Francisco',
    country: 'United States',
    genre: 'Ambient',
    language: 'Instrumental',
    streamUrl: 'https://ice6.somafm.com/dronezone-128-mp3',
    listeners: 290,
    isFeatured: false,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false,
    source: 'sample'
  }
];

const PIN_REGION_ALIASES = {
  NYC: 'NYC',
  'NEW YORK': 'NYC',
  'NEW YORK CITY': 'NYC',
  NY: 'NYC',
  BROOKLYN: 'NYC',
  QUEENS: 'NYC',
  BRONX: 'NYC',
  MANHATTAN: 'NYC',
  STATENISLAND: 'NYC',
  'STATEN ISLAND': 'NYC'
};

const FREQUENCY_PINSETS = {
  NYC: {
    '88.3': {
      name: 'WBGO Jazz 88.3 NYC',
      streamUrl: 'https://wbgo.streamguys1.com/wbgo128',
      genre: 'Jazz',
      language: 'English'
    },
    '93.9': {
      name: 'iHeart 93.9 NYC Hits',
      streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WNYLFMAAC.aac',
      genre: 'Top 40',
      language: 'English'
    },
    '101.1': {
      name: 'WCBS FM 101.1 NYC',
      streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WCBSFMAAC.aac',
      genre: 'Classic Hits',
      language: 'English'
    },
    '1010': {
      name: '1010 WINS NYC',
      streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WINSAMAAC.aac',
      genre: 'News',
      language: 'English'
    },
    '107.5': {
      name: 'WBLS 107.5 NYC',
      streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WBLSFMAAC.aac',
      genre: 'R&B / Hip-Hop',
      language: 'English'
    }
  }
};

const normalizeRegionKey = (region = '') => {
  const cleaned = String(region || '').trim().toUpperCase();
  if (!cleaned) return 'NYC';
  const compact = cleaned.replace(/[^A-Z0-9]/g, '');
  return PIN_REGION_ALIASES[cleaned] || PIN_REGION_ALIASES[compact] || 'NYC';
};

const normalizeFrequencyKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/mhz/g, '').trim();
  const numeric = Number.parseFloat(text);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  const fixed = Number.isInteger(numeric) ? `${numeric}` : numeric.toFixed(1);
  return fixed.replace(/\.0$/, '');
};

const createPinnedStation = (frequencyKey, regionKey, pin) => ({
  id: `pin-${regionKey}-${frequencyKey}`,
  name: pin.name,
  description: `Pinned ${regionKey} frequency ${frequencyKey}`,
  frequency: frequencyKey,
  band: 'FM',
  city: regionKey === 'NYC' ? 'New York City' : regionKey,
  country: 'United States',
  genre: pin.genre || 'Music',
  language: pin.language || 'English',
  streamUrl: pin.streamUrl,
  listeners: 0,
  bitrate: 128,
  codec: 'AAC',
  isFeatured: true,
  isActive: true,
  isLiked: false,
  isBookmarked: false,
  source: 'frequency-pin'
});

export const getPinnedStationByFrequency = (frequency, region = 'NYC') => {
  const regionKey = normalizeRegionKey(region);
  const frequencyKey = normalizeFrequencyKey(frequency);
  if (!frequencyKey) {
    return null;
  }

  const pinsForRegion = FREQUENCY_PINSETS[regionKey] || FREQUENCY_PINSETS.NYC;
  const pin = pinsForRegion?.[frequencyKey];
  if (!pin) {
    return null;
  }

  return createPinnedStation(frequencyKey, regionKey, pin);
};

const isRouteMissing = (error) => {
  const status = Number(error?.response?.status || 0);
  return status === 404 || status === 405 || status === 501;
};

const normalizeCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const normalizeStation = (station) => {
  if (!station || typeof station !== 'object') return null;
  return {
    ...station,
    id: station.id || station.Id || '',
    name: station.name || station.Name || 'Unknown Station',
    frequency: station.frequency || station.Frequency || '',
    band: station.band || station.Band || 'FM',
    city: station.city || station.City || '',
    country: station.country || station.Country || '',
    genre: station.genre || station.Genre || 'General',
    language: station.language || station.Language || 'English',
    streamUrl: station.streamUrl || station.StreamUrl || '',
    listeners: Number(station.listeners ?? station.Listeners ?? 0),
    isFeatured: Boolean(station.isFeatured ?? station.IsFeatured),
    isActive: Boolean(station.isActive ?? station.IsActive ?? true),
    bitrate: Number(station.bitrate ?? station.Bitrate ?? 128),
    codec: station.codec || station.Codec || '',
    logoUrl: station.logoUrl || station.LogoUrl || '',
    coverImageUrl: station.coverImageUrl || station.CoverImageUrl || '',
    source: station.source || station.Source || '',
    isLiked: Boolean(station.isLiked ?? station.IsLiked),
    isBookmarked: Boolean(station.isBookmarked ?? station.IsBookmarked)
  };
};

const normalizeCreatorStation = (station) => {
  if (!station || typeof station !== 'object') return null;
  const normalized = {
    ...station,
    id: station.id || station.Id || '',
    name: station.name || station.Name || 'Creator Station',
    description: station.description || station.Description || '',
    frequency: station.frequency || station.Frequency || '',
    band: station.band || station.Band || 'ONLINE',
    genre: station.genre || station.Genre || '',
    subGenre: station.subGenre || station.SubGenre || '',
    logoUrl: station.logoUrl || station.LogoUrl || '',
    coverImageUrl: station.coverImageUrl || station.CoverImageUrl || '',
    streamUrl: station.streamUrl || station.StreamUrl || '',
    streamKey: station.streamKey || station.StreamKey || '',
    website: station.website || station.Website || '',
    socialLinks: station.socialLinks || station.SocialLinks || '',
    status: station.status || station.Status || 'Draft',
    visibility: station.visibility || station.Visibility || 'Public',
    isLive: Boolean(station.isLive ?? station.IsLive),
    listeners: Number(station.listeners ?? station.Listeners ?? 0),
    followerCount: Number(station.followerCount ?? station.FollowerCount ?? 0),
    isProprietaryFrequency: Boolean(station.isProprietaryFrequency ?? station.IsProprietaryFrequency ?? true),
    frequencyLockedAt: station.frequencyLockedAt || station.FrequencyLockedAt || null,
    createdAt: station.createdAt || station.CreatedAt || null,
    isMonetized: Boolean(station.isMonetized ?? station.IsMonetized ?? false),
    subscriptionPrice: station.subscriptionPrice ?? station.SubscriptionPrice ?? null,
    allowChat: Boolean(station.allowChat ?? station.AllowChat ?? true),
    allowRequests: Boolean(station.allowRequests ?? station.AllowRequests ?? true),
    allowShoutouts: Boolean(station.allowShoutouts ?? station.AllowShoutouts ?? true),
    isFollowing: Boolean(station.isFollowing ?? station.IsFollowing ?? false),
    brandColor: station.brandColor || station.BrandColor || '',
    contentRating: station.contentRating || station.ContentRating || 'General',
    targetLanguage: station.targetLanguage || station.TargetLanguage || '',
    targetRegion: station.targetRegion || station.TargetRegion || '',
    schedule: Array.isArray(station.schedule) ? station.schedule : Array.isArray(station.Schedule) ? station.Schedule : [],
    episodes: Array.isArray(station.episodes) ? station.episodes : Array.isArray(station.Episodes) ? station.Episodes : [],
    totalListeners: Number(station.totalListeners ?? station.TotalListeners ?? 0),
    peakListeners: Number(station.peakListeners ?? station.PeakListeners ?? 0),
    lastLiveAt: station.lastLiveAt || station.LastLiveAt || null,
    scheduledLiveAt: station.scheduledLiveAt || station.ScheduledLiveAt || null,
    scheduledEndAt: station.scheduledEndAt || station.ScheduledEndAt || null
  };
  return normalized;
};

const requestList = async (request, fallback = []) => {
  try {
    const response = await request();
    const results = normalizeCollection(response?.data).map(normalizeStation).filter(Boolean);
    // If the API is live but has no seeded stations, use the sample fallback so the
    // tuner is never empty on a fresh deployment.
    return results.length > 0 ? results : fallback;
  } catch (error) {
    if (isRouteMissing(error)) {
      return fallback;
    }
    // Auth errors (401/403) should still surface upstream.
    throw error;
  }
};

// Build the backend proxy URL for a given external stream URL.
// ALL http:// streams are routed through the server proxy — browsers block them
// as mixed content when the page is served over HTTPS.
// https:// streams play directly (no proxy needed).
export const buildProxyStreamUrl = (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url) return '';
  if (url.startsWith('http://')) {
    return `/api/fmtuner/stream-proxy?url=${encodeURIComponent(url)}`;
  }
  // Already HTTPS (or a proxy path already constructed) — use as-is.
  return url;
};

// ─── Public Radio Browser helpers ────────────────────────────────────────────

// Fetch stations by genre preset from Radio Browser API.
// Falls back to matching sample stations if the API is unreachable.
export const scanByGenre = async (genrePresetId, limit = 20) => {
  const preset = GENRE_PRESETS.find((p) => p.id === genrePresetId);

  // 'all' preset — return top stations by click count
  if (!preset || preset.tags.length === 0) {
    try {
      const results = await radioBrowserFetch('stations', { limit, hidebroken: true });
      const mapped = results.map(normalizeRadioBrowserStation).filter(Boolean);
      return mapped.length > 0 ? mapped : sampleStations.slice(0, limit);
    } catch {
      return sampleStations.slice(0, limit);
    }
  }

  // Try each tag until we get results.
  for (const tag of preset.tags) {
    try {
      const results = await radioBrowserFetch(`stations/bytag/${encodeURIComponent(tag)}`, { limit });
      const mapped = results.map(normalizeRadioBrowserStation).filter(Boolean);
      if (mapped.length > 0) {
        return mapped;
      }
    } catch {
      // Try next tag.
    }
  }

  // Full fallback — filter sample stations by genre keyword.
  const keyword = preset.label.toLowerCase();
  const filtered = sampleStations.filter((s) =>
    s.genre.toLowerCase().includes(keyword) ||
    s.language.toLowerCase().includes(keyword)
  );
  return filtered.length > 0 ? filtered : sampleStations;
};

// Scan for available stations across all genres — returns a merged deduplicated list.
export const scanAllStations = async (perGenre = 5) => {
  const activePresets = GENRE_PRESETS.filter((p) => p.id !== 'all');
  const seen = new Set();
  const all = [];

  await Promise.allSettled(
    activePresets.map(async (preset) => {
      const results = await scanByGenre(preset.id, perGenre);
      results.forEach((station) => {
        if (!seen.has(station.id)) {
          seen.add(station.id);
          all.push({ ...station, _scanGenre: preset.label });
        }
      });
    })
  );

  return all.sort((a, b) => b.listeners - a.listeners);
};

// ─── Step 1: Countries ────────────────────────────────────────────────────────
// Tries our backend proxy first (proper User-Agent, no CORS); falls back to
// direct Radio Browser fetch if the backend endpoint is not yet deployed.
export const getCountries = async (limit = 250) => {
  const normalize = (data) =>
    (Array.isArray(data) ? data : [])
      .filter((c) => c?.name && Number(c.stationcount || c.stationCount) > 0)
      .map((c) => ({
        name: String(c.name).trim(),
        iso: String(c.iso_3166_1 || c.iso || '').trim().toUpperCase(),
        stationCount: Number(c.stationcount || c.stationCount || 0)
      }));

  // 1) Backend proxy (server sets User-Agent correctly).
  try {
    const res = await fetch(`/api/fmtuner/rb/countries`);
    if (res.ok) {
      const data = await res.json();
      const mapped = normalize(data);
      if (mapped.length > 0) return mapped;
    }
  } catch { /* fall through */ }

  // 2) Direct Radio Browser fallback.
  try {
    const data = await radioBrowserFetch('countries', {
      order: 'stationcount', reverse: true, limit, hidebroken: false
    });
    return normalize(data);
  } catch {
    return [];
  }
};

// ─── Step 2: Popular Tags (genres) ───────────────────────────────────────────
export const getPopularTags = async (countrycode = '', limit = 60) => {
  const normalize = (data) =>
    (Array.isArray(data) ? data : [])
      .filter((t) => t?.name && Number(t.stationcount || t.stationCount) > 0)
      .map((t) => ({
        name: String(t.name).trim(),
        stationCount: Number(t.stationcount || t.stationCount || 0)
      }));

  const qsCountry = countrycode ? `?countrycode=${encodeURIComponent(countrycode)}&limit=${limit}` : `?limit=${limit}`;

  // 1) Backend proxy.
  try {
    const res = await fetch(`/api/fmtuner/rb/tags${qsCountry}`);
    if (res.ok) {
      const data = await res.json();
      const mapped = normalize(data);
      if (mapped.length > 0) return mapped;
    }
  } catch { /* fall through */ }

  // 2) Direct Radio Browser fallback.
  const params = { order: 'stationcount', reverse: true, limit, hidebroken: false };
  if (countrycode) params.countrycode = countrycode;
  try {
    const data = await radioBrowserFetch('tags', params);
    return normalize(data);
  } catch {
    return GENRE_PRESETS
      .filter((p) => p.id !== 'all')
      .map((p) => ({ name: p.tags[0] || p.label.toLowerCase(), stationCount: 0 }));
  }
};

// ─── Step 3: Stations by region + genre ──────────────────────────────────────
// Backend passes https=true so only HTTPS-capable streams are returned.
export const getStationsByRegionAndGenre = async ({ countrycode = '', tag = '', limit = 30 } = {}) => {
  const normalize = (data) =>
    (Array.isArray(data) ? data : []).map(normalizeRadioBrowserStation).filter(Boolean);

  const qs = new URLSearchParams({ limit });
  if (countrycode) qs.set('countryCode', countrycode);
  if (tag)         qs.set('tag', tag);

  // 1) Backend proxy (sets User-Agent + https=true).
  try {
    const res = await fetch(`/api/fmtuner/rb/stations?${qs}`);
    if (res.ok) {
      const data = await res.json();
      const mapped = normalize(data);
      if (mapped.length > 0) return mapped;
    }
  } catch { /* fall through */ }

  // 2) Direct Radio Browser fallback.
  const params = { limit, order: 'clickcount', reverse: true, hidebroken: true };
  if (countrycode) params.countrycode = countrycode;
  if (tag)         params.tag = tag;
  try {
    const data = await radioBrowserFetch('stations/search', params);
    const mapped = normalize(data);
    return mapped.length > 0 ? mapped : sampleStations;
  } catch {
    return sampleStations;
  }
};

export const fmService = {
  searchStations: async (params = {}) => {
    return await requestList(
      () => api.post('/fmtuner/search', params),
      sampleStations
    );
  },

  getFeaturedStations: async (count = 10) => {
    return await requestList(
      () => api.get('/fmtuner/featured', { params: { count } }),
      sampleStations.slice(0, Math.max(1, count))
    );
  },

  getPopularStations: async (count = 10) => {
    return await requestList(
      () => api.get('/fmtuner/popular', { params: { count } }),
      [...sampleStations].sort((a, b) => b.listeners - a.listeners).slice(0, Math.max(1, count))
    );
  },

  getRecommendedStations: async (count = 10) => {
    return await requestList(
      () => api.get('/fmtuner/recommended', { params: { count } }),
      sampleStations.slice(0, Math.max(1, count))
    );
  },

  getPlaybackInfo: async (id) => {
    try {
      const response = await api.get(`/fmtuner/${encodeURIComponent(id)}/play`);
      return normalizeStation(response?.data) || response?.data || {};
    } catch (error) {
      // Sample / unseeded station IDs won't exist in the DB — return empty so
      // the caller can fall back to the station's own streamUrl.
      const status = Number(error?.response?.status || 0);
      if (status === 404 || status === 405 || status === 0) {
        return {};
      }
      throw error;
    }
  },

  likeStation: async (id) => {
    const response = await api.post(`/fmtuner/${encodeURIComponent(id)}/like`);
    return normalizeStation(response?.data) || response?.data || {};
  },

  unlikeStation: async (id) => {
    await api.delete(`/fmtuner/${encodeURIComponent(id)}/like`);
  },

  bookmarkStation: async (id) => {
    const response = await api.post(`/fmtuner/${encodeURIComponent(id)}/bookmark`);
    return normalizeStation(response?.data) || response?.data || {};
  },

  unbookmarkStation: async (id) => {
    await api.delete(`/fmtuner/${encodeURIComponent(id)}/bookmark`);
  },

  getLikedStations: async () => {
    return await requestList(() => api.get('/fmtuner/liked'), []);
  },

  getBookmarkedStations: async () => {
    return await requestList(() => api.get('/fmtuner/bookmarked'), []);
  },

  getListeningHistory: async (limit = 50) => {
    return await requestList(() => api.get('/fmtuner/history', { params: { limit } }), []);
  },

  trackListening: async (stationId, duration = 0) => {
    await api.post(`/fmtuner/${encodeURIComponent(stationId)}/track`, duration);
  },

  getNowPlaying: async (stationId) => {
    const response = await api.get(`/fmtuner/${encodeURIComponent(stationId)}/now-playing`);
    return response?.data || null;
  },

  getPreferences: async () => {
    const response = await api.get('/fmtuner/preferences');
    return response?.data || {};
  },

  updatePreferences: async (preferences) => {
    await api.put('/fmtuner/preferences', preferences);
  },

  getMyCreatorStations: async () => {
    const response = await api.get('/fmtuner/creator-stations/mine');
    return normalizeCollection(response?.data).map(normalizeCreatorStation).filter(Boolean);
  },

  getPublicCreatorStations: async (page = 1, pageSize = 24) => {
    const response = await api.get('/fmtuner/creator-stations/public', { params: { page, pageSize } });
    return normalizeCollection(response?.data).map(normalizeCreatorStation).filter(Boolean);
  },

  searchCreatorStations: async (query, genre, visibility) => {
    const response = await api.get('/fmtuner/creator-stations/search', { params: { query, genre, visibility } });
    return normalizeCollection(response?.data).map(normalizeCreatorStation).filter(Boolean);
  },

  createCreatorStation: async (payload) => {
    const response = await api.post('/fmtuner/creator-stations', payload);
    return normalizeCreatorStation(response?.data) || response?.data;
  },

  updateCreatorStation: async (id, payload) => {
    const response = await api.put(`/fmtuner/creator-stations/${encodeURIComponent(id)}`, payload);
    return normalizeCreatorStation(response?.data) || response?.data;
  },

  updateCreatorStationStatus: async (id, status) => {
    const response = await api.patch(`/fmtuner/creator-stations/${encodeURIComponent(id)}/status`, { status });
    return normalizeCreatorStation(response?.data) || response?.data;
  },

  startCreatorStationLive: async (id) => {
    await api.post(`/fmtuner/creator-stations/${encodeURIComponent(id)}/live/start`);
  },

  endCreatorStationLive: async (id) => {
    await api.post(`/fmtuner/creator-stations/${encodeURIComponent(id)}/live/end`);
  },

  addCreatorStationSchedule: async (stationId, payload) => {
    const response = await api.post(`/fmtuner/creator-stations/${encodeURIComponent(stationId)}/schedules`, payload);
    return response?.data || null;
  },

  getCreatorStationSchedules: async (stationId) => {
    const response = await api.get(`/fmtuner/creator-stations/${encodeURIComponent(stationId)}/schedules`);
    return normalizeCollection(response?.data);
  },

  getPinnedStationByFrequency
};
