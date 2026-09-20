export const resolveMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }

    const tryResolveSpacesBlobProxy = (absoluteUrl) => {
        try {
            const parsed = new URL(absoluteUrl);
            const host = String(parsed.hostname || '').toLowerCase();
            if (!host.includes('digitaloceanspaces.com')) {
                return '';
            }

            const pathSegments = String(parsed.pathname || '')
                .split('/')
                .filter(Boolean)
                .map((segment) => decodeURIComponent(segment));
            if (pathSegments.length === 0) {
                return '';
            }

            // Virtual-host style: <bucket>.<region>.digitaloceanspaces.com/<object-key>
            // Path style: <region>.digitaloceanspaces.com/<bucket>/<object-key>
            const hostParts = host.split('.');
            const isVirtualHosted = hostParts.length >= 4;
            const objectSegments = isVirtualHosted ? pathSegments : pathSegments.slice(1);
            if (objectSegments.length === 0) {
                return '';
            }

            const encodedObjectKey = objectSegments
                .map((segment) => encodeURIComponent(String(segment || '').trim()))
                .filter(Boolean)
                .join('/');

            return encodedObjectKey ? `/api/videostreaming/blob/${encodedObjectKey}` : '';
        } catch {
            return '';
        }
    };

    // Older records may contain internal localhost stream URLs that are unreachable
    // from public deployments. Rewrite them to same-origin relative paths.
    if (/^https?:\/\//i.test(trimmed)) {
        const blobProxyUrl = tryResolveSpacesBlobProxy(trimmed);
        if (blobProxyUrl) {
            return blobProxyUrl;
        }

        try {
            const parsed = new URL(trimmed);
            const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname);
            if (isLocalHost && typeof window !== 'undefined') {
                const currentHost = window.location.hostname || '';
                const currentIsLocal = /^(localhost|127\.0\.0\.1)$/i.test(currentHost);
                if (!currentIsLocal) {
                    return `${parsed.pathname}${parsed.search}`;
                }
            }
        } catch {
            // If URL parsing fails, return the original value.
        }

        return trimmed;
    }

    if (typeof window !== 'undefined') {
        const origin = window.location.origin.replace(/\/+$/, '');
        const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
        return `${origin}${path}`;
    }

    return trimmed;
};

export const getMediaKind = (file) => {
    if (!file) return '';
    const mime = String(file?.type || '').toLowerCase();
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('image/')) return 'photo';
    if (mime.startsWith('text/') || mime.includes('pdf') || mime.includes('document')) return 'document';

    const name = String(file?.name || '').toLowerCase();
    if (/\.(mp4|mov|webm|avi|mkv|3gp|m4v)$/i.test(name)) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return 'photo';
    if (/\.(pdf|txt|doc|docx|md|rtf)$/i.test(name)) return 'document';
    return '';
};

export const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve('');
            return;
        }

        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
    });
};
