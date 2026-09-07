import api from './api';

const sampleStations = [
  {
    id: '6a5f8bfe-6e95-4548-ab9b-b7eaf51cc32f',
    name: 'Wise Ravens FM',
    description: 'Community broadcast with creator news and music.',
    frequency: '88.5 FM',
    band: 'FM',
    city: 'New York',
    country: 'United States',
    genre: 'Talk',
    language: 'English',
    streamUrl: 'https://icecast.radiofrance.fr/fip-midfi.mp3',
    listeners: 120,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false
  },
  {
    id: '25586c8b-95a8-4218-a812-e1c56e9322c0',
    name: 'Global Beats',
    description: 'International hits and indie discoveries.',
    frequency: '94.1 FM',
    band: 'FM',
    city: 'London',
    country: 'United Kingdom',
    genre: 'Pop',
    language: 'English',
    streamUrl: 'https://icecast.radiofrance.fr/franceinter-midfi.mp3',
    listeners: 88,
    isFeatured: true,
    isActive: true,
    bitrate: 128,
    isLiked: false,
    isBookmarked: false
  }
];

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
    isLiked: Boolean(station.isLiked ?? station.IsLiked),
    isBookmarked: Boolean(station.isBookmarked ?? station.IsBookmarked)
  };
};

const normalizeCreatorStation = (station) => {
  if (!station || typeof station !== 'object') return null;
  return {
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
    website: station.website || station.Website || '',
    socialLinks: station.socialLinks || station.SocialLinks || '',
    status: station.status || station.Status || 'Draft',
    visibility: station.visibility || station.Visibility || 'Public',
    isLive: Boolean(station.isLive ?? station.IsLive),
    listeners: Number(station.listeners ?? station.Listeners ?? 0),
    followerCount: Number(station.followerCount ?? station.FollowerCount ?? 0),
    isProprietaryFrequency: Boolean(station.isProprietaryFrequency ?? station.IsProprietaryFrequency ?? true),
    frequencyLockedAt: station.frequencyLockedAt || station.FrequencyLockedAt || null,
    createdAt: station.createdAt || station.CreatedAt || null
  };
};

const requestList = async (request, fallback = []) => {
  try {
    const response = await request();
    return normalizeCollection(response?.data).map(normalizeStation).filter(Boolean);
  } catch (error) {
    if (isRouteMissing(error)) {
      return fallback;
    }
    throw error;
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
    const response = await api.get(`/fmtuner/${encodeURIComponent(id)}/play`);
    return normalizeStation(response?.data) || response?.data || {};
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
  }
};
