class WebSocketService {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
    }

    connect(url) {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);

                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.reconnectAttempts = 0;
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('Failed to parse WebSocket message:', error);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    this.attemptReconnect(url);
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    attemptReconnect(url) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                this.connect(url);
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    handleMessage(data) {
        const { type, payload } = data;
        if (this.listeners.has(type)) {
            this.listeners.get(type).forEach(callback => callback(payload));
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    send(type, payload) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, payload }));
            return true;
        }
        return false;
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.listeners.clear();
    }
}

export const wsService = new WebSocketService();