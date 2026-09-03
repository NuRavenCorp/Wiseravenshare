import React, { useState, useEffect, useRef } from 'react';
import {
  FiUpload, FiShare2, FiPlay, FiPause, FiTrash2, FiEdit2,
  FiMusic, FiDownload, FiMoreVertical, FiX, FiCopy, FiCheck, FiArrowRight
} from 'react-icons/fi';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { shareMusic, buildMusicShareUrl, musicPlatformShare } from '../utils/musicShare';
import AudioPlayer from '../Components/Ravensight/AudioPlayer';
import '../Styles/MusicRightsStudio.css';

const MusicRightsStudioPage = ({ onNavigate, user: propUser }) => {
  const { user } = useAuth();
  const { addToast } = useNotification();
  const currentUser = propUser || user;

  const [musicLibrary, setMusicLibrary] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [selectedTrackForPlayer, setSelectedTrackForPlayer] = useState(null);
  const [sharingTrackId, setSharingTrackId] = useState(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(null);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadFormData, setUploadFormData] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    file: null
  });

  const fileInputRef = useRef(null);

  // Load music library from localStorage (demo) or backend
  useEffect(() => {
    const loadMusicLibrary = async () => {
      try {
        // Try to fetch from backend if available
        const token = localStorage.getItem('authToken');
        if (token) {
          const response = await fetch('/api/ravensight/media/music', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const data = await response.json();
            setMusicLibrary(Array.isArray(data) ? data : []);
          }
        } else {
          // Load from localStorage for demo
          const stored = localStorage.getItem('wiseMusic_library');
          if (stored) {
            setMusicLibrary(JSON.parse(stored));
          }
        }
      } catch (error) {
        console.warn('Failed to load music library:', error);
        // Use demo data
        setMusicLibrary(DEMO_TRACKS);
      }
    };

    loadMusicLibrary();
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (musicLibrary.length > 0) {
      localStorage.setItem('wiseMusic_library', JSON.stringify(musicLibrary));
    }
  }, [musicLibrary]);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('audio/')) {
        addToast('Please select an audio file', 'error');
        return;
      }
      setUploadFormData({ ...uploadFormData, file });
    }
  };

  const handleUploadMusic = async (event) => {
    event.preventDefault();
    if (!uploadFormData.file) {
      addToast('Please select a file', 'warning');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFormData.file);
      formData.append('title', uploadFormData.title || uploadFormData.file.name);
      formData.append('artist', uploadFormData.artist || 'Unknown Artist');
      formData.append('album', uploadFormData.album || 'Unknown Album');
      formData.append('genre', uploadFormData.genre || 'General');
      formData.append('destinationFolder', '/wiseravenshare/ravensight/music');

      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/ravensight/media/music/save', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        const newTrack = {
          id: `music_${Date.now()}`,
          title: uploadFormData.title || uploadFormData.file.name,
          artist: uploadFormData.artist || 'Unknown Artist',
          album: uploadFormData.album || 'Unknown Album',
          genre: uploadFormData.genre || 'General',
          mediaUrl: result.file?.mediaUrl || URL.createObjectURL(uploadFormData.file),
          fileName: result.file?.fileName || uploadFormData.file.name,
          uploadedAt: new Date().toISOString(),
          duration: '0:00'
        };

        setMusicLibrary([newTrack, ...musicLibrary]);
        setUploadFormData({ title: '', artist: '', album: '', genre: '', file: null });
        setShowUploadForm(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        addToast('Music uploaded successfully!', 'success');
      } else {
        const error = await response.json();
        addToast(error.message || 'Upload failed', 'error');
      }
    } catch (error) {
      console.error('Upload error:', error);
      addToast('Failed to upload music', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleShareMusic = async (track, options = {}) => {
    setSharingTrackId(track.id);
    try {
      await shareMusic({
        track,
        currentUser,
        crossPost: options.crossPost || false,
        crossPostTargets: options.crossPostTargets || { facebook: true, tiktok: false, youtube: false },
        onNotification: (message, type) => addToast(message, type)
      });
      setShareMenuOpen(null);
    } catch (error) {
      console.error('Share error:', error);
      addToast('Failed to share music', 'error');
    } finally {
      setSharingTrackId(null);
    }
  };

  const handlePlatformShare = (track, platform) => {
    const shareUrl = buildMusicShareUrl(track, currentUser);
    const message = `🎵 ${track.artist} — ${track.title}${track.album ? ` (${track.album})` : ''}`;

    if (musicPlatformShare[platform]) {
      musicPlatformShare[platform]({ message, url: shareUrl, track });
    }
    setShareMenuOpen(null);
  };

  const handleDeleteTrack = (trackId) => {
    if (confirm('Delete this track?')) {
      setMusicLibrary(musicLibrary.filter((t) => t.id !== trackId));
      addToast('Track deleted', 'success');
    }
  };

  const handlePlayTrack = (track) => {
    setSelectedTrackForPlayer(track);
    setPlayingTrackId(track.id);
  };

  return (
    <div style={{ padding: '20px', background: 'var(--bg-color)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '30px',
        paddingBottom: '15px',
        borderBottom: '1px solid var(--border-color)',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FiMusic /> Music Rights Studio
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: '12px', color: 'var(--light-color)' }}>
            Manage, share, and distribute your music
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => onNavigate('music-player')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--highlight-color)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            <FiPlay /> Open Player
          </button>
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: 'var(--highlight-color)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            <FiUpload /> Upload Music
          </button>
        </div>
      </div>

      {/* Audio Player */}
      {selectedTrackForPlayer && (
        <div style={{ marginBottom: '30px' }}>
          <AudioPlayer
            track={selectedTrackForPlayer}
            showVisualizer={true}
            onEnded={() => {
              addToast('Track finished', 'info');
            }}
          />
        </div>
      )}

      {/* Upload Form */}
      {showUploadForm && (
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '30px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>Upload New Track</h3>
            <button
              onClick={() => setShowUploadForm(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}
            >
              <FiX />
            </button>
          </div>

          <form onSubmit={handleUploadMusic} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="audio/*"
                style={{ marginBottom: '10px', width: '100%' }}
              />
              {uploadFormData.file && (
                <p style={{ color: 'var(--highlight-color)', fontSize: '12px', margin: '5px 0 0' }}>
                  Selected: {uploadFormData.file.name}
                </p>
              )}
            </div>

            <input
              type="text"
              placeholder="Track Title"
              value={uploadFormData.title}
              onChange={(e) => setUploadFormData({ ...uploadFormData, title: e.target.value })}
              style={{
                padding: '10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-color)'
              }}
            />

            <input
              type="text"
              placeholder="Artist Name"
              value={uploadFormData.artist}
              onChange={(e) => setUploadFormData({ ...uploadFormData, artist: e.target.value })}
              style={{
                padding: '10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-color)'
              }}
            />

            <input
              type="text"
              placeholder="Album Name"
              value={uploadFormData.album}
              onChange={(e) => setUploadFormData({ ...uploadFormData, album: e.target.value })}
              style={{
                padding: '10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-color)'
              }}
            />

            <input
              type="text"
              placeholder="Genre"
              value={uploadFormData.genre}
              onChange={(e) => setUploadFormData({ ...uploadFormData, genre: e.target.value })}
              style={{
                padding: '10px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                color: 'var(--text-color)'
              }}
            />

            <button
              type="submit"
              disabled={uploading || !uploadFormData.file}
              style={{
                padding: '12px',
                background: uploading ? 'rgba(100,100,100,0.5)' : 'var(--highlight-color)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                cursor: uploading ? 'wait' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {uploading ? 'Uploading...' : 'Upload Track'}
            </button>
          </form>
        </div>
      )}

      {/* Music Library */}
      <div>
        <h2 style={{ marginBottom: '15px' }}>Your Music Library</h2>
        {musicLibrary.length === 0 ? (
          <div style={{
            background: 'var(--card-bg)',
            border: '2px dashed var(--border-color)',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            color: 'var(--light-color)'
          }}>
            <FiMusic size={48} style={{ opacity: 0.5, marginBottom: '15px' }} />
            <p>No music uploaded yet. Start by uploading your first track!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {musicLibrary.map((track) => (
              <div
                key={track.id}
                style={{
                  background: 'var(--card-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '15px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '15px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--card-bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--card-bg)'}
              >
                {/* Track Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ margin: '0 0 4px', color: 'var(--text-color)' }}>
                    {track.title}
                  </h4>
                  <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--light-color)' }}>
                    {track.artist} • {track.album}
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', color: 'var(--border-color)' }}>
                    {track.genre} • Uploaded {new Date(track.uploadedAt).toLocaleDateString()}
                  </p>
                </div>

                {/* Play Button */}
                <button
                  onClick={() => handlePlayTrack(track)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: playingTrackId === track.id ? 'var(--highlight-color)' : 'var(--text-color)',
                    fontSize: '20px',
                    transition: 'color 0.2s'
                  }}
                  title={playingTrackId === track.id ? 'Pause' : 'Play'}
                >
                  {playingTrackId === track.id ? <FiPause /> : <FiPlay />}
                </button>

                {/* Share Menu */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={() => setShareMenuOpen(shareMenuOpen === track.id ? null : track.id)}
                    disabled={sharingTrackId === track.id}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: sharingTrackId === track.id ? 'wait' : 'pointer',
                      color: 'var(--text-color)',
                      fontSize: '20px',
                      transition: 'color 0.2s'
                    }}
                    title="Share"
                  >
                    {sharingTrackId === track.id ? '...' : <FiShare2 />}
                  </button>

                  {shareMenuOpen === track.id && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      marginTop: '8px',
                      zIndex: 1000,
                      minWidth: '180px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                    }}>
                      <button
                        onClick={() => handleShareMusic(track)}
                        style={{
                          width: '100%',
                          padding: '10px 15px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        Copy Link
                      </button>
                      <button
                        onClick={() => handlePlatformShare(track, 'facebook')}
                        style={{
                          width: '100%',
                          padding: '10px 15px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        📘 Facebook
                      </button>
                      <button
                        onClick={() => handlePlatformShare(track, 'twitter')}
                        style={{
                          width: '100%',
                          padding: '10px 15px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        𝕏 Twitter
                      </button>
                      <button
                        onClick={() => handlePlatformShare(track, 'whatsapp')}
                        style={{
                          width: '100%',
                          padding: '10px 15px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-color)',
                          borderBottom: '1px solid var(--border-color)'
                        }}
                      >
                        💬 WhatsApp
                      </button>
                      <button
                        onClick={() => handlePlatformShare(track, 'email')}
                        style={{
                          width: '100%',
                          padding: '10px 15px',
                          background: 'none',
                          border: 'none',
                          textAlign: 'left',
                          cursor: 'pointer',
                          color: 'var(--text-color)'
                        }}
                      >
                        📧 Email
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete Button */}
                <button
                  onClick={() => handleDeleteTrack(track.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#ef4444',
                    fontSize: '20px'
                  }}
                  title="Delete"
                >
                  <FiTrash2 />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Demo tracks for development
const DEMO_TRACKS = [
  {
    id: 'demo_1',
    title: 'Digital Dreams',
    artist: 'Alex Raven',
    album: 'Future Sounds',
    genre: 'Electronic',
    mediaUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    fileName: 'digital-dreams.mp3',
    uploadedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    duration: '3:45'
  },
  {
    id: 'demo_2',
    title: 'Midnight Melodies',
    artist: 'Luna Echo',
    album: 'Night Tales',
    genre: 'Ambient',
    mediaUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    fileName: 'midnight-melodies.mp3',
    uploadedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    duration: '4:12'
  }
];

export default MusicRightsStudioPage;
