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

const apiBase = import.meta.env.VITE_API_URL || '';

function normalizeBaseUrl(base: string): string {
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function resolveRavensightBaseUrl(): string {
  const normalized = normalizeBaseUrl(apiBase);

  if (normalized.length > 0) {
    return `${normalized}/api/ravensight/videos`;
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/api/ravensight/videos`;
  }

  return 'http://localhost:5242/api/ravensight/videos';
}

const ravensightBase = resolveRavensightBaseUrl();

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

  const base = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
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

function getAuthToken(): string | null {
  return localStorage.getItem('ws.accessToken') ||
    localStorage.getItem('auth_token') ||
    localStorage.getItem('wise-raven-token');
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

  const response = await fetch(`${ravensightBase}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });

  if (!response.ok) {
    const message = await parseError(response, `Video upload failed (${response.status})`);
    throw new Error(message);
  }

  return response.json();
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
  const videos: VideoItem[] = Array.isArray(payload?.videos) ? payload.videos : [];
  return videos.map(mapVideoItem);
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
  const response = await fetch(`${ravensightBase}/feed?${query.toString()}`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const message = await parseError(response, `Failed to load video feed (${response.status})`);
    throw new Error(message);
  }

  const payload = await response.json();
  const videos: VideoItem[] = Array.isArray(payload?.videos) ? payload.videos : [];
  return videos.map(mapVideoItem);
}

export const videoService = {
  uploadVideo,
  getMyLibraryVideos,
  getVideoFeed,
};
