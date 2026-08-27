// wiseravenshare.client/src/utils/platformDetector.js
// Detects the host platform (TikTok/Facebook/Instagram/Twitter webviews, Capacitor, plain web)
// and reports the capabilities available in the current runtime.

export const detectPlatform = () => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    let platform = 'web';
    if (ua.includes('TikTok')) platform = 'tiktok';
    else if (ua.includes('FBAN') || ua.includes('FB_IAB') || ua.includes('Facebook')) platform = 'facebook';
    else if (ua.includes('Instagram')) platform = 'instagram';
    else if (ua.includes('Twitter')) platform = 'twitter';
    else if (/Capacitor/i.test(ua)) platform = 'capacitor';

    const isWebview = /webview|wv;/i.test(ua)
        || /FBAN|FB_IAB|FBAV/i.test(ua)
        || /Instagram/i.test(ua)
        || /TikTok/i.test(ua);

    return {
        platform,
        isWebview,
        isMobile,
        userAgent: ua,
        capabilities: {
            camera: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            microphone: Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            sharing: Boolean(navigator.share),
            notifications: typeof window !== 'undefined' && Boolean(window.Notification)
        }
    };
};

export const getPlatformSpecificUrl = (platform, path) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const params = {
        tiktok: '?utm_source=tiktok&utm_medium=webview',
        facebook: '?utm_source=facebook&utm_medium=webview',
        instagram: '?utm_source=instagram&utm_medium=webview',
        twitter: '?utm_source=twitter&utm_medium=webview',
        web: ''
    };
    const suffix = params[platform] || '';
    return `${baseUrl}${path}${suffix}`;
};

export const setupPlatformBridge = (platform) => ({
    postMessage: (data) => {
        if (window.parent && window.parent !== window) {
            window.parent.postMessage({
                type: 'wiseravenshare_bridge',
                platform,
                data,
                timestamp: Date.now()
            }, '*');
        }
    },
    onMessage: (callback) => {
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'wiseravenshare_bridge') callback(event.data);
        });
    }
});
