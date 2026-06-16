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
npm run dev
```

## Android App (Capacitor)

The web app is now configured to build as a native Android app using Capacitor.

### One-time requirements

- Install Android Studio
- Install Android SDK + a device/emulator in Android Studio
- Ensure Java 17+ is installed

### Android commands

```bash
# Build web assets and sync them into the Android project
npm run android:sync

# Regenerate Android icon/splash assets from ./resources/logo.svg
npm run android:assets

# Open native Android project in Android Studio
npm run android:open

# Optional: build + sync + run directly on connected device/emulator
npm run android:run

# Build release APK (signed if keystore is configured)
npm run android:release:apk

# Build release AAB for Play Store (signed if keystore is configured)
npm run android:release:bundle
```

### API URL for emulator/device

If your backend runs locally, do not use localhost in the mobile app.

- Android emulator host machine: use `http://10.0.2.2:10000/api`
- Real device: use your computer's LAN IP, e.g. `http://192.168.1.20:10000/api`

Create or update `.env.development` / `.env.production` with:

```bash
VITE_API_URL=http://10.0.2.2:10000/api
```

Then run `npm run android:sync` again.

### Customize icon and splash

Place your source logo in [wiseravenshare.client/resources/logo.svg](wiseravenshare.client/resources/logo.svg) (or `logo.png`), then run:

```bash
npm run android:assets
```

### Signed release setup

Option 1: file-based config
1. Copy [wiseravenshare.client/android/keystore.properties.example](wiseravenshare.client/android/keystore.properties.example) to `wiseravenshare.client/android/keystore.properties`.
2. Fill `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.

Option 2: environment variables
1. `ANDROID_KEYSTORE_PATH`
2. `ANDROID_KEYSTORE_PASSWORD`
3. `ANDROID_KEY_ALIAS`
4. `ANDROID_KEY_PASSWORD`

If neither is provided, release builds still run but output unsigned artifacts.

### Version automation for Android

Android version fields are now automated in [wiseravenshare.client/android/app/build.gradle](wiseravenshare.client/android/app/build.gradle):

1. `versionCode` uses `VERSION_CODE` (Gradle property) or `ANDROID_VERSION_CODE` (environment variable), default `1`.
2. `versionName` uses `VERSION_NAME` (Gradle property) or `ANDROID_VERSION_NAME` (environment variable), default `1.0.0`.

Examples:

```bash
# Linux/macOS
ANDROID_VERSION_CODE=42 ANDROID_VERSION_NAME=1.4.2 npm run android:release:bundle
```

```powershell
# Windows PowerShell
$env:ANDROID_VERSION_CODE="42"
$env:ANDROID_VERSION_NAME="1.4.2"
npm run android:release:bundle
```

### GitHub Actions Android CI/CD

A workflow is available at [.github/workflows/android-release.yml](.github/workflows/android-release.yml).

Triggers:
1. Manual run (`workflow_dispatch`)
2. Tag push matching `android-v*` (example: `android-v1.4.2`)

Artifacts uploaded:
1. Release APK
2. Release AAB
3. Generated release notes (`RELEASE_NOTES.md`)

On tag builds (`android-v*`), the workflow also creates a GitHub Release and attaches APK/AAB artifacts with auto-generated notes.

Repository secrets for signed builds:
1. `ANDROID_KEYSTORE_BASE64` (base64 of your `.jks` file)
2. `ANDROID_KEYSTORE_PASSWORD`
3. `ANDROID_KEY_ALIAS`
4. `ANDROID_KEY_PASSWORD`

Additional secrets/variables for Google Play upload (optional):
1. `ANDROID_PLAY_SERVICE_ACCOUNT_JSON` (service account JSON text with Play Console access)
2. `ANDROID_PLAY_TRACK` (optional: `internal`, `alpha`, `beta`, `production`; defaults to `internal`)

If keystore secrets are absent, the workflow still builds unsigned release artifacts.

If Play secrets are absent, Google Play upload is skipped and the workflow still publishes artifacts.

### Java setup note for release builds

If Gradle fails with `JAVA_HOME is set to an invalid directory`, set it to your JDK path (Java 17+), then reopen terminal.

PowerShell example:

```powershell
$env:JAVA_HOME = "C:\\Program Files\\Eclipse Adoptium\\jdk-17"
$env:Path = "$env:JAVA_HOME\\bin;$env:Path"
```