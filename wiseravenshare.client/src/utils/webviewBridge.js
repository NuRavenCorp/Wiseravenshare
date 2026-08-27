// wiseravenshare.client/src/utils/webviewBridge.js
// Bidirectional message bridge between the app running inside an external
// webview (TikTok/Facebook/Instagram) and the host application.

export const WEBVIEW_BRIDGE_TYPE = 'wiseravenshare_bridge';

export class WebviewBridge {
    constructor() {
        this.listeners = new Map();
        this.isReady = /webview|wv;|FBAN|FB_IAB|Instagram|TikTok/i.test(navigator.userAgent);
        window.addEventListener('message', this.handleMessage.bind(this));

        if (this.isReady) {
            this.sendMessage({ type: 'webview_ready', payload: {} });
        }
    }

    handleMessage(event) {
        if (event.data?.type !== WEBVIEW_BRIDGE_TYPE) return;
        const { type, payload } = event.data;
        const callbacks = this.listeners.get(type) || [];
        callbacks.forEach((callback) => {
            try { callback(payload); } catch (error) { console.error('webviewBridge listener failed', error); }
        });
    }

    sendMessage({ type, payload }) {
        if (!type || !window.parent || window.parent === window) return false;
        window.parent.postMessage({
            type: WEBVIEW_BRIDGE_TYPE,
            bridgeType: type,
            payload,
            source: 'wiseravenshare_webview',
            timestamp: Date.now()
        }, '*');
        return true;
    }

    onMessage(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
        return () => this.offMessage(type, callback);
    }

    offMessage(type, callback) {
        const callbacks = this.listeners.get(type);
        if (!callbacks) return;
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
    }

    isInWebview() { return this.isReady; }

    closeWebview() { this.sendMessage({ type: 'close_webview', payload: {} }); }

    navigateTo(url) { this.sendMessage({ type: 'navigate', payload: { url } }); }
}

export const webviewBridge = new WebviewBridge();
