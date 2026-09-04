const PODCAST_HANDOFF_DRAFT_KEY = 'wisePodcastHandoffDraft';
const RAVENSIGHT_TARGET_TAB_KEY = 'wiseRavensightTargetTab';

const safeParse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

export const savePodcastHandoffDraft = (payload) => {
    const soundtrack = payload?.soundtrack && typeof payload.soundtrack === 'object'
        ? {
            id: String(payload.soundtrack.id || '').trim(),
            title: String(payload.soundtrack.title || '').trim(),
            artist: String(payload.soundtrack.artist || '').trim(),
            mediaUrl: String(payload.soundtrack.mediaUrl || '').trim(),
            album: String(payload.soundtrack.album || '').trim(),
            genre: String(payload.soundtrack.genre || '').trim()
        }
        : null;
    const data = {
        title: String(payload?.title || '').trim(),
        angle: String(payload?.angle || '').trim(),
        urgency: String(payload?.urgency || 'Standard').trim() || 'Standard',
        notes: String(payload?.notes || '').trim(),
        soundtrack: soundtrack && (soundtrack.id || soundtrack.title || soundtrack.mediaUrl) ? soundtrack : null,
        requestedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(PODCAST_HANDOFF_DRAFT_KEY, JSON.stringify(data));
    } catch {
        // Best effort only.
    }

    return data;
};

export const consumePodcastHandoffDraft = () => {
    try {
        const raw = localStorage.getItem(PODCAST_HANDOFF_DRAFT_KEY);
        if (!raw) {
            return null;
        }

        localStorage.removeItem(PODCAST_HANDOFF_DRAFT_KEY);
        return safeParse(raw);
    } catch {
        return null;
    }
};

export const queueRavensightTab = (tabId) => {
    const value = String(tabId || '').trim();
    if (!value) {
        return;
    }

    try {
        localStorage.setItem(RAVENSIGHT_TARGET_TAB_KEY, value);
    } catch {
        // Best effort only.
    }
};

export const consumeRavensightTab = () => {
    try {
        const value = String(localStorage.getItem(RAVENSIGHT_TARGET_TAB_KEY) || '').trim();
        if (!value) {
            return '';
        }

        localStorage.removeItem(RAVENSIGHT_TARGET_TAB_KEY);
        return value;
    } catch {
        return '';
    }
};
