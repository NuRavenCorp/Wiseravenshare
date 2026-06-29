import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import { env } from 'process';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin()],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    },
    build: {
        // Split vendor chunks to improve caching
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
                        return 'vendor-react';
                    }
                    if (id.includes('node_modules/react-icons')) {
                        return 'vendor-icons';
                    }
                    if (id.includes('node_modules/axios')) {
                        return 'vendor-http';
                    }
                }
            }
        },
        chunkSizeWarningLimit: 600
    },
    server: {
        port: parseInt(env.DEV_SERVER_PORT || '5173'),
        proxy: {
            '/api': {
                target: 'http://localhost:10000',
                changeOrigin: true,
                secure: false
            },
            '/auth': {
                target: 'http://localhost:10000',
                changeOrigin: true,
                secure: false
            }
        }
    }
})
