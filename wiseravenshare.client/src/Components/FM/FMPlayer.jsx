import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiPlay, FiPause, FiSkipForward, FiSkipBack, FiVolume2, FiVolumeX, FiHeart, FiBookmark } from 'react-icons/fi';

const FMPlayer = ({
  station,
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onLike,
  onBookmark
}) => {
  const audioRef = useRef(null);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const sourceUrl = useMemo(() => String(station?.streamUrl || '').trim(), [station?.streamUrl]);

  useEffect(() => {
    if (!sourceUrl) return undefined;

    const audio = new Audio(sourceUrl);
    audio.preload = 'none';
    audio.volume = (isMuted ? 0 : volume) / 100;
    audioRef.current = audio;

    const onError = () => setErrorMessage('Unable to start this stream right now.');
    audio.addEventListener('error', onError);

    if (isPlaying) {
      audio.play().catch(() => setErrorMessage('Playback was blocked by browser policy.'));
    }

    return () => {
      audio.pause();
      audio.removeEventListener('error', onError);
      audioRef.current = null;
    };
  }, [sourceUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.play().catch(() => setErrorMessage('Playback was blocked by browser policy.'));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = (isMuted ? 0 : volume) / 100;
  }, [isMuted, volume]);

  return (
    <div className="fm-player">
      <div className="fm-player-left">
        <div className="fm-player-logo">
          {station?.logoUrl ? <img src={station.logoUrl} alt={station?.name || 'Station'} /> : <span>📻</span>}
        </div>
        <div className="fm-player-meta">
          <strong>{station?.name || 'FM Station'}</strong>
          <small>{station?.genre || 'General'} • {station?.frequency || ''}</small>
          {errorMessage && <small className="fm-error">{errorMessage}</small>}
        </div>
      </div>

      <div className="fm-player-controls">
        <button type="button" className="fm-icon-btn" onClick={onPrevious} aria-label="Previous station"><FiSkipBack /></button>
        <button type="button" className="fm-icon-btn play" onClick={() => (isPlaying ? onPause?.() : onPlay?.())} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? <FiPause /> : <FiPlay />}
        </button>
        <button type="button" className="fm-icon-btn" onClick={onNext} aria-label="Next station"><FiSkipForward /></button>
      </div>

      <div className="fm-player-actions">
        <button type="button" className={`fm-icon-btn ${station?.isLiked ? 'active' : ''}`} onClick={() => station?.id && onLike?.(station.id)} aria-label="Like station">
          <FiHeart />
        </button>
        <button type="button" className={`fm-icon-btn ${station?.isBookmarked ? 'active' : ''}`} onClick={() => station?.id && onBookmark?.(station.id)} aria-label="Bookmark station">
          <FiBookmark />
        </button>
      </div>

      <div className="fm-player-volume">
        <button type="button" className="fm-icon-btn" onClick={() => setIsMuted((prev) => !prev)} aria-label="Mute toggle">
          {isMuted || volume === 0 ? <FiVolumeX /> : <FiVolume2 />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(event) => {
            const next = Number(event.target.value);
            setVolume(next);
            if (next > 0 && isMuted) setIsMuted(false);
          }}
        />
      </div>
    </div>
  );
};

export default FMPlayer;
