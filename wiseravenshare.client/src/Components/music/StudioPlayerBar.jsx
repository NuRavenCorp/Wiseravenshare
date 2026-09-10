import React, { useState, useMemo } from 'react';
import {
  FiPlay, FiPause, FiSquare, FiSkipBack, FiSkipForward,
  FiRepeat, FiShuffle, FiVolume2, FiVolumeX,
  FiMusic, FiSearch, FiX, FiUpload, FiList,
  FiChevronDown, FiChevronUp,
} from 'react-icons/fi';

const fmt = (s) => {
  const v = Number(s);
  if (!Number.isFinite(v) || v <= 0) return '0:00';
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const sec = Math.floor(v % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

const WaveformBars = ({ data }) => {
  const bars = useMemo(
    () => Array.from(data || []).filter((_, i) => i % 2 === 0).slice(0, 48),
    [data],
  );
  if (!bars.length) return null;
  return (
    <div className="spl-waveform" aria-hidden="true">
      {bars.map((v, i) => (
        <div
          key={i}
          className="spl-waveform-bar"
          style={{ height: Math.max(3, (v / 255) * 56) }}
        />
      ))}
    </div>
  );
};

const StudioPlayerBar = ({
  // playback state
  currentTrack,
  library = [],
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  repeat,
  shuffle,
  vizData,
  // transport handlers
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onRepeatToggle,
  onShuffleToggle,
  onSelectTrack,
  // library search
  searchQuery,
  setSearchQuery,
  // upload props
  uploadFile,
  uploadTitle,
  uploadArtist,
  uploadAlbum,
  uploadGenre,
  isUploading,
  isMarketplaceUnlocked,
  uploadInputRef,
  onUploadFileChange,
  onUploadTitleChange,
  onUploadArtistChange,
  onUploadAlbumChange,
  onUploadGenreChange,
  onUploadSubmit,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlaylist, setShowPlaylist] = useState(true);

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const volPct = isMuted ? 0 : Math.round((volume || 0) * 100);
  const repeatBadge = repeat === 'one' ? '1' : repeat === 'all' ? '∞' : null;

  const filtered = useMemo(() => (library || []).filter((t) =>
    !searchQuery
    || (t.title || '').toLowerCase().includes((searchQuery || '').toLowerCase())
    || (t.artist || '').toLowerCase().includes((searchQuery || '').toLowerCase()),
  ), [library, searchQuery]);

  return (
    <div className={`spl-wrap${isExpanded ? ' expanded' : ''}`}>

      {/* ── Main bar ── */}
      <div className="spl-bar">

        {/* Identity */}
        <div className="spl-identity">
          <div className="spl-album-art">
            <FiMusic />
            {isPlaying && <span className="spl-live-dot" />}
          </div>
          <div className="spl-meta">
            <strong className="spl-title">
              {currentTrack?.title || 'No track selected'}
            </strong>
            <small className="spl-artist">
              {currentTrack?.artist
                || (library.length > 0 ? `${library.length} track${library.length !== 1 ? 's' : ''} in library` : 'Upload a track to get started')}
            </small>
            <small className="spl-time">
              {fmt(currentTime)} / {duration > 0 ? fmt(duration) : '—'}
            </small>
          </div>
        </div>

        {/* Controls */}
        <div className="spl-controls">
          <button
            type="button"
            className={`spl-btn sm${shuffle ? ' active' : ''}`}
            onClick={onShuffleToggle}
            title="Shuffle"
          >
            <FiShuffle />
          </button>

          <button type="button" className="spl-btn" onClick={onPrev} title="Previous">
            <FiSkipBack />
          </button>

          <button
            type="button"
            className="spl-btn play"
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <FiPause /> : <FiPlay />}
          </button>

          <button type="button" className="spl-btn" onClick={onStop} title="Stop">
            <FiSquare />
          </button>

          <button type="button" className="spl-btn" onClick={onNext} title="Next">
            <FiSkipForward />
          </button>

          <button
            type="button"
            className={`spl-btn sm${repeat !== 'off' ? ' active' : ''}`}
            onClick={onRepeatToggle}
            title={`Repeat: ${repeat}`}
          >
            <FiRepeat />
            {repeatBadge && <span className="spl-repeat-badge">{repeatBadge}</span>}
          </button>
        </div>

        {/* Volume + expand */}
        <div className="spl-right">
          <button type="button" className="spl-btn sm" onClick={onMuteToggle} title="Mute toggle">
            {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : (volume || 0)}
            onChange={onVolumeChange}
            className="spl-vol-slider"
            aria-label="Volume"
          />
          <span className="spl-vol-pct">{volPct}%</span>
          <button
            type="button"
            className="spl-btn sm spl-expand-btn"
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? 'Collapse player' : 'Expand player'}
          >
            {isExpanded ? <FiChevronDown /> : <FiChevronUp />}
          </button>
        </div>
      </div>

      {/* ── Seek bar ── */}
      <div className="spl-seek-row">
        <span className="spl-time-label">{fmt(currentTime)}</span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          onChange={onSeek}
          className="spl-seek-slider"
          disabled={!currentTrack}
          aria-label="Seek"
        />
        <span className="spl-time-label">{fmt(duration)}</span>
      </div>

      {/* ── Expanded panel ── */}
      {isExpanded && (
        <div className="spl-expanded">

          {/* Waveform */}
          <div className="spl-expanded-wave">
            {isPlaying
              ? <WaveformBars data={vizData} />
              : <div className="spl-wave-idle">▶ Press play to see the waveform</div>}
          </div>

          {/* Tab switcher */}
          <div className="spl-tabs">
            <button
              type="button"
              className={`spl-tab${showPlaylist ? ' active' : ''}`}
              onClick={() => setShowPlaylist(true)}
            >
              <FiList /> Playlist ({library.length})
            </button>
            <button
              type="button"
              className={`spl-tab${!showPlaylist ? ' active' : ''}`}
              onClick={() => setShowPlaylist(false)}
            >
              <FiUpload /> Upload
            </button>
            {showPlaylist && (
              <div className="spl-playlist-search">
                <FiSearch />
                <input
                  type="text"
                  placeholder="Search tracks…"
                  value={searchQuery || ''}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')}>
                    <FiX />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Playlist */}
          {showPlaylist && (
            <div className="spl-playlist">
              {filtered.length === 0 ? (
                <div className="spl-playlist-empty">
                  <FiMusic size={28} />
                  <p>No tracks in your library yet</p>
                  <button type="button" onClick={() => setShowPlaylist(false)}>
                    Upload a track
                  </button>
                </div>
              ) : (
                <div className="spl-track-list">
                  {filtered.map((t) => {
                    const realIdx = library.indexOf(t);
                    const active = currentTrack?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        className={`spl-track-item${active ? ' active' : ''}`}
                        onClick={() => onSelectTrack(t, realIdx, true)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && onSelectTrack(t, realIdx, true)}
                      >
                        <div className="spl-track-num">
                          {active && isPlaying
                            ? <span className="spl-playing-dot" />
                            : <span>{realIdx + 1}</span>}
                        </div>
                        <div className="spl-track-meta">
                          <span className="spl-track-title">{t.title || 'Untitled'}</span>
                          <span className="spl-track-artist">{t.artist || 'Unknown'}</span>
                          {t.previewOnly && <span className="spl-track-badge">Preview</span>}
                        </div>
                        <span className="spl-track-dur">{t.duration || '—'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Upload */}
          {!showPlaylist && (
            <div className="spl-upload">
              <div className={`spl-upload-banner${isMarketplaceUnlocked ? ' active' : ''}`}>
                {isMarketplaceUnlocked
                  ? '✓ Uploads save to your marketplace library.'
                  : 'Free mode — uploads play locally in this session only.'}
              </div>
              <form onSubmit={onUploadSubmit} className="spl-upload-form">
                <label className="spl-upload-file-btn">
                  <FiUpload />
                  {uploadFile ? uploadFile.name : 'Choose file  ·  mp3  mp4  flac  wav'}
                  <input
                    type="file"
                    ref={uploadInputRef}
                    accept="audio/*,.flac,.wav,.mp3,.mp4,audio/flac,audio/wav,audio/mpeg,video/mp4"
                    onChange={onUploadFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
                <div className="spl-upload-grid">
                  <input type="text" placeholder="Title"  value={uploadTitle}  onChange={onUploadTitleChange}  />
                  <input type="text" placeholder="Artist" value={uploadArtist} onChange={onUploadArtistChange} />
                  <input type="text" placeholder="Album"  value={uploadAlbum}  onChange={onUploadAlbumChange}  />
                  <input type="text" placeholder="Genre"  value={uploadGenre}  onChange={onUploadGenreChange}  />
                </div>
                <button
                  type="submit"
                  className="spl-upload-btn"
                  disabled={isUploading || !uploadFile}
                >
                  {isUploading
                    ? 'Uploading…'
                    : isMarketplaceUnlocked
                      ? 'Save to Marketplace'
                      : 'Preview Locally'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StudioPlayerBar;
