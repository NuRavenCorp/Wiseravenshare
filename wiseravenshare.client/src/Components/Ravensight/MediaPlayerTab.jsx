import React, { useState, useEffect, useRef } from 'react';
import { FiMusic, FiPlay, FiPause, FiX, FiPlus, FiLoader, FiSearch, FiVolume2, FiImage, FiMic } from 'react-icons/fi';
import { apiService } from '../../Services/api';
import { useNotification } from '../../Contexts/NotificationContext';

/**
 * MediaPlayerTab - Music track selector, playback, and caption editing
 * Features:
 * - Load and browse music library
 * - Play tracks with preview controls
 * - Add caption text overlays to photos
 * - Record narration for videos
 */
const MediaPlayerTab = ({ 
  selectedMusicTrackId, 
  onSelectTrack, 
  onCaptionChange, 
  onNarrationRecorded,
  captionText = '',
  selectedMediaFile = null 
}) => {
  const { addToast } = useNotification();
  const audioRef = useRef(null);
  const narrationRecorderRef = useRef(null);
  const narrationChunksRef = useRef([]);

  // State
  const [musicLibrary, setMusicLibrary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);

  // Caption state
  const [captionVisible, setCaptionVisible] = useState(true);
  const [captionSize, setCaptionSize] = useState(16);
  const [captionColor, setCaptionColor] = useState('#ffffff');
  const [captionBgColor, setCaptionBgColor] = useState('#000000');

  // Narration state
  const [isRecordingNarration, setIsRecordingNarration] = useState(false);
  const [narrationURL, setNarrationURL] = useState(null);
  const [narrationDuration, setNarrationDuration] = useState(0);

  // Load music library on mount
  useEffect(() => {
    loadMusicLibrary();
  }, []);

  const loadMusicLibrary = async () => {
    try {
      setLoading(true);
      const response = await apiService.get('/api/ravensight/media/music');
      const tracks = Array.isArray(response.data) ? response.data : response.data?.tracks || [];
      setMusicLibrary(tracks);
    } catch (error) {
      console.error('Failed to load music library:', error);
      addToast('Failed to load music library', 'error');
      setMusicLibrary([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter tracks based on search
  const filteredTracks = musicLibrary.filter(track => {
    const query = searchQuery.toLowerCase();
    const title = String(track.title || '').toLowerCase();
    const artist = String(track.artist || '').toLowerCase();
    const album = String(track.album || '').toLowerCase();
    return title.includes(query) || artist.includes(query) || album.includes(query);
  });

  // Handle track selection
  const handleSelectTrack = (track) => {
    onSelectTrack(track);
    setPlayingTrackId(track.id);
  };

  // Handle play/pause
  const handlePlayTrack = (e, track) => {
    e.stopPropagation();
    if (playingTrackId === track.id) {
      if (audioRef.current?.paused) {
        audioRef.current?.play();
      } else {
        audioRef.current?.pause();
      }
    } else {
      setPlayingTrackId(track.id);
      if (audioRef.current) {
        audioRef.current.src = track.mediaUrl || track.url || '';
        audioRef.current.play();
      }
    }
  };

  // Handle narration start
  const handleStartNarration = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      narrationRecorderRef.current = new MediaRecorder(stream);
      narrationChunksRef.current = [];

      narrationRecorderRef.current.ondataavailable = (e) => {
        narrationChunksRef.current.push(e.data);
      };

      narrationRecorderRef.current.onstop = () => {
        const blob = new Blob(narrationChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setNarrationURL(url);
        onNarrationRecorded?.(blob, url);

        // Calculate duration
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          setNarrationDuration(Math.round(audio.duration));
        };

        addToast('Narration recorded successfully', 'success');
        stream.getTracks().forEach(track => track.stop());
      };

      narrationRecorderRef.current.start();
      setIsRecordingNarration(true);
      addToast('Recording narration...', 'info');
    } catch (error) {
      console.error('Failed to start narration recording:', error);
      addToast('Microphone access denied', 'error');
    }
  };

  const handleStopNarration = () => {
    if (narrationRecorderRef.current) {
      narrationRecorderRef.current.stop();
      setIsRecordingNarration(false);
    }
  };

  // Format time
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="space-y-6 p-6 bg-slate-950 rounded-lg">
      {/* Music Library Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <FiMusic className="text-blue-400" />
            Music Library
          </h3>
          <button
            onClick={loadMusicLibrary}
            disabled={loading}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1 disabled:opacity-50"
          >
            {loading ? <FiLoader className="animate-spin" /> : <FiPlus />}
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <FiSearch className="absolute left-3 top-3 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, artist, or album..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Tracks List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8">
              <FiLoader className="animate-spin mx-auto text-blue-400 mb-2" />
              <p className="text-gray-400">Loading music library...</p>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No tracks found. {musicLibrary.length === 0 && 'Upload tracks in Music Studio first.'}
            </div>
          ) : (
            filteredTracks.map((track) => (
              <div
                key={track.id}
                onClick={() => handleSelectTrack(track)}
                className={`p-3 rounded cursor-pointer transition ${
                  selectedMusicTrackId === track.id
                    ? 'bg-blue-600 border border-blue-500'
                    : 'bg-slate-800 border border-slate-700 hover:border-blue-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-white font-medium truncate">{track.title || 'Untitled'}</p>
                    <p className="text-sm text-gray-400 truncate">
                      {track.artist || 'Unknown Artist'} • {track.album || 'Unknown Album'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handlePlayTrack(e, track)}
                    className="ml-3 p-2 bg-slate-700 hover:bg-slate-600 rounded text-blue-400"
                  >
                    {playingTrackId === track.id && !audioRef.current?.paused ? (
                      <FiPause size={20} />
                    ) : (
                      <FiPlay size={20} />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Audio Player */}
        <audio
          ref={audioRef}
          onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
          onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
          onEnded={() => setPlayingTrackId(null)}
          className="hidden"
        />

        {playingTrackId && (
          <div className="bg-slate-800 p-4 rounded border border-slate-700">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 0}
                  value={currentTime}
                  onChange={(e) => {
                    if (audioRef.current) {
                      audioRef.current.currentTime = parseFloat(e.target.value);
                    }
                  }}
                  className="flex-1 h-1 bg-slate-700 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-400">{formatTime(duration)}</span>
              </div>

              <div className="flex items-center gap-2">
                <FiVolume2 className="text-gray-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setVolume(vol);
                    if (audioRef.current) {
                      audioRef.current.volume = vol;
                    }
                  }}
                  className="flex-1 h-1 bg-slate-700 rounded cursor-pointer"
                />
                <span className="text-xs text-gray-400 w-8">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Caption Editor Section */}
      {selectedMediaFile?.type?.startsWith('image/') && (
        <div className="space-y-4 border-t border-slate-700 pt-6">
          <div className="flex items-center gap-2">
            <FiImage className="text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Photo Caption</h3>
          </div>

          <textarea
            value={captionText}
            onChange={(e) => onCaptionChange?.(e.target.value)}
            placeholder="Add text caption to your photo..."
            rows={3}
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none resize-none"
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-300 mb-2">Font Size</label>
              <input
                type="range"
                min="12"
                max="48"
                value={captionSize}
                onChange={(e) => setCaptionSize(parseInt(e.target.value))}
                className="w-full"
              />
              <span className="text-xs text-gray-400">{captionSize}px</span>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">Text Color</label>
              <input
                type="color"
                value={captionColor}
                onChange={(e) => setCaptionColor(e.target.value)}
                className="w-full h-10 rounded cursor-pointer"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-300 mb-2">
              <input
                type="checkbox"
                checked={captionVisible}
                onChange={(e) => setCaptionVisible(e.target.checked)}
                className="rounded"
              />
              Preview Caption
            </label>
            {captionVisible && (
              <div
                className="w-full p-4 rounded bg-black border border-slate-700 text-center"
                style={{
                  fontSize: `${captionSize}px`,
                  color: captionColor,
                }}
              >
                {captionText || 'Your caption will appear here'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Narration Section */}
      {selectedMediaFile?.type?.startsWith('video/') && (
        <div className="space-y-4 border-t border-slate-700 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FiMic className="text-green-400" />
              <h3 className="text-lg font-semibold text-white">Narration</h3>
            </div>
            {isRecordingNarration && (
              <div className="flex items-center gap-2 text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm">Recording...</span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-400">
            Record narration to accompany your video. Perfect for adding voiceovers or commentary.
          </p>

          <div className="flex gap-2">
            {!isRecordingNarration ? (
              <button
                onClick={handleStartNarration}
                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium flex items-center justify-center gap-2 transition"
              >
                <FiMic size={18} />
                Start Recording
              </button>
            ) : (
              <button
                onClick={handleStopNarration}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-medium flex items-center justify-center gap-2 transition"
              >
                <FiX size={18} />
                Stop Recording
              </button>
            )}
          </div>

          {narrationURL && (
            <div className="bg-slate-800 p-4 rounded border border-slate-700">
              <p className="text-sm text-gray-300 mb-2">Narration recorded ({narrationDuration}s)</p>
              <audio
                src={narrationURL}
                controls
                className="w-full"
              />
              <button
                onClick={() => {
                  setNarrationURL(null);
                  setNarrationDuration(0);
                  narrationChunksRef.current = [];
                }}
                className="mt-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 text-gray-300 rounded text-sm transition"
              >
                Clear Narration
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaPlayerTab;
