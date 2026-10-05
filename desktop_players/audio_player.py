#!/usr/bin/env python3
"""
WiseRavenShare Desktop Audio Player

Desktop audio player using PyQt6 + python-vlc for streaming from DigitalOcean Spaces.
Consumes presigned URLs from the ASP.NET Core API.

Features:
- Play/Pause/Stop/Rewind/Fast-Forward controls
- Playlist management with double-click to play
- Seek bar with time display
- Volume control with mute
- Persistent playback state
- Auto-advance to next track on end
"""

import sys
import os
import json
import requests
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

from PyQt6.QtWidgets import (
    QApplication, QWidget, QVBoxLayout, QHBoxLayout, QPushButton,
    QListWidget, QListWidgetItem, QSlider, QLabel, QFileDialog,
    QDialog, QLineEdit, QComboBox, QMessageBox, QProgressBar,
    QHeaderView, QTableWidget, QTableWidgetItem, QAbstractItemView
)
from PyQt6.QtCore import Qt, QTimer, pyqtSignal, QObject
from PyQt6.QtGui import QIcon, QFont, QColor
import vlc


class AudioPlayerBackend(QObject):
    """Manages VLC playback and API communication"""
    
    playback_changed = pyqtSignal(bool)  # isPlaying
    duration_changed = pyqtSignal(int)   # milliseconds
    position_changed = pyqtSignal(int)   # milliseconds
    track_ended = pyqtSignal()
    
    def __init__(self, api_url: str = "http://localhost:5000"):
        super().__init__()
        self.api_url = api_url.rstrip('/')
        self.instance = vlc.Instance()
        self.player = self.instance.media_list_player_new()
        self.current_media_list = self.instance.media_list_new()
        self.player.set_media_list(self.current_media_list)
        
        self.playlist: List[Dict[str, Any]] = []
        self.current_index = -1
        
        # Timer for position updates
        self.position_timer = QTimer()
        self.position_timer.timeout.connect(self._update_position)
        self.position_timer.start(500)
    
    def add_local_file(self, path: str):
        """Add local audio file to playlist"""
        media = self.instance.media_new(path)
        title = Path(path).stem
        
        self.playlist.append({
            'title': title,
            'source': path,
            'type': 'local'
        })
        self.current_media_list.add_media(media)
    
    def add_stream_url(self, url: str, title: str = ""):
        """Add presigned stream URL to playlist"""
        media = self.instance.media_new(url)
        self.playlist.append({
            'title': title or url.split('/')[-1],
            'source': url,
            'type': 'stream'
        })
        self.current_media_list.add_media(media)
    
    def fetch_library_from_api(self) -> List[Dict[str, Any]]:
        """Fetch music library from API and return with presigned URLs"""
        try:
            resp = requests.get(f"{self.api_url}/api/ravensight/media/music", timeout=10)
            resp.raise_for_status()
            tracks = resp.json()
            
            library = []
            for track in tracks:
                try:
                    # Get presigned URL
                    url_resp = requests.get(
                        f"{self.api_url}/api/videostreaming/blob/{track.get('objectKey', '')}",
                        timeout=10
                    )
                    stream_url = url_resp.url if url_resp.status_code == 200 else None
                    
                    if stream_url:
                        library.append({
                            'id': track.get('id'),
                            'title': track.get('title', 'Unknown'),
                            'artist': track.get('artist', 'Unknown'),
                            'album': track.get('album', ''),
                            'stream_url': stream_url
                        })
                except Exception as e:
                    print(f"Error fetching URL for {track.get('title')}: {e}")
            
            return library
        except Exception as e:
            print(f"Error fetching library from API: {e}")
            return []
    
    def load_library(self):
        """Load library from API and add to playlist"""
        library = self.fetch_library_from_api()
        for track in library:
            self.add_stream_url(track['stream_url'], track['title'])
    
    def play(self):
        """Start playback"""
        if self.current_index >= 0 and self.current_index < len(self.playlist):
            self.player.play()
            self.playback_changed.emit(True)
    
    def pause(self):
        """Pause playback"""
        self.player.pause()
        self.playback_changed.emit(False)
    
    def stop(self):
        """Stop playback"""
        self.player.stop()
        self.playback_changed.emit(False)
    
    def play_at_index(self, index: int):
        """Play track at given index"""
        if 0 <= index < len(self.playlist):
            self.current_index = index
            self.player.play_item_at_index(index)
            self.playback_changed.emit(True)
    
    def next(self):
        """Skip to next track"""
        if self.current_index + 1 < len(self.playlist):
            self.play_at_index(self.current_index + 1)
    
    def previous(self):
        """Skip to previous track"""
        if self.current_index > 0:
            self.play_at_index(self.current_index - 1)
    
    def seek(self, milliseconds: int):
        """Seek to position"""
        media_player = self.player.get_media_player()
        if media_player:
            media_player.set_time(milliseconds)
    
    def set_volume(self, percent: int):
        """Set volume (0-100)"""
        media_player = self.player.get_media_player()
        if media_player:
            media_player.audio_set_volume(max(0, min(100, percent)))
    
    def get_duration(self) -> int:
        """Get current track duration in milliseconds"""
        media_player = self.player.get_media_player()
        if media_player:
            return media_player.get_length()
        return 0
    
    def get_position(self) -> int:
        """Get current playback position in milliseconds"""
        media_player = self.player.get_media_player()
        if media_player:
            return media_player.get_time()
        return 0
    
    def is_playing(self) -> bool:
        """Check if currently playing"""
        media_player = self.player.get_media_player()
        if media_player:
            return media_player.is_playing()
        return False
    
    def _update_position(self):
        """Emit position update signal"""
        pos = self.get_position()
        if pos > 0:
            self.position_changed.emit(pos)
        
        duration = self.get_duration()
        if duration > 0 and pos >= duration - 100:  # Track ended
            self.track_ended.emit()


class AudioPlayerWindow(QWidget):
    """Main audio player window"""
    
    def __init__(self, api_url: str = "http://localhost:5000"):
        super().__init__()
        self.api_url = api_url
        self.backend = AudioPlayerBackend(api_url)
        self.volume_before_mute = 80
        
        self.setWindowTitle("WiseRavenShare Audio Player")
        self.setGeometry(100, 100, 700, 600)
        self.setMinimumSize(500, 400)
        
        self._build_ui()
        self._connect_signals()
    
    def _build_ui(self):
        """Build user interface"""
        root = QVBoxLayout(self)
        root.setContentsMargins(12, 12, 12, 12)
        root.setSpacing(10)
        
        # Now playing display
        now_playing_box = QVBoxLayout()
        self.now_playing_title = QLabel("No track playing")
        self.now_playing_title.setFont(QFont("Arial", 14, QFont.Weight.Bold))
        self.now_playing_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.now_playing_artist = QLabel("")
        self.now_playing_artist.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.now_playing_artist.setStyleSheet("color: #999;")
        now_playing_box.addWidget(self.now_playing_title)
        now_playing_box.addWidget(self.now_playing_artist)
        root.addLayout(now_playing_box)
        
        # Seek bar and time
        seek_box = QHBoxLayout()
        self.time_label = QLabel("00:00")
        self.time_label.setFont(QFont("Courier", 10))
        self.time_label.setMaximumWidth(50)
        self.seek_slider = QSlider(Qt.Orientation.Horizontal)
        self.seek_slider.setRange(0, 1000)
        self.seek_slider.sliderMoved.connect(self._on_seek)
        self.duration_label = QLabel("00:00")
        self.duration_label.setFont(QFont("Courier", 10))
        self.duration_label.setMaximumWidth(50)
        seek_box.addWidget(self.time_label)
        seek_box.addWidget(self.seek_slider)
        seek_box.addWidget(self.duration_label)
        root.addLayout(seek_box)
        
        # Transport controls
        controls_box = QHBoxLayout()
        controls_box.addStretch()
        
        self.btn_prev = QPushButton("⏮ Prev")
        self.btn_prev.clicked.connect(lambda: self.backend.previous())
        controls_box.addWidget(self.btn_prev)
        
        self.btn_rewind = QPushButton("⏪ 10s")
        self.btn_rewind.clicked.connect(lambda: self._skip(-10000))
        controls_box.addWidget(self.btn_rewind)
        
        self.btn_play_pause = QPushButton("▶ Play")
        self.btn_play_pause.setMinimumWidth(100)
        self.btn_play_pause.clicked.connect(self._on_play_pause_click)
        controls_box.addWidget(self.btn_play_pause)
        
        self.btn_stop = QPushButton("⏹ Stop")
        self.btn_stop.clicked.connect(lambda: self.backend.stop())
        controls_box.addWidget(self.btn_stop)
        
        self.btn_forward = QPushButton("⏩ 10s")
        self.btn_forward.clicked.connect(lambda: self._skip(10000))
        controls_box.addWidget(self.btn_forward)
        
        self.btn_next = QPushButton("Next ⏭")
        self.btn_next.clicked.connect(lambda: self.backend.next())
        controls_box.addWidget(self.btn_next)
        
        controls_box.addStretch()
        root.addLayout(controls_box)
        
        # Volume control
        volume_box = QHBoxLayout()
        volume_box.addWidget(QLabel("Volume:"))
        self.volume_slider = QSlider(Qt.Orientation.Horizontal)
        self.volume_slider.setRange(0, 100)
        self.volume_slider.setValue(80)
        self.volume_slider.setMaximumWidth(150)
        self.volume_slider.valueChanged.connect(
            lambda v: self.backend.set_volume(v)
        )
        volume_box.addWidget(self.volume_slider)
        self.volume_label = QLabel("80%")
        self.volume_label.setMaximumWidth(40)
        volume_box.addWidget(self.volume_label)
        self.btn_mute = QPushButton("🔊 Mute")
        self.btn_mute.setMaximumWidth(80)
        self.btn_mute.clicked.connect(self._on_mute_click)
        volume_box.addWidget(self.btn_mute)
        volume_box.addStretch()
        root.addLayout(volume_box)
        
        # Playlist
        playlist_label = QLabel("Playlist")
        playlist_label.setFont(QFont("Arial", 11, QFont.Weight.Bold))
        root.addWidget(playlist_label)
        
        self.playlist_widget = QListWidget()
        self.playlist_widget.itemDoubleClicked.connect(self._on_playlist_item_double_click)
        self.playlist_widget.setMaximumHeight(250)
        root.addWidget(self.playlist_widget, stretch=1)
        
        # Library controls
        lib_box = QHBoxLayout()
        self.btn_load_api = QPushButton("Load from API")
        self.btn_load_api.clicked.connect(self._on_load_from_api)
        lib_box.addWidget(self.btn_load_api)
        
        self.btn_add_local = QPushButton("Add local files")
        self.btn_add_local.clicked.connect(self._on_add_local_files)
        lib_box.addWidget(self.btn_add_local)
        
        self.btn_clear_playlist = QPushButton("Clear playlist")
        self.btn_clear_playlist.clicked.connect(self._on_clear_playlist)
        lib_box.addWidget(self.btn_clear_playlist)
        
        lib_box.addStretch()
        root.addLayout(lib_box)
    
    def _connect_signals(self):
        """Connect backend signals to UI slots"""
        self.backend.playback_changed.connect(self._on_playback_changed)
        self.backend.position_changed.connect(self._on_position_changed)
        self.backend.track_ended.connect(self._on_track_ended)
    
    def _update_track_display(self, index: int):
        """Update now-playing display for track at index"""
        if 0 <= index < len(self.backend.playlist):
            track = self.backend.playlist[index]
            self.now_playing_title.setText(track.get('title', 'Unknown'))
            artist = track.get('artist', '')
            if artist:
                self.now_playing_artist.setText(f"by {artist}")
            self.playlist_widget.setCurrentRow(index)
    
    def _format_time(self, ms: int) -> str:
        """Format milliseconds as MM:SS"""
        if ms < 0:
            ms = 0
        s = ms // 1000
        return f"{s // 60:02d}:{s % 60:02d}"
    
    def _on_play_pause_click(self):
        """Toggle play/pause"""
        if self.backend.is_playing():
            self.backend.pause()
        else:
            if self.backend.current_index < 0 and self.backend.playlist:
                self.backend.play_at_index(0)
            else:
                self.backend.play()
    
    def _on_mute_click(self):
        """Toggle mute"""
        if self.volume_slider.value() > 0:
            self.volume_before_mute = self.volume_slider.value()
            self.volume_slider.setValue(0)
            self.btn_mute.setText("🔇 Unmute")
        else:
            self.volume_slider.setValue(self.volume_before_mute)
            self.btn_mute.setText("🔊 Mute")
    
    def _on_seek(self, value: int):
        """Handle seek bar movement"""
        duration = self.backend.get_duration()
        if duration > 0:
            new_pos = int(value / 1000.0 * duration)
            self.backend.seek(new_pos)
    
    def _skip(self, ms: int):
        """Skip forward or backward"""
        current = self.backend.get_position()
        self.backend.seek(max(0, current + ms))
    
    def _on_playback_changed(self, is_playing: bool):
        """Update UI when playback state changes"""
        if is_playing:
            self.btn_play_pause.setText("⏸ Pause")
        else:
            self.btn_play_pause.setText("▶ Play")
    
    def _on_position_changed(self, pos_ms: int):
        """Update progress indicators"""
        duration = self.backend.get_duration()
        
        self.time_label.setText(self._format_time(pos_ms))
        self.duration_label.setText(self._format_time(duration))
        
        if duration > 0:
            self.seek_slider.blockSignals(True)
            self.seek_slider.setValue(int(pos_ms / duration * 1000))
            self.seek_slider.blockSignals(False)
    
    def _on_track_ended(self):
        """Auto-advance to next track"""
        if self.backend.current_index + 1 < len(self.backend.playlist):
            self.backend.next()
        else:
            self.backend.stop()
            self.now_playing_title.setText("End of playlist")
    
    def _on_playlist_item_double_click(self, item: QListWidgetItem):
        """Play track when clicked in playlist"""
        index = self.playlist_widget.row(item)
        self.backend.play_at_index(index)
        self._update_track_display(index)
    
    def _on_load_from_api(self):
        """Load library from API"""
        try:
            self.backend.current_media_list.clear()
            self.backend.playlist.clear()
            self.playlist_widget.clear()
            
            library = self.backend.fetch_library_from_api()
            for track in library:
                self.backend.add_stream_url(track['stream_url'], track['title'])
                item = QListWidgetItem(f"{track['title']}")
                if track.get('artist'):
                    item.setText(f"{track['title']} - {track['artist']}")
                self.playlist_widget.addItem(item)
            
            QMessageBox.information(self, "Success", f"Loaded {len(library)} tracks from API")
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load from API: {e}")
    
    def _on_add_local_files(self):
        """Add local audio files"""
        files, _ = QFileDialog.getOpenFileNames(
            self, "Add audio files", "",
            "Audio Files (*.mp3 *.m4a *.wav *.flac *.ogg *.aac);;All Files (*)"
        )
        for path in files:
            self.backend.add_local_file(path)
            item = QListWidgetItem(Path(path).name)
            self.playlist_widget.addItem(item)
    
    def _on_clear_playlist(self):
        """Clear playlist"""
        self.backend.stop()
        self.backend.current_media_list.clear()
        self.backend.playlist.clear()
        self.backend.current_index = -1
        self.playlist_widget.clear()
        self.now_playing_title.setText("No track playing")
        self.now_playing_artist.setText("")


def main():
    app = QApplication(sys.argv)
    
    # Try to connect to API, default to localhost:5000
    api_url = os.getenv('WRS_API_URL', 'http://localhost:5000')
    
    player = AudioPlayerWindow(api_url)
    player.show()
    
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
