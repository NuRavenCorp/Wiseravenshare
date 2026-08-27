// wiseravenshare.client/src/utils/platformSharing.js
// Deep-link share helpers for external platforms.

export const platformShare = {
    tiktok: ({ text, url }) => {
        window.open(`https://www.tiktok.com/upload?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    },
    facebook: ({ text, url }) => {
        window.open(`https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}&u=${encodeURIComponent(url)}`, '_blank');
    },
    instagram: ({ url }) => {
        window.open(`https://www.instagram.com/share?url=${encodeURIComponent(url)}`, '_blank');
    },
    twitter: ({ text, url }) => {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
    },
    whatsapp: ({ text, url }) => {
        window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank');
    },
    general: ({ title, text, url }) => {
        if (navigator.share) {
            navigator.share({ title, text, url }).catch(() => {});
        } else {
            window.open(`https://www.addtoany.com/share#url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, '_blank');
        }
    }
};
