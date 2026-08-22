export const compressAvatarImage = (fileOrDataUrl, maxDimension = 180, maxCharLength = 60000) => {
    return new Promise((resolve, reject) => {
        if (!fileOrDataUrl) {
            resolve('');
            return;
        }

        const img = new Image();
        img.onload = () => {
            let width = img.width || maxDimension;
            let height = img.height || maxDimension;

            if (width > height) {
                if (width > maxDimension) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                }
            } else {
                if (height > maxDimension) {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, width);
            canvas.height = Math.max(1, height);
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            }

            let quality = 0.75;
            let dataUrl = canvas.toDataURL('image/jpeg', quality);

            while (dataUrl.length > maxCharLength && quality > 0.2) {
                quality -= 0.1;
                dataUrl = canvas.toDataURL('image/jpeg', quality);
            }

            resolve(dataUrl);
        };

        img.onerror = () => reject(new Error('Failed to load image for avatar compression.'));

        if (typeof fileOrDataUrl === 'string') {
            if (!fileOrDataUrl.trim()) {
                resolve('');
                return;
            }
            img.src = fileOrDataUrl;
        } else {
            const reader = new FileReader();
            reader.onload = () => {
                img.src = String(reader.result || '');
            };
            reader.onerror = () => reject(new Error('Failed to read image file.'));
            reader.readAsDataURL(fileOrDataUrl);
        }
    });
};

export const isImageAvatar = (value) => {
    if (!value || typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('data:image/')) {
        return /^data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed);
    }
    if (trimmed.startsWith('/')) return true;
    return /^https?:\/\//i.test(trimmed) || /^blob:/i.test(trimmed);
};

export const getAvatarInitials = (name) => {
    const clean = String(name || 'U').trim();
    if (!clean) return 'U';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
