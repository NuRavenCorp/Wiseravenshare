import React, { useEffect, useRef, useState } from 'react';
import { FiPlay, FiRadio, FiWifi, FiX } from 'react-icons/fi';
import { GENRE_PRESETS } from '../../Services/fmService';

// ─── How the scanner works ────────────────────────────────────────────────────
// 1. For each active genre preset, fetch a batch of stations from Radio Browser.
// 2. Each discovered station is quickly "probe-tested" — an AbortController-timed
//    HEAD-like fetch is attempted against the stream URL.
// 3. Stations that respond within 4 seconds are added to the LIVE list immediately.
// 4. The dial needle and frequency display animate to give a visual tuning feel.
// 5. The user can "Tune In" to any live station while the scan is still running.

const PROBE_TIMEOUT_MS = 3000;

// Try to confirm a stream is reachable by fetching a tiny chunk with an abort timeout.
// Accept 200, 206 (partial content), 416 (range not satisfiable), or 302 (redirect).
const probeStream = async (url) => {
  if (!url) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'WiseRavenFM/1.0' },
      mode: 'cors',
      cache: 'no-cache'
    });
    clearTimeout(timer);
    // Accept 200, 206, 301/302 (redirects), 400+ for streams that reject HEAD
    return res.ok || res.status === 206 || res.status === 416 || (res.status >= 300 && res.status < 400);
  } catch {
    clearTimeout(timer);
    // Try GET if HEAD fails (some streams don't support HEAD)
    try {
      const getCtrl = new AbortController();
      const getTimer = setTimeout(() => getCtrl.abort(), PROBE_TIMEOUT_MS / 2);
      const res = await fetch(url, {
        method: 'GET',
        signal: getCtrl.signal,
        headers: { Range: 'bytes=0-1023', 'User-Agent': 'WiseRavenFM/1.0' },
        mode: 'cors',
        cache: 'no-cache'
      });
      clearTimeout(getTimer);
      return res.ok || res.status === 206 || res.status === 416;
    } catch {
      return false;
    }
  }
};

// Fake FM frequency for visual flair.
const randomFreq = () => (88 + Math.random() * (108 - 88)).toFixed(1);

// ─── Component ────────────────────────────────────────────────────────────────
const FMScanner = ({ onTuneIn, onClose }) => {
  const [isScanning, setIsScanning]   = useState(false);
  const [liveStations, setLive]       = useState([]);
  const [tested, setTested]           = useState(0);
  const [found, setFound]             = useState(0);
  const [currentName, setCurrentName] = useState('');
  const [dialFreq, setDialFreq]       = useState('88.0');
  const [dialPct, setDialPct]         = useState(0);
  const abortRef  = useRef(false);
  const dialTimer = useRef(null);

  // Clean up on unmount.
  useEffect(() => () => {
    abortRef.current = true;
    if (dialTimer.current) clearInterval(dialTimer.current);
  }, []);

  const stopScan = () => {
    abortRef.current = true;
    setIsScanning(false);
    if (dialTimer.current) clearInterval(dialTimer.current);
  };

  const startScan = async () => {
    abortRef.current = false;
    setIsScanning(true);
    setLive([]);
    setTested(0);
    setFound(0);
    setCurrentName('Scanning…');
    setDialPct(0);

    // Animate dial while scanning.
    let dialTick = 0;
    dialTimer.current = setInterval(() => {
      dialTick = (dialTick + 0.8) % 100;
      setDialPct(dialTick);
      const freq = (88 + (dialTick / 100) * 20).toFixed(1);
      setDialFreq(freq);
    }, 80);

    const activePresets = GENRE_PRESETS.filter((p) => p.id !== 'all');
    const seen = new Set();

    for (const preset of activePresets) {
      if (abortRef.current) break;

      for (const tag of preset.tags) {
        if (abortRef.current) break;

        try {
          // Use our backend proxy endpoints so User-Agent is set correctly.
          const params = new URLSearchParams({ tag, limit: 20 });
          const res = await fetch(`/api/fmtuner/rb/stations?${params}`);
          if (!res.ok) {
            console.warn(`Station query failed for tag "${tag}": ${res.status}`);
            continue;
          }
          const raw = await res.json();
          if (!Array.isArray(raw) || raw.length === 0) {
            console.warn(`No stations returned for tag "${tag}"`);
            continue;
          }

          for (const rb of raw) {
            if (abortRef.current) break;

            const streamUrl = String(rb.url_resolved || rb.url || '').trim();
            const uuid = String(rb.stationuuid || '').trim();
            if (!streamUrl || seen.has(uuid || streamUrl)) continue;
            seen.add(uuid || streamUrl);

            const stationName = String(rb.name || 'Radio Station').trim();
            setCurrentName(stationName);
            setTested((n) => n + 1);

            // Only probe HTTPS streams (http:// would be mixed-content from the probe).
            const probeUrl = streamUrl.startsWith('https://') ? streamUrl
              : streamUrl.startsWith('http://') ? `/api/fmtuner/stream-proxy?url=${encodeURIComponent(streamUrl)}`
              : null;

            if (!probeUrl) continue;

            const alive = await probeStream(probeUrl);
            if (!alive || abortRef.current) continue;

            const station = {
              id: uuid || `scan-${Math.random().toString(16).slice(2)}`,
              name: stationName,
              genre: String(rb.tags || preset.label).split(',')[0].trim() || preset.label,
              country: String(rb.country || '').trim(),
              bitrate: Number(rb.bitrate || 128),
              codec: String(rb.codec || 'MP3'),
              streamUrl: probeUrl,
              logoUrl: String(rb.favicon || '').trim(),
              listeners: Number(rb.clickcount || 0),
              frequency: randomFreq(),
              source: 'radio-browser',
              _scanGenre: preset.label,
              isLiked: false,
              isBookmarked: false
            };

            setLive((prev) => {
              if (prev.some((s) => s.id === station.id)) return prev;
              return [station, ...prev];
            });
            setFound((n) => n + 1);
          }
        } catch (err) {
          // Skip this tag; continue to next.
          console.warn(`Error scanning tag "${tag}":`, err);
        }
      }
    }

    if (dialTimer.current) clearInterval(dialTimer.current);
    setIsScanning(false);
    setDialPct(100);
    setCurrentName(found > 0 ? `${found} live stations found` : 'No live stations found');
  };

  return (
    <div className="fms-root">
      {/* ── Header ── */}
      <div className="fms-header">
        <div>
          <h4 className="fms-title"><FiRadio /> Station Scanner</h4>
          <p className="fms-subtitle">
            {isScanning
              ? `Testing: ${currentName}`
              : liveStations.length > 0
                ? `${liveStations.length} live stations ready`
                : 'Click Scan to find live stations near you'}
          </p>
        </div>
        <div className="fms-header-actions">
          {!isScanning
            ? <button type="button" className="fms-scan-btn" onClick={startScan}><FiRadio /> Scan</button>
            : <button type="button" className="fms-stop-btn" onClick={stopScan}><FiX /> Stop</button>}
          {onClose && (
            <button type="button" className="fm-icon-btn" onClick={onClose} aria-label="Close scanner"><FiX /></button>
          )}
        </div>
      </div>

      {/* ── Dial ── */}
      <div className="fms-dial-wrap">
        <div className="fms-dial-scale">
          {['88', '92', '96', '100', '104', '108'].map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <div className="fms-dial-track">
          <div className="fms-dial-fill" style={{ width: `${dialPct}%` }} />
          <div className="fms-dial-needle" style={{ left: `${dialPct}%` }} />
        </div>
        <div className="fms-dial-freq">
          {isScanning ? `${dialFreq} FM` : liveStations.length > 0 ? 'Scan complete' : 'FM 88.0 – 108.0'}
        </div>
      </div>

      {/* ── Stats bar ── */}
      {(isScanning || tested > 0) && (
        <div className="fms-stats">
          <span>Tested: <strong>{tested}</strong></span>
          <span>Live: <strong className="fms-live-count">{found}</strong></span>
          {isScanning && <span className="fms-scanning-dot">● Scanning</span>}
        </div>
      )}

      {/* ── Live station list ── */}
      {liveStations.length > 0 && (
        <div className="fms-station-list">
          {liveStations.map((station) => (
            <div key={station.id} className="fms-station-row">
              <div className="fms-station-logo">
                {station.logoUrl
                  ? <img src={station.logoUrl} alt={station.name} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  : <span>📻</span>}
              </div>
              <div className="fms-station-info">
                <strong>{station.name}</strong>
                <small>
                  <span className="fms-genre-badge">{station._scanGenre}</span>
                  {station.country && ` • ${station.country}`}
                  {' • '}{station.bitrate} kbps
                </small>
                <small className="fms-freq">{station.frequency} FM</small>
              </div>
              <button
                type="button"
                className="fms-tune-btn"
                onClick={() => onTuneIn?.(station)}
                aria-label={`Tune in to ${station.name}`}
              >
                <FiPlay /> Tune In
              </button>
            </div>
          ))}
        </div>
      )}

      {!isScanning && tested > 0 && liveStations.length === 0 && (
        <div className="fms-empty">
          <FiWifi size={28} />
          <p>No live streams responded within {PROBE_TIMEOUT_MS / 1000}s. Try scanning again.</p>
        </div>
      )}
    </div>
  );
};

export default FMScanner;
