export const resolveMediaUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';

    if (trimmed.startsWith('data:') || trimmed.startsWith('blob:') || /^https?:\/\//i.test(trimmed)) {
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
