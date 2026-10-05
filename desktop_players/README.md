# WiseRavenShare Desktop Media Players

Professional-grade audio and video players for DigitalOcean Spaces streaming.

## Features

### Audio Player (`audio_player.py`)
- ✅ Play/Pause/Stop/Rewind/Fast-Forward controls
- ✅ 10-second skip buttons
- ✅ Seek bar with time display (current / total)
- ✅ Volume control with mute
- ✅ Double-click playlist items to play
- ✅ Stream audio from WiseRavenShare API
- ✅ Add local audio files
- ✅ Auto-advance to next track
- ✅ Persistent playlist management

### Video Player (coming soon)
- 🎬 Video surface with hardware acceleration
- ⏱️ Same transport controls as audio player
- 📹 Folder-based category browsing
- 💾 Progress tracking (save position, mark complete)
- 🔄 Resume playback from last position

## Installation

### Prerequisites
- Python 3.10+
- VLC desktop application installed on your system (for codec support)
- ASP.NET Core backend running at http://localhost:5000

### Setup

```bash
# Clone or download the desktop_players directory
cd desktop_players

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### macOS-specific (if needed)
```bash
brew install vlc
pip install python-vlc
```

### Windows-specific (if needed)
```bash
# Install VLC from https://www.videolan.org/vlc/
# python-vlc should auto-detect the installation
```

## Usage

### Audio Player

```bash
# Using default API URL (http://localhost:5000)
python audio_player.py

# Using custom API URL
export WRS_API_URL=https://api.wiseravenshare.com
python audio_player.py

# Windows
set WRS_API_URL=https://api.wiseravenshare.com
python audio_player.py
```

**Controls:**
- **⏮ Prev** — Jump to previous track
- **⏪ 10s** — Rewind 10 seconds
- **▶ Play** — Start playback
- **⏹ Stop** — Stop playback
- **⏩ 10s** — Fast forward 10 seconds
- **Next ⏭** — Jump to next track
- **Volume Slider** — Adjust volume 0-100%
- **🔊 Mute** — Toggle mute
- **Load from API** — Fetch your library from server
- **Add local files** — Add MP3/M4A/WAV/FLAC/OGG files
- **Clear playlist** — Remove all tracks

**Keyboard Shortcuts:**
- *Double-click* playlist item to play

### Video Player

```bash
python video_player.py
```

(Video player coming in next update with same control scheme)

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WRS_API_URL` | `http://localhost:5000` | Backend API endpoint |
| `Storage__Blob__BucketName` | `bucket-wrs-01010` | DigitalOcean Spaces bucket name |
| `Storage__Blob__Endpoint` | `https://nyc3.digitaloceanspaces.com` | DO Spaces endpoint |

### API Integration

The players communicate with the ASP.NET Core backend via:

```
GET  /api/ravensight/media/music          → List tracks
GET  /api/videostreaming/blob/{objectKey} → Stream (presigned URL)
POST /api/ravensight/media/music/state    → Save playback state
GET  /api/ravensight/media/music/state    → Load playback state
```

All URLs are presigned and temporary (1-hour expiry by default).

## Troubleshooting

### "No module named vlc"
```bash
pip install python-vlc
```

### "No audio device found"
- Ensure system volume is not muted
- Check PyQt6 audio output is not muted
- Try restarting the app

### API connection fails
- Verify backend is running: `curl http://localhost:5000/health`
- Check firewall allows localhost:5000
- Use `WRS_API_URL` env var to point to correct server

### VLC codec errors
- Install VLC desktop app from https://www.videolan.org/vlc/
- On macOS: `brew install vlc`
- On Linux: `sudo apt-get install vlc`
- On Windows: Download from VLC website

## Architecture

```
AudioPlayer (PyQt6 Window)
    ↓
AudioPlayerBackend (VLC + API)
    ├── VLC Media List Player
    ├── Position/Duration Timer
    └── HTTP API Client
        ↓
    ASP.NET Core Backend
        ├── Fetch library: /api/ravensight/media/music
        └── Generate presigned URL: /api/videostreaming/blob/{key}
            ↓
        DigitalOcean Spaces
            └── Bucket: bucket-wrs-01010
                └── Prefix: music/ or video/
```

## Performance

- **Streaming**: Presigned URLs bypass server proxy—direct Spaces download
- **Memory**: VLC streams on-the-fly, no full file download required
- **Responsiveness**: Position updates every 500ms
- **Codec Support**: Full VLC library (MP3, M4A, FLAC, OGG, WAV, AAC)

## Development

To extend the players:

1. **Add new transport control:**
   ```python
   self.btn_new = QPushButton("Label")
   self.btn_new.clicked.connect(self.backend.method_name)
   controls_box.addWidget(self.btn_new)
   ```

2. **Add metadata display:**
   ```python
   track = self.backend.playlist[index]
   print(f"Track: {track['title']} - {track.get('artist', 'Unknown')}")
   ```

3. **Persist state:**
   ```python
   state = {
       'playlist': self.backend.playlist,
       'current_index': self.backend.current_index,
       'position': self.backend.get_position()
   }
   with open('player_state.json', 'w') as f:
       json.dump(state, f)
   ```

## License

© 2026 WiseRavenShare. All rights reserved.

## Support

Issues or feature requests? Contact: support@wiseravenshare.com
