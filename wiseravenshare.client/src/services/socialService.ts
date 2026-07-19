const apiBase = import.meta.env.VITE_API_URL || '';

export type SocialFeedItem = {
  platform: 'facebook' | 'tiktok' | string;
  externalId: string;
  text?: string;
  mediaUrl?: string;
  permalinkUrl?: string;
  authorHandle?: string;
  createdAt?: string;
};

export type PublishSocialContentRequest = {
  message: string;
  linkUrl?: string;
  videoUrl?: string;
  publishToFacebook: boolean;
  publishToTikTok: boolean;
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
