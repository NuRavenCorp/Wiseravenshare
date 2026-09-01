const COLLABORATION_HANDOFF_KEY = 'wiseCollaborationHandoff';

const safeParse = (value) => {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

export const queueCollaborationHandoff = (payload) => {
    const mode = String(payload?.mode || '').trim().toLowerCase();
    if (mode !== 'create' && mode !== 'join') {
        return null;
    }

    const data = {
        mode,
        roomName: String(payload?.roomName || '').trim(),
        roomIdOrLink: String(payload?.roomIdOrLink || '').trim(),
        requestedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(COLLABORATION_HANDOFF_KEY, JSON.stringify(data));
    } catch {
        // Best effort only.
    }

    return data;
};

export const consumeCollaborationHandoff = () => {
    try {
        const raw = localStorage.getItem(COLLABORATION_HANDOFF_KEY);
        if (!raw) {
            return null;
        }

        localStorage.removeItem(COLLABORATION_HANDOFF_KEY);
        return safeParse(raw);
    } catch {
        return null;
    }
};
