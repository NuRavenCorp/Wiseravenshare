import { socialService, buildMediaSharePayload } from '../Services/socialService';

/**
 * Builds the canonical public URL for a post/media item so shared links resolve
 * for crawlers and recipients outside the SPA session.
 */
export function buildShareUrl(item, currentUser) {
  const explicit = String(
    item?.shareUrl
    || item?.permalinkUrl
    || item?.youtubeUrl
    || item?.tiktokUrl
    || item?.facebookUrl
    || ''
  ).trim();

  if (explicit) {
    return explicit;
  }

  const origin = typeof window !== 'undefined' && window.location
    ? window.location.origin
    : 'https://wiseravenshare.com';
  const id = encodeURIComponent(String(item?.id || '').trim());
  const handle = String(currentUser?.handle || currentUser?.username || '').replace(/^@/, '').trim();
  const suffix = handle ? `?author=${encodeURIComponent(handle)}` : '';

  if (item?.type === 'video' || item?.mediaType === 'video') {
    return `${origin}/ravensight/video/${id}${suffix}`;
  }
  if (item?.mediaUrl || item?.videoUrl || item?.imageUrl) {
    return `${origin}/post/media/${id}${suffix}`;
  }
  return `${origin}/post/${id}${suffix}`;
}

export function buildShareMessage(item) {
  const author = String(item?.user?.name || item?.authorHandle || '').trim();
  const content = String(item?.content || item?.text || item?.title || '').trim();
  const trimmedContent = content.length > 120 ? `${content.slice(0, 117)}...` : content;
  return author ? `${author}: ${trimmedContent}` : (trimmedContent || 'Shared from Wiseravenshare');
}

function summarizeResults(results = []) {
  const successful = results.filter((entry) => entry?.success).map((entry) => entry.platform);
  const failed = results.filter((entry) => !entry?.success);
  return { successful, failed };
}

async function copyToClipboard(text) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to legacy execCommand path.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Native-first share flow:
 * 1. Web Share API when available (mobile / supported browsers).
 * 2. Clipboard copy fallback with a visible confirmation.
 * 3. Optional authenticated cross-post to connected platforms via the backend.
 */
export async function sharePost(options) {
  const {
    item,
    currentUser,
    onNotification = () => { },
    crossPost = false,
    crossPostTargets = { facebook: true, tikTok: true, youTube: true },
  } = options;

  const shareUrl = buildShareUrl(item, currentUser);
  const message = buildShareMessage(item);

  if (!crossPost && typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: 'Wiseravenshare', text: message, url: shareUrl });
      onNotification('Shared.', 'success');
      return { method: 'native', results: [] };
    } catch (error) {
      if (error?.name === 'AbortError') return { method: 'native-aborted', results: [] };
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
        mediaUrl: item?.videoUrl || item?.mediaUrl || undefined,
        linkUrl: shareUrl,
        publishToFacebook: crossPostTargets.facebook,
        publishToTikTok: crossPostTargets.tikTok,
        publishToYouTube: crossPostTargets.youTube,
      })
    );
  } catch (error) {
    onNotification(error?.message || 'Cross-post request failed.', 'error');
    return { method: 'crosspost-failed', results: [] };
  }

  const { successful, failed } = summarizeResults(publishResponse?.results);
  if (successful.length > 0) {
    onNotification(`Also published to ${successful.join(', ')}.`, 'success');
  }
  failed.forEach((entry) => {
    onNotification(`${entry.platform}: ${entry.error || 'Publish failed'}`, 'warning');
  });
  if (publishResponse?.results?.length === 0) {
    onNotification('No platform responded to the cross-post request.', 'warning');
  }

  return { method: 'crosspost', results: publishResponse?.results || [] };
}
