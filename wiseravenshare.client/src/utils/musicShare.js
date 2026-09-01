import { socialService, buildMediaSharePayload } from '../Services/socialService';

/**
 * Builds the canonical public URL for a music track
 */
export function buildMusicShareUrl(track, currentUser) {
  const explicit = String(
    track?.shareUrl
    || track?.permalinkUrl
    || track?.spotifyUrl
    || track?.appleMusicUrl
    || ''
  ).trim();

  if (explicit) {
    return explicit;
  }

  const origin = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : 'https://wiseravenshare.com';
  const id = encodeURIComponent(String(track?.id || '').trim());
  const handle = String(currentUser?.handle || currentUser?.username || '').replace(/^@/, '').trim();
  const suffix = handle ? `?author=${encodeURIComponent(handle)}` : '';

  return `${origin}/ravensight/music/${id}${suffix}`;
}

/**
 * Builds a formatted share message for a music track
 */
export function buildMusicShareMessage(track) {
  const parts = [];

  if (track?.artist) {
    parts.push(`🎵 ${track.artist}`);
  }
  if (track?.title) {
    parts.push(`— ${track.title}`);
  }
  if (track?.album) {
    parts.push(`(${track.album})`);
  }

  return parts.length > 0
    ? parts.join(' ')
    : 'Check out this music on WiseRavenShare!';
}

/**
 * Summarizes share results for user notification
 */
function summarizeResults(results = []) {
  if (!results || results.length === 0) {
    return 'Share completed.';
  }

  const successful = results.filter((r) => r.success);
  if (successful.length === results.length) {
    const platforms = successful.map((r) => r.platform).join(', ');
    return `Shared to ${platforms}`;
  }

  const failed = results.filter((r) => !r.success);
  const platforms = failed.map((r) => r.platform).join(', ');
  return `Failed to share with ${platforms}. Try again or check your connections.`;
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (error) {
    console.warn('Clipboard API failed:', error);
  }

  // Fallback
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch (error) {
    console.error('Copy fallback failed:', error);
    return false;
  }
}

/**
 * Native-first music share flow:
 * 1. Web Share API when available (mobile / supported browsers).
 * 2. Clipboard copy fallback with a visible confirmation.
 * 3. Optional authenticated cross-post to connected platforms via the backend.
 */
export async function shareMusic(options) {
  const {
    track,
    currentUser = null,
    crossPost = false,
    crossPostTargets = { facebook: true, tiktok: false, youtube: false },
    onNotification = () => {},
  } = options;

  if (!track) {
    onNotification('No music track to share.', 'warning');
    return { method: 'error', results: [] };
  }

  const shareUrl = buildMusicShareUrl(track, currentUser);
  const message = buildMusicShareMessage(track);

  // Native share sheet (Web Share API)
  if (navigator.share && !crossPost) {
    try {
      await navigator.share({
        title: track.title || 'Music',
        text: message,
        url: shareUrl,
      });
      onNotification('Shared via native share sheet.', 'success');
      return { method: 'native', results: [] };
      // Fall through to clipboard.
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.warn('Native share failed:', error);
      }
      // Fall through to clipboard.
    }
  }

  const copied = await copyToClipboard(`${message} ${shareUrl}`);
  if (!crossPost) {
    onNotification(
      copied ? 'Link copied to clipboard.' : 'Unable to access clipboard — copy the link manually.',
      copied ? 'success' : 'warning'
    );
    return { method: copied ? 'clipboard' : 'clipboard-failed', results: [] };
  }

  let publishResponse = null;
  try {
    publishResponse = await socialService.publishContent(
      buildMediaSharePayload({
        message: `${message} ${shareUrl}`,
        mediaUrl: track?.mediaUrl || track?.url || undefined,
        linkUrl: shareUrl,
        publishToFacebook: crossPostTargets.facebook,
        // Music rarely supported on TikTok/YouTube via audio shares; use Facebook primarily
        publishToTikTok: false,
        publishToYouTube: false,
      })
    );
  } catch (error) {
    console.error('Cross-post failed:', error);
    onNotification(`Cross-post error: ${error?.message || 'Unknown error'}`, 'error');
    return {
      method: 'cross-post-failed',
      results: [],
      error: error?.message,
    };
  }

  const results = publishResponse?.results || [];
  if (copied) {
    onNotification('Link copied to clipboard.', 'success');
  }
  onNotification(summarizeResults(results), results.some((r) => r.success) ? 'success' : 'error');

  return {
    method: 'cross-post',
    results,
    linkCopied: copied,
  };
}

/**
 * Share music to a specific platform deep-link (opens external)
 */
export const musicPlatformShare = {
  facebook: ({ message, url }) => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(message)}&u=${encodeURIComponent(url)}`,
      '_blank'
    );
  },
  twitter: ({ message, url }) => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`,
      '_blank'
    );
  },
  whatsapp: ({ message, url }) => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`,
      '_blank'
    );
  },
  email: ({ message, url, track }) => {
    const subject = encodeURIComponent(`Check out this music: ${track?.title || 'Audio'}`);
    const body = encodeURIComponent(`${message}\n\n${url}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  },
};
