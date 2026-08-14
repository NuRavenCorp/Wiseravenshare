import { getAuthToken as getSharedAuthToken } from './authStorage.js';

type UploadVideoResponse = Record<string, unknown>;

export type VideoItem = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  videoUrl: string;
  thumbnailUrl?: string;
  privacy?: string;
  status?: string;
  viewsCount?: number;
  likesCount?: number;
  createdAt?: string;
};

const apiBase = String(import.meta.env.VITE_API_URL || '');

function normalizeBaseUrl(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function ensureApiSuffix(base: string): string {
  const normalized = normalizeBaseUrl(String(base || '').trim());
  if (!normalized) {
    return '';
  }
  return /\/api$/i.test(normalized) ? normalized : `${normalized}/api`;
}

function resolveRavensightBaseUrl(): string {
  const normalized = ensureApiSuffix(apiBase);

  if (normalized.length > 0) {
    return `${normalized}/ravensight/videos`;
  }

  if (typeof window !== 'undefined') {
    const protocol = String(window.location.protocol || '').toLowerCase();
    if (protocol === 'capacitor:' || protocol === 'file:') {
      return 'https://wise-ravens.com/api/ravensight/videos';
    }
    return `${window.location.origin}/api/ravensight/videos`;
  }

  return 'http://localhost:5242/api/ravensight/videos';
}

function resolveGeneralApiBaseUrl(): string {
  const normalized = ensureApiSuffix(apiBase);
  if (normalized.length > 0) {
    return normalized;
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }

  return 'http://localhost:5242/api';
}

const ravensightBase = resolveRavensightBaseUrl();

function ensureVideoRouteBase(path: string): string {
  const normalized = String(path || '').replace(/\/+$/, '');
  return normalized.endsWith('/videos') ? normalized : `${normalized}/videos`;
}

const ravensightVideoBase = ensureVideoRouteBase(ravensightBase);

function normalizeAssetUrl(url?: string): string {
  if (!url) {
    return '';
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (!apiBase) {
    return url;
  }

  const base = normalizeBaseUrl(apiBase);
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

function mapVideoItem(video: VideoItem): VideoItem {
  return {
    ...video,
    videoUrl: normalizeAssetUrl(video.videoUrl),
    thumbnailUrl: normalizeAssetUrl(video.thumbnailUrl),
  };
}

function normalizeVideoCollection(payload: any): VideoItem[] {
  if (Array.isArray(payload)) {
    return payload.map(mapVideoItem);
  }

  if (payload && Array.isArray(payload.videos)) {
    return payload.videos.map(mapVideoItem);
  }

  if (payload && Array.isArray(payload.items)) {
    return payload.items.map(mapVideoItem);
  }

  return [];
}

function normalizeUploadPayload(payload: any): UploadVideoResponse {
  const video = payload?.video || payload?.file || payload;
  const mapped = mapVideoItem({
    ...(video || {}),
    id: video?.id || payload?.mediaAssetId || payload?.fileName || '',
    videoUrl: video?.videoUrl || payload?.mediaUrl || payload?.filePath || video?.mediaUrl || '',
  } as VideoItem);

  return {
    ...(payload || {}),
    video: mapped,
    mediaUrl: payload?.mediaUrl || mapped.videoUrl,
    filePath: payload?.filePath || mapped.videoUrl,
  };
}

async function fetchWithFallback(urls: string[], init: RequestInit, fallback: string): Promise<Response> {
  let lastResponse: Response | null = null;

  for (const url of urls) {
    const response = await fetch(url, init);
    if (response.ok) {
      return response;
    }

    lastResponse = response;
    if (response.status !== 404 && response.status !== 405) {
      const message = await parseError(response, fallback);
      throw new Error(message);
    }
  }

  if (lastResponse) {
    const message = await parseError(lastResponse, fallback);
    throw new Error(message);
  }

  throw new Error(fallback);
}

function getAuthToken(): string | null {
  return getSharedAuthToken();
}

async function parseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.message === 'string' && data.message.length > 0) {
      return data.message;
    }
  } catch {
    // Keep fallback when response body is not JSON.
  }
  return fallback;
}

async function uploadVideo(formData: FormData): Promise<UploadVideoResponse> {
  const token = getAuthToken();

  const response = await fetchWithFallback(
    [
      `${ravensightVideoBase}/upload`,
      `${normalizeBaseUrl(resolveGeneralApiBaseUrl())}/ravensight/media/videos/save`,
      `${normalizeBaseUrl(resolveGeneralApiBaseUrl())}/video/upload`,
    ],
    {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    },
    'Video upload failed.'
  );

  const payload = await response.json();
  return normalizeUploadPayload(payload);
}

async function getMyLibraryVideos(page = 1, pageSize = 24): Promise<VideoItem[]> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('You must be logged in to view My Library.');
  }

  const response = await fetch(`${ravensightBase}/user?page=${page}&limit=${pageSize}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const message = await parseError(response, `Failed to load library videos (${response.status})`);
    throw new Error(message);
  }

  const payload = await response.json();
  return normalizeVideoCollection(payload);
}

async function getVideoFeed(page = 1, pageSize = 24, filter?: string): Promise<VideoItem[]> {
  const query = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });

  if (filter && filter.trim().length > 0) {
    query.append('filter', filter.trim());
  }

  const token = getAuthToken();
  const response = await fetch(`${ravensightVideoBase}/feed?${query.toString()}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const message = await parseError(response, `Failed to load video feed (${response.status})`);
    throw new Error(message);
  }

  const payload = await response.json();
  return normalizeVideoCollection(payload);
}

export const videoService = {
  uploadVideo,
  getMyLibraryVideos,
  getVideoFeed,
};
