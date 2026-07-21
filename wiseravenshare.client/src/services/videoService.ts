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

  const response = await fetch(`${apiBase}/api/video/upload`, {
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

async function getCurrentUserId(): Promise<string> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('You must be logged in to view My Library.');
  }

  const response = await fetch(`${apiBase}/api/auth/profile`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const message = await parseError(response, `Failed to load user profile (${response.status})`);
    throw new Error(message);
  }

  const user = await response.json();
  if (!user?.id) {
    throw new Error('Profile response did not include user id.');
  }

  return String(user.id);
}

async function getMyLibraryVideos(page = 1, pageSize = 24): Promise<VideoItem[]> {
  const userId = await getCurrentUserId();

  const response = await fetch(
    `${apiBase}/api/video/user/${userId}?page=${page}&pageSize=${pageSize}`,
    { method: 'GET' }
  );

  if (!response.ok) {
    const message = await parseError(response, `Failed to load library videos (${response.status})`);
    throw new Error(message);
  }

  const videos: VideoItem[] = await response.json();
  return videos.map(mapVideoItem);
}

async function getVideoFeed(page = 1, pageSize = 24, filter?: string): Promise<VideoItem[]> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });

  if (filter && filter.trim().length > 0) {
    query.append('filter', filter.trim());
  }

  const response = await fetch(`${apiBase}/api/video/feed?${query.toString()}`, { method: 'GET' });

  if (!response.ok) {
    const message = await parseError(response, `Failed to load video feed (${response.status})`);
    throw new Error(message);
  }

  const videos: VideoItem[] = await response.json();
  return videos.map(mapVideoItem);
}

export const videoService = {
  uploadVideo,
  getMyLibraryVideos,
  getVideoFeed,
};
