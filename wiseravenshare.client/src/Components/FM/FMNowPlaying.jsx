import React, { useEffect, useState } from 'react';
import { FiMusic, FiMic } from 'react-icons/fi';
import { fmService } from '../../Services/fmService';

const FMNowPlaying = ({ station, isPlaying, onStop }) => {
  const [nowPlaying, setNowPlaying] = useState(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;

    const pollNowPlaying = async () => {
      if (!station?.id) return;
      try {
        const payload = await fmService.getNowPlaying(station.id);
        if (mounted) {
          setNowPlaying(payload);
        }
      } catch {
        if (mounted) {
          setNowPlaying(null);
        }
      }
    };

    pollNowPlaying();
    pollTimer = window.setInterval(pollNowPlaying, 15000);
    return () => {
      mounted = false;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [station?.id]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => setProgress((value) => (value + 1) % 100), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  return (
    <section className="fm-now-playing">
      <div className="fm-now-left">
        <div className="fm-now-logo">
          {station?.logoUrl ? <img src={station.logoUrl} alt={station?.name || 'Station'} /> : <span>📻</span>}
        </div>
        <div className="fm-now-meta">
          <div className="fm-now-title">
            <FiMusic />
            <strong>{station?.name || 'Station'}</strong>
          </div>
          <div className="fm-now-sub">{nowPlaying?.songTitle || 'Live Broadcast'}</div>
          <div className="fm-now-sub"><FiMic /> {nowPlaying?.artistName || 'Unknown Artist'}</div>
          <div className="fm-now-progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="fm-now-right">
        <strong>{Number(station?.listeners || 0)}</strong>
        <small>listeners</small>
        {isPlaying && <span className="fm-live-dot">LIVE</span>}
        <button type="button" className="fm-btn" onClick={onStop}>Stop</button>
      </div>
    </section>
  );
};

export default FMNowPlaying;
