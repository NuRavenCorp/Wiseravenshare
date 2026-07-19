// src/styles/GlobalStyles.tsx
import {
    Global, css
}

from '@emotion/react';

export const GlobalStyles = () = > (
    <Global
        styles={css`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');

            :root {
                --primary-color: #667eea;
                --secondary-color: #764ba2;
                --bg-color: #0f1419;
                --card-bg: #1e293b;
                --border-color: #334155;
                --text-color: #f8fafc;
                --highlight-color: #94a3b8;
                --success-color: #10b981;
                --error-color: #ef4444;
                --warning-color: #f59e0b;
                --info-color: #3b82f6;
                --radius-sm: 8px;
                --radius-md: 12px;
                --radius-lg: 16px;
                --radius-xl: 24px;
                --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
                --shadow-md: 0 4px 12px rgba(0,0,0,0.3);
                --shadow-lg: 0 8px 24px rgba(0,0,0,0.3);
                --shadow-xl: 0 12px 36px rgba(0,0,0,0.4);
                --transition-fast: 0.2s ease;
                --transition-base: 0.3s ease;
                --transition-slow: 0.5s ease;
            }

            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }

            html {
                scroll-behavior: smooth;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-color);
                line-height: 1.6;
                min-height: 100vh;
                overflow-x: hidden;
            }

            /* Scrollbar Styling */
            ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }

            ::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
            }

            ::-webkit-scrollbar-thumb {
                background: var(--border-color);
                border-radius: 4px;
                transition: background var(--transition-fast);
            }

            ::-webkit-scrollbar-thumb:hover {
                background: var(--highlight-color);
            }

            /* Selection Styling */
            ::selection {
                background: rgba(102, 126, 234, 0.3);
                color: var(--text-color);
            }

            /* Focus Styles */
            *:focus-visible {
                outline: 2px solid var(--primary-color);
                outline-offset: 2px;
            }

            /* Button Reset */
            button {
                font-family: inherit;
                cursor: pointer;
                border: none;
                background: none;
                color: inherit;
            }

            /* Input Reset */
            input, textarea, select {
                font-family: inherit;
                color: inherit;
                background: none;
                border: none;
                outline: none;
            }

            /* Link Reset */
            a {
                color: inherit;
                text-decoration: none;
            }

            /* Utility Classes */
            .container {
                max-width: 1400px;
                margin: 0 auto;
                padding: 0 20px;
            }

            .flex {
                display: flex;
            }

            .flex-col {
                flex-direction: column;
            }

            .flex-center {
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .flex-between {
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .gap-1 { gap: 4px; }
            .gap-2 { gap: 8px; }
            .gap-3 { gap: 12px; }
            .gap-4 { gap: 16px; }
            .gap-5 { gap: 20px; }
            .gap-6 { gap: 24px; }
            .gap-8 { gap: 32px; }
            .gap-10 { gap: 40px; }

            .text-center { text-align: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }

            .w-full { width: 100%; }
            .h-full { height: 100%; }

            .relative { position: relative; }
            .absolute { position: absolute; }
            .fixed { position: fixed; }
            .sticky { position: sticky; }

            .overflow-hidden { overflow: hidden; }
            .overflow-auto { overflow: auto; }
            .overflow-y-auto { overflow-y: auto; }
            .overflow-x-auto { overflow-x: auto; }

            /* Animations */
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes slideIn {
                from { opacity: 0; transform: translateX(-20px); }
                to { opacity: 1; transform: translateX(0); }
            }

            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
            }

            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }

            .animate-fade-in {
                animation: fadeIn 0.5s ease-out;
            }

            .animate-slide-in {
                animation: slideIn 0.3s ease-out;
            }

            .animate-pulse {
                animation: pulse 2s ease-in-out infinite;
            }

            .animate-spin {
                animation: spin 1s linear infinite;
            }

            .animate-float {
                animation: float 3s ease-in-out infinite;
            }

            /* Glass effect */
            .glass {
                background: rgba(255, 255, 255, 0.05);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            /* Gradient text */
            .gradient-text {
                background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            /* Skeleton loading */
            .skeleton {
                background: linear-gradient(90deg, var(--border-color) 25%, rgba(255,255,255,0.1) 50%, var(--border-color) 75%);
                background-size: 200% 100%;
                animation: shimmer 1.5s ease-in-out infinite;
                border-radius: var(--radius-sm);
            }

            /* Responsive breakpoints */
            @media (max-width: 1536px) {
                .container { max-width: 1280px; }
            }

            @media (max-width: 1280px) {
                .container { max-width: 1024px; }
            }

            @media (max-width: 1024px) {
                .container { max-width: 768px; }
            }

            @media (max-width: 768px) {
                .container { padding: 0 16px; }
                .hide-mobile { display: none; }
            }

            @media (max-width: 480px) {
                .container { padding: 0 12px; }
                .hide-phone { display: none; }
            }
        `}
    />
);
