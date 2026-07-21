# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
# WiseRavenShare

A truth-powered social media platform with real-time fact checking, podcast publishing, and advanced planning tools.

## Features

### Social Media
- Create posts with text, images, videos, and audio
- Like, repost, and comment on content
- Follow users and personalized feeds
- Real-time truth detection and fact checking
- Direct messaging system

### Ravensight Podcast System
- Upload audio content directly to YouTube
- Podcast management and analytics
- Automatic transcription (coming soon)

### Wise Planner
- Goal setting (long-term, short-term, next actions)
- Task management with Kanban board
- Priority tracking (urgent, high, medium, low)
- Calendar integration
- Productivity analytics
- Stock market widget
- AI-powered recommendations

### Truth Detection Engine
- Real-time content analysis
- Automated fact checking
- Dispute resolution system
- Truth scoring (0-100%)
- Source citations

## Tech Stack

- **Frontend**: React 18, CSS3
- **State Management**: Context API + Custom hooks
- **HTTP Client**: Axios
- **Storage**: LocalStorage + IndexedDB
- **Real-time**: WebSocket
- **Authentication**: JWT

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/wiseravenshare.git

# Navigate to project directory
cd wiseravenshare

# Install dependencies
npm install

# Start development server
npm start