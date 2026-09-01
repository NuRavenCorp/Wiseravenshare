import { getAuthToken as getSharedAuthToken } from './authStorage.js';

const normalizeApiBase = (value: string) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) {
    return '';
  }

  return /\/api$/i.test(raw) ? raw.replace(/\/api$/i, '') : raw;
};

const apiBase = normalizeApiBase(String(import.meta.env.VITE_API_URL || ''));

export type SocialFeedItem = {
  platform: 'facebook' | 'tiktok' | string;
  externalId: string;
  text?: string;
  mediaUrl?: string;
  permalinkUrl?: string;
  authorHandle?: string;
  createdAt?: string;
};

export type SocialMediaType = 'auto' | 'text' | 'photo' | 'video' | 'music';

export type PublishSocialContentRequest = {
  message: string;
  linkUrl?: string;
  videoUrl?: string;
  photoUrl?: string;
  musicUrl?: string;
  mediaType?: SocialMediaType;
  publishToFacebook: boolean;
  publishToTikTok: boolean;
  publishToYouTube?: boolean;
};

export type SocialPublishResult = {
  platform: string;
  success: boolean;
  externalPostId?: string;
  externalPostUrl?: string;
  error?: string;
};

export type PublishSocialContentResponse = {
  requestedAt: string;
  results: SocialPublishResult[];
};

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

async function getCombinedFeed(limit = 10, pageId?: string, username?: string): Promise<SocialFeedItem[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (pageId && pageId.trim().length > 0) {
    query.append('pageId', pageId.trim());
  }
  if (username && username.trim().length > 0) {
    query.append('username', username.trim());
  }

  const response = await fetch(`${apiBase}/api/social/feed?${query.toString()}`, { method: 'GET' });
  if (!response.ok) {
    throw new Error(await parseError(response, `Failed to load social feed (${response.status})`));
  }

  return response.json();
}

async function publishContent(payload: PublishSocialContentRequest): Promise<PublishSocialContentResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('You must be logged in to publish updates.');
  }

  const response = await fetch(`${apiBase}/api/social/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseError(response, `Failed to publish update (${response.status})`));
  }

  return response.json();
}

export const socialService = {
  getCombinedFeed,
  publishContent,
};

/**
 * Builds a share payload for a media item, inferring the media type from the URL
 * so photo and video shares hit the right platform endpoints server-side.
 */
export function buildMediaSharePayload(options: {
  message: string;
  mediaUrl?: string;
  linkUrl?: string;
  publishToFacebook?: boolean;
  publishToTikTok?: boolean;
  publishToYouTube?: boolean;
}): PublishSocialContentRequest {
  const mediaUrl = String(options.mediaUrl || '').trim();
  const isVideo = /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(mediaUrl)
    || mediaUrl.includes('videostreaming')
    || /^data:video\//i.test(mediaUrl);
  const isPhoto = !isVideo && (
    /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(mediaUrl)
    || /^data:image\//i.test(mediaUrl)
  );
  const isMusic = !isVideo && !isPhoto && (
    /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/i.test(mediaUrl)
    || /^data:audio\//i.test(mediaUrl)
  );

  return {
    message: options.message,
    linkUrl: options.linkUrl?.trim() || undefined,
    videoUrl: isVideo ? mediaUrl : undefined,
    photoUrl: isPhoto ? mediaUrl : undefined,
    musicUrl: isMusic ? mediaUrl : undefined,
    mediaType: isVideo ? 'video' : isPhoto ? 'photo' : isMusic ? 'music' : 'text',
    publishToFacebook: Boolean(options.publishToFacebook),
    // TikTok/YouTube only accept video; music shares go to Facebook as audio posts
    publishToTikTok: Boolean(options.publishToTikTok) && isVideo,
    publishToYouTube: Boolean(options.publishToYouTube) && isVideo,
  };
}
