import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // rolldown (Vite 8) requires manualChunks as a function, not an object
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          if (id.includes('recharts')) return 'vendor-charts';
          if (id.includes('react-quill')) return 'vendor-quill';
          if (id.includes('react-player')) return 'vendor-player';
          if (id.includes('wavesurfer') || id.includes('howler')) return 'vendor-audio';
          if (id.includes('/three/') || id.includes('\\three\\')) return 'vendor-three';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('@radix-ui')) return 'vendor-radix';
          if (id.includes('@stripe')) return 'vendor-stripe';
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('/zod/') || id.includes('\\zod\\')) return 'vendor-forms';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/') || id.includes('\\react\\')) return 'vendor-react';
          return undefined;
        },
      },
    },
  },
});
