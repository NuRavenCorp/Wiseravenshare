import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../Contexts/AuthContext';
import KaraokeScorer from '../Components/Karaoke/KaraokeScorer';
import { getAuthToken } from '../Services/authStorage.js';
import './KaraokePage.css';

/* ─── pitch detection ──────────────────────────────────────────────────────── */
class PitchDetector {
    constructor(bufferSize = 2048) {
        this.bufferSize = bufferSize;
    }

    detect(buffer, sampleRate) {
        // YIN algorithm (simplified) for real-time pitch detection
        const tau_max = Math.floor(sampleRate / 80);
        const tau_min = Math.floor(sampleRate / 1200);
        const diff = new Float32Array(tau_max);

        for (let tau = 0; tau < tau_max; tau++) {
            let sum = 0;
            for (let i = 0; i < this.bufferSize - tau; i++) {
                const d = buffer[i] - buffer[i + tau];
                sum += d * d;
            }
            diff[tau] = sum;
        }

        // cumulative mean normalised difference
        let cmndf = new Float32Array(tau_max);
        cmndf[0] = 1;
        let runSum = 0;
        for (let tau = 1; tau < tau_max; tau++) {
            runSum += diff[tau];
            cmndf[tau] = diff[tau] * tau / runSum;
        }

        // find first minimum below threshold
        const threshold = 0.15;
        for (let tau = tau_min; tau < tau_max; tau++) {
            if (cmndf[tau] < threshold) {
                while (tau + 1 < tau_max && cmndf[tau + 1] < cmndf[tau]) tau++;
                return sampleRate / tau;
            }
        }
        return null;
    }

    hzToNote(hz) {
        if (!hz || hz <= 0) return null;
        const semitones = Math.round(12 * Math.log2(hz / 440) + 69);
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const note = noteNames[semitones % 12];
        const octave = Math.floor(semitones / 12) - 1;
        return `${note}${octave}`;
    }
}

const pitchDetector = new PitchDetector();

/* ─── sample public-domain catalogue ──────────────────────────────────────── */
const DEMO_SONGS = [
    { id: 'pd-001', title: 'Ode to Joy', artist: 'Beethoven (Public Domain)', duration: '3:30', source: 'musopen' },
    { id: 'pd-002', title: 'Air on the G String', artist: 'Bach (Public Domain)', duration: '4:53', source: 'musopen' },
    { id: 'pd-003', title: 'Spring (The Four Seasons)', artist: 'Vivaldi (Public Domain)', duration: '3:20', source: 'musopen' },
    { id: 'us-001', title: 'UltraStar Demo Song', artist: 'UltraStar Community (CC)', duration: '3:00', source: 'ultrastar-community' },
];

const DEFAULT_REFERENCE_LYRICS =
    'Tonight we sing together and keep the rhythm strong while every word lands on the beat.';

function buildEstimatedWordTimings(lyrics, wordsPerSecond = 2.8) {
    const words = lyrics.trim().split(/\s+/).filter(Boolean);
    const secPerWord = 1 / Math.max(wordsPerSecond, 0.5);
    return words.map((word, index) => {
        const start = index * secPerWord;
        return { word, start, end: start + secPerWord };
    });
}

/* ─── karaoke page ─────────────────────────────────────────────────────────── */
export default function KaraokePage() {
    const { user } = useAuth();

    // tab: catalogue | upload | sing
    const [tab, setTab] = useState('catalogue');
    const [catalogue, setCatalogue] = useState(DEMO_SONGS);
    const [catalogueLoading, setCatalogueLoading] = useState(true);
    const [selectedSong, setSelectedSong] = useState(null);
    const [backingUrl, setBackingUrl] = useState(null);
    const [backingStatus, setBackingStatus] = useState('idle'); // idle|generating|ready|error
    const [backingMessage, setBackingMessage] = useState('');
    const [backingJobId, setBackingJobId] = useState('');
    const [purchasingSongId, setPurchasingSongId] = useState('');

    // upload
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const uploadRef = useRef(null);
    const [workspaceInfo, setWorkspaceInfo] = useState(null);
    const [libraryTracks, setLibraryTracks] = useState([]);

    // singing / mic
    const [singing, setSinging] = useState(false);
    const [score, setScore] = useState(0);
    const [currentPitch, setCurrentPitch] = useState(null);
    const [micError, setMicError] = useState('');
    const audioCtxRef = useRef(null);
    const analyserRef = useRef(null);
    const micStreamRef = useRef(null);
    const rafRef = useRef(null);

    // service health
    const [health, setHealth] = useState(null);
    const [isOfflineMode, setIsOfflineMode] = useState(false);
    const [showKaraokeScorer, setShowKaraokeScorer] = useState(false);
    const [referenceLyrics, setReferenceLyrics] = useState(DEFAULT_REFERENCE_LYRICS);
    const jobPollTimeoutRef = useRef(null);
    const karaokeServiceReachableRef = useRef(false);

    useEffect(() => {
        const token = getAuthToken();
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

        fetch('/api/karaoke/catalogue', { headers: authHeaders })
            .then((r) => {
                karaokeServiceReachableRef.current = r.ok;
                return r.ok ? r.json() : Promise.resolve(DEMO_SONGS);
            })
            .then(data => setCatalogue(Array.isArray(data) && data.length ? data : DEMO_SONGS))
            .catch(() => setCatalogue(DEMO_SONGS))
            .finally(() => setCatalogueLoading(false));

        fetch('/api/karaoke/health', { headers: authHeaders })
            .then(async (response) => {
                if (!response.ok) {
                    setHealth(response.status >= 500 ? 'degraded' : 'offline');
                    return;
                }

                const contentType = String(response.headers.get('content-type') || '').toLowerCase();
                if (!contentType.includes('application/json')) {
                    setHealth('ok');
                    return;
                }

                const payload = await response.json().catch(() => null);
                setHealth(payload?.upstream ? String(payload.upstream).toLowerCase() : 'ok');
            })
            .catch(() => {
            const h = karaokeServiceReachableRef.current ? 'degraded' : 'offline';
            setHealth(h);
            if (h === 'offline') setIsOfflineMode(true);
        });

        if (!token) return;

        fetch('/api/karaoke/workspace', { headers: authHeaders })
            .then(r => r.ok ? r.json() : null)
            .then(data => setWorkspaceInfo(data))
            .catch(() => setWorkspaceInfo(null));

        fetch('/api/karaoke/library', { headers: authHeaders })
            .then(r => r.ok ? r.json() : { tracks: [] })
            .then(data => setLibraryTracks(Array.isArray(data?.tracks) ? data.tracks : []))
            .catch(() => setLibraryTracks([]));
    }, []);

    useEffect(() => () => {
        if (jobPollTimeoutRef.current) {
            clearTimeout(jobPollTimeoutRef.current);
            jobPollTimeoutRef.current = null;
        }
    }, []);

    const refreshKaraokeState = async () => {
        const token = getAuthToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        try {
            const [catalogueRes, libraryRes] = await Promise.all([
                fetch('/api/karaoke/catalogue', { headers }),
                fetch('/api/karaoke/library', { headers }),
            ]);

            if (catalogueRes.ok) {
                const data = await catalogueRes.json();
                if (Array.isArray(data) && data.length) setCatalogue(data);
            }
            if (libraryRes.ok) {
                const data = await libraryRes.json();
                setLibraryTracks(Array.isArray(data?.tracks) ? data.tracks : []);
            }
        } catch {
            // Keep existing in-memory state on transient failures.
        }
    };

    /* ── backing track generation ── */
    const loadGeneratedJobAudio = async (jobId, token) => {
        const res = await fetch(`/api/karaoke/jobs/${encodeURIComponent(jobId)}/instrumental`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || 'Generated backing track was not available.');
        }

        const blob = await res.blob();
        setBackingUrl(URL.createObjectURL(blob));
        setBackingStatus('ready');
        setBackingMessage('✅ Backing track ready — switch to Sing tab!');
        setTab('sing');
        setBackingJobId('');
        await refreshKaraokeState();
    };

    // Retry helper — same pattern as the Python wheel fallback:
    // try primary, on 504/502 back off and retry, eventually surface a clear message.
    const fetchWithRetry = async (url, options, maxAttempts = 4, onRetry = null) => {
        const RETRYABLE = new Set([502, 504]);
        let lastRes = null;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const res = await fetch(url, options);
                if (RETRYABLE.has(res.status) && attempt < maxAttempts) {
                    const waitMs = Math.min(3000 * attempt, 12000);
                    if (onRetry) onRetry(res.status, attempt, maxAttempts - 1, waitMs);
                    await new Promise(r => setTimeout(r, waitMs));
                    lastRes = res;
                    continue;
                }
                return res;
            } catch (err) {
                if (attempt < maxAttempts) {
                    const waitMs = Math.min(3000 * attempt, 12000);
                    if (onRetry) onRetry('network', attempt, maxAttempts - 1, waitMs);
                    await new Promise(r => setTimeout(r, waitMs));
                } else {
                    throw err;
                }
            }
        }
        return lastRes;
    };

    const pollBackingJob = async (jobId, token, pollRetries = 0) => {
        const MAX_POLL_504_RETRIES = 5;
        try {
            const token2 = token || '';
            const res = await fetch(`/api/karaoke/jobs/${encodeURIComponent(jobId)}`, {
                headers: token2 ? { Authorization: `Bearer ${token2}` } : {},
            });

            // 504/502 on poll = gateway hiccup, not a job failure — retry with backoff
            if (res.status === 504 || res.status === 502) {
                if (pollRetries < MAX_POLL_504_RETRIES) {
                    const waitMs = Math.min(5000 * (pollRetries + 1), 20000);
                    setBackingMessage(`⏳ Gateway timeout checking status — retrying in ${waitMs / 1000}s… (${pollRetries + 1}/${MAX_POLL_504_RETRIES})`);
                    jobPollTimeoutRef.current = setTimeout(() => {
                        pollBackingJob(jobId, token, pollRetries + 1);
                    }, waitMs);
                    return;
                }
                setBackingStatus('error');
                setBackingMessage('⚠️ Gateway kept timing out on status checks. The job may still be running — refresh and check your library in a few minutes.');
                setBackingJobId('');
                return;
            }

            if (!res.ok) {
                if (res.status === 503 || res.status === 404) {
                    setIsOfflineMode(true);
                    setBackingStatus('error');
                    setBackingMessage('⚠️ Vocal separation service offline. Upload your file and click Skip Separation to sing with original audio.');
                    setBackingJobId('');
                    return;
                }
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Error ${res.status}`);
            }

            const data = await res.json();
            const status = data?.status || 'queued';
            const pollAfterSeconds = Number(data?.pollAfterSeconds || 3);

            if (status === 'completed') {
                await loadGeneratedJobAudio(jobId, token);
                return;
            }

            if (status === 'failed') {
                setBackingStatus('error');
                setBackingMessage(`❌ ${data?.error || 'Backing track generation failed.'}`);
                setBackingJobId('');
                return;
            }

            setBackingStatus('generating');
            setBackingMessage(`⏳ ${status === 'processing' ? 'Separating vocals' : 'Queued for processing'} — job ${jobId.slice(0, 8)}…`);
            jobPollTimeoutRef.current = setTimeout(() => {
                pollBackingJob(jobId, token, 0);
            }, Math.max(2, pollAfterSeconds) * 1000);
        } catch (err) {
            setBackingStatus('error');
            setBackingMessage(`❌ ${err.message}`);
            setBackingJobId('');
        }
    };

    const generateBacking = async (file, songTitle = 'Uploaded Song') => {
        setBackingStatus('generating');
        setBackingMessage(`Uploading "${songTitle}" for vocal separation…`);
        setBackingUrl(null);
        if (jobPollTimeoutRef.current) {
            clearTimeout(jobPollTimeoutRef.current);
            jobPollTimeoutRef.current = null;
        }

        const formData = new FormData();
        formData.append('audioFile', file);
        formData.append('songTitle', songTitle);

        try {
            const token = getAuthToken();
            // fetchWithRetry: on 504 during upload (gateway timeout forwarding to Python),
            // back off and retry — mirrors the Python wheel fallback resilience pattern.
            const res = await fetchWithRetry(
                '/api/karaoke/generate-backing',
                {
                    method: 'POST',
                    body: formData,
                    headers: token ? { Authorization: `Bearer ${token}` } : {}
                },
                4,
                (code, attempt, total, waitMs) => {
                    setBackingMessage(`⏳ Gateway timeout (${code}) uploading — retry ${attempt}/${total} in ${waitMs / 1000}s…`);
                }
            );

            if (!res) {
                // All retries exhausted — fall back to offline mode (no vocal separation)
                setIsOfflineMode(true);
                setBackingStatus('ready');
                setBackingMessage('⚠️ Vocal separation service unreachable — singing with original audio (vocals not removed). Pitch scoring still works.');
                setBackingUrl(URL.createObjectURL(file));
                setTab('sing');
                return;
            }

            if (res.status === 503 || res.status === 404 || res.status === 504) {
                setIsOfflineMode(true);
                setBackingStatus('ready');
                setBackingMessage('⚠️ Vocal separation offline — using original audio. Pitch scoring still works.');
                setBackingUrl(URL.createObjectURL(file));
                setTab('sing');
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Error ${res.status}`);
            }

            const data = await res.json();
            if (!data?.jobId) throw new Error('Karaoke generation job was not created.');

            setBackingJobId(data.jobId);
            setBackingMessage(`⏳ Job ${data.jobId.slice(0, 8)} queued — starting separation now…`);
            await pollBackingJob(data.jobId, token, 0);
        } catch (err) {
            setBackingStatus('error');
            setBackingMessage(`❌ ${err.message}`);
            setBackingJobId('');
        }
    };

    const purchaseSong = async (song) => {
        if (!song?.id) return;
        const token = getAuthToken();
        if (!token) {
            setBackingStatus('error');
            setBackingMessage('Please sign in to unlock premium karaoke songs.');
            return;
        }

        setPurchasingSongId(song.id);
        try {
            const res = await fetch('/api/karaoke/purchase', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ songId: song.id }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.message || 'Could not unlock this song.');
            }

            await refreshKaraokeState();
            setBackingMessage(`✅ "${song.title}" unlocked and added to your catalogue access.`);
        } catch (err) {
            setBackingStatus('error');
            setBackingMessage(`❌ ${err.message}`);
        } finally {
            setPurchasingSongId('');
        }
    };

    const loadPersistedBacking = async (track) => {
        if (!track?.trackId) return;
        const token = getAuthToken();
        if (!token) return;

        try {
            const res = await fetch(`/api/karaoke/library/${encodeURIComponent(track.trackId)}/instrumental`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                throw new Error('Stored backing track is unavailable right now.');
            }

            const blob = await res.blob();
            setSelectedSong({
                id: `library-${track.trackId}`,
                title: track.title || 'Saved Upload',
                artist: 'Your Library',
            });
            setBackingUrl(URL.createObjectURL(blob));
            setBackingStatus('ready');
            setBackingMessage('✅ Loaded saved backing track from your karaoke library.');
            setTab('sing');
        } catch (err) {
            setBackingStatus('error');
            setBackingMessage(`❌ ${err.message}`);
        }
    };

    /* ── mic pitch loop ── */
    const startSinging = async () => {
        setMicError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;
            setSinging(true);

            const buffer = new Float32Array(analyser.fftSize);
            const loop = () => {
                analyser.getFloatTimeDomainData(buffer);
                const hz = pitchDetector.detect(buffer, ctx.sampleRate);
                const note = pitchDetector.hzToNote(hz);
                setCurrentPitch(note);

                // simple scoring: award points for sustained notes
                if (hz) {
                    setScore(prev => prev + 1);
                }
                rafRef.current = requestAnimationFrame(loop);
            };
            rafRef.current = requestAnimationFrame(loop);
        } catch (err) {
            setMicError('Microphone access denied or unavailable: ' + err.message);
        }
    };

    const stopSinging = () => {
        cancelAnimationFrame(rafRef.current);
        micStreamRef.current?.getTracks().forEach(t => t.stop());
        audioCtxRef.current?.close();
        setSinging(false);
        setCurrentPitch(null);
    };

    const handleUploadChange = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setUploadFile(f);
        setUploadStatus('idle');
    };

    const handleUploadProcess = () => {
        if (!uploadFile) return;
        setSelectedSong({ id: 'upload', title: uploadFile.name, artist: 'Your Upload' });
        generateBacking(uploadFile, uploadFile.name);
        setUploadStatus('processing');
    };

    const healthColor = { ok: '#22c55e', degraded: '#f59e0b', offline: '#ef4444', unreachable: '#ef4444' };

    return (
        <div className="karaoke-page">
            {/* Header */}
            <div className="karaoke-header">
                <div className="karaoke-title-row">
                    <span className="karaoke-icon">🎤</span>
                    <div>
                        <h1 className="karaoke-title">Karaoke Party Room</h1>
                        <p className="karaoke-subtitle">
                            Vocal separation · Real-time pitch scoring · Public domain catalogue
                        </p>
                    </div>
                    <div className="karaoke-health" title="Karaoke engine status">
                        <span className="karaoke-health-dot"
                            style={{ background: health ? (healthColor[health] || '#6b7280') : '#6b7280' }} />
                        <span>{health ?? 'checking…'}</span>
                    </div>
                </div>

                {/* Licensing notice */}
                <div className="karaoke-notice">
                    🔒 <strong>Licensing:</strong> This feature uses public-domain tracks (Musopen, IMSLP)
                    and UltraStar community songs by default. You may upload songs you own.
                    For mainstream commercial tracks, a licensing agreement (Singa, Agora, ZEGO) is required.
                </div>
            </div>

            {/* Tabs */}
            <div className="karaoke-tabs">
                {[
                    { id: 'catalogue', label: '🎵 Catalogue' },
                    { id: 'upload', label: '📂 Upload Song' },
                    { id: 'sing', label: '🎤 Sing', disabled: !backingUrl },
                ].map(t => (
                    <button
                        key={t.id}
                        className={`karaoke-tab${tab === t.id ? ' active' : ''}${t.disabled ? ' disabled' : ''}`}
                        onClick={() => !t.disabled && setTab(t.id)}
                        disabled={t.disabled}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab: Catalogue */}
            {tab === 'catalogue' && (
                <div className="karaoke-section">
                    <p className="karaoke-section-desc">
                        Select from a larger song catalogue. Free songs are instantly available.
                        Premium songs can be unlocked per user and stay unlocked.
                    </p>
                    {catalogueLoading && (
                        <p className="karaoke-message">Loading karaoke catalogue…</p>
                    )}
                    <div className="karaoke-song-list">
                        {catalogue.map(song => (
                            <div
                                key={song.id}
                                className={`karaoke-song-card${selectedSong?.id === song.id ? ' selected' : ''}`}
                                onClick={() => setSelectedSong(song)}
                            >
                                <div className="karaoke-song-icon">🎼</div>
                                <div className="karaoke-song-info">
                                    <strong>{song.title}</strong>
                                    <span>{song.artist}</span>
                                    {song.duration && <span className="karaoke-song-duration">{song.duration}</span>}
                                    {song.tier === 'premium' && (
                                        <span style={{ fontSize: '0.78rem', color: song.unlocked ? '#22c55e' : '#f59e0b' }}>
                                            {song.unlocked ? 'Unlocked' : `Premium · $${Number(song.priceUsd || 0).toFixed(2)}`}
                                        </span>
                                    )}
                                </div>
                                <div className={`karaoke-song-source karaoke-source-${song.source?.split('-')[0]}`}>
                                    {song.source}
                                </div>
                                {song.tier === 'premium' && !song.unlocked && (
                                    <button
                                        className="karaoke-btn karaoke-btn-secondary"
                                        style={{ marginLeft: 'auto' }}
                                        disabled={purchasingSongId === song.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            purchaseSong(song);
                                        }}
                                    >
                                        {purchasingSongId === song.id ? 'Unlocking…' : 'Unlock'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {selectedSong && selectedSong.id !== 'upload' && (
                        <div className="karaoke-selected-actions">
                            <p>Selected: <strong>{selectedSong.title}</strong></p>
                            {selectedSong.tier === 'premium' && !selectedSong.unlocked && (
                                <p style={{ fontSize: '0.82rem', color: '#f59e0b', margin: '4px 0 12px' }}>
                                    Unlock this premium song to use it in your karaoke room.
                                </p>
                            )}
                            <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '4px 0 12px' }}>
                                Catalogue songs use pre-processed instrumental files. Upload your own to
                                separate vocals with htdemucs_ft.
                            </p>
                            <button
                                className="karaoke-btn karaoke-btn-primary"
                                disabled={selectedSong.tier === 'premium' && !selectedSong.unlocked}
                                onClick={() => {
                                    // For catalogue songs, we can't auto-generate — direct to sing with a placeholder
                                    setBackingUrl('catalogue-placeholder');
                                    setBackingStatus('ready');
                                    setTab('sing');
                                }}
                            >
                                🎤 Sing This Song
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Upload */}
            {tab === 'upload' && (
                <div className="karaoke-section">
                    <p className="karaoke-section-desc">
                        Upload any song you own and we'll extract the vocals using
                        htdemucs_ft (the #1 open-source vocal separation model).
                        Processing takes 1–3 minutes on CPU.
                    </p>

                    <div
                        className="karaoke-dropzone"
                        onClick={() => uploadRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                            e.preventDefault();
                            const f = e.dataTransfer.files?.[0];
                            if (f) handleUploadChange({ target: { files: [f] } });
                        }}
                    >
                        <input
                            ref={uploadRef}
                            type="file"
                            accept=".wav,.mp3,.m4a,.flac,.ogg"
                            style={{ display: 'none' }}
                            onChange={handleUploadChange}
                        />
                        {uploadFile ? (
                            <>
                                <div style={{ fontSize: 32 }}>🎵</div>
                                <strong style={{ display: 'block', margin: '8px 0 4px' }}>{uploadFile.name}</strong>
                                <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                                    {(uploadFile.size / (1024 * 1024)).toFixed(1)} MB
                                </span>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 40 }}>📁</div>
                                <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>Drop song here or click to browse</p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#9ca3af' }}>
                                    WAV · MP3 · M4A · FLAC · OGG · max 300 MB
                                </p>
                            </>
                        )}
                    </div>

                    {backingMessage && (
                        <p className={`karaoke-message ${backingStatus === 'error' ? 'error' : ''}`}>
                            {backingMessage} {backingJobId ? <span style={{ opacity: 0.8 }}>(Job: {backingJobId.slice(0, 8)})</span> : null}
                        </p>
                    )}

                    <button
                        className="karaoke-btn karaoke-btn-primary"
                        disabled={!uploadFile || backingStatus === 'generating'}
                        onClick={handleUploadProcess}
                        style={{ marginTop: 12 }}
                    >
                        {backingStatus === 'generating' ? '⏳ Separating vocals…' : '🎼 Generate Karaoke Track'}
                    </button>

                    {/* Offline mode: skip separation and sing with original audio */}
                    {(isOfflineMode || health === 'offline' || health === 'unreachable') && uploadFile && backingStatus !== 'ready' && (
                        <div className="karaoke-arch-note" style={{ borderLeft: '3px solid #f59e0b', marginTop: 12 }}>
                            <strong>⚠️ Vocal separation service offline</strong>
                            <p style={{ fontSize: '0.83rem', color: '#9ca3af', margin: '6px 0 10px' }}>
                                The Python htdemucs engine is not running. You can still sing along using the original audio (vocals included).
                            </p>
                            <button
                                className="karaoke-btn karaoke-btn-secondary"
                                onClick={() => {
                                    setIsOfflineMode(true);
                                    setBackingStatus('ready');
                                    setBackingMessage('🎵 Offline mode — singing with original audio (vocals not removed).');
                                    const u = URL.createObjectURL(uploadFile);
                                    setBackingUrl(u);
                                    setTab('sing');
                                }}
                            >
                                🎤 Skip separation — Sing with original audio
                            </button>
                        </div>
                    )}

                    {/* architecture note */}
                    <div className="karaoke-arch-note">
                        <strong>How it works</strong>
                        <ol>
                            <li>Your song is sent to the Python FastAPI microservice</li>
                            <li>htdemucs_ft separates it into 4 stems: drums, bass, other, vocals</li>
                            <li>Per-user folders are created on first use and stems persist for reuse</li>
                            <li>The non-vocal stems are mixed into a single instrumental track</li>
                            <li>You sing along while the backing track plays</li>
                        </ol>
                    </div>

                    {workspaceInfo && (
                        <div className="karaoke-arch-note" style={{ marginTop: 12 }}>
                            <strong>Your persistent workspace is active</strong>
                            <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginTop: 6 }}>
                                User workspace: <code>{workspaceInfo.userId}</code> · stems are saved by track for ongoing use.
                            </div>
                        </div>
                    )}

                    {libraryTracks.length > 0 && (
                        <div className="karaoke-arch-note" style={{ marginTop: 12 }}>
                            <strong>Your karaoke library</strong>
                            <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                                {libraryTracks.slice(0, 8).map((track) => (
                                    <button
                                        key={track.trackId}
                                        className="karaoke-btn karaoke-btn-secondary"
                                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                        onClick={() => loadPersistedBacking(track)}
                                    >
                                        🎵 {track.title || track.originalFileName || 'Saved track'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Sing */}
            {tab === 'sing' && (
                <div className="karaoke-section">
                    {selectedSong && (
                        <div className="karaoke-now-singing">
                            <span style={{ fontSize: 28 }}>🎤</span>
                            <div>
                                <strong>{selectedSong.title}</strong>
                                <span style={{ display: 'block', fontSize: '0.85rem', color: '#9ca3af' }}>
                                    {selectedSong.artist}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Backing track player */}
                    {backingUrl && backingUrl !== 'catalogue-placeholder' && (
                        <div className="karaoke-player">
                            <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.9rem' }}>Backing Track</p>
                            <audio src={backingUrl} controls style={{ width: '100%' }} />
                        </div>
                    )}
                    {backingUrl === 'catalogue-placeholder' && (
                        <div className="karaoke-player">
                            <p style={{ margin: 0, color: '#f59e0b', fontSize: '0.85rem' }}>
                                📌 Catalogue backing track: upload the audio file for real vocal separation,
                                or use your own recording. Backing track playback for catalogue songs
                                requires a licensed source file.
                            </p>
                        </div>
                    )}

                    {/* Score display */}
                    <div className="karaoke-score-bar">
                        <div className="karaoke-score-label">Score</div>
                        <div className="karaoke-score-value">{score.toLocaleString()}</div>
                        <div className="karaoke-pitch-display">
                            {currentPitch
                                ? <span className="karaoke-pitch-note">{currentPitch}</span>
                                : <span className="karaoke-pitch-silent">🎙️ No pitch detected</span>}
                        </div>
                    </div>

                    {micError && (
                        <p className="karaoke-message error">{micError}</p>
                    )}

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                        {!singing ? (
                            <button className="karaoke-btn karaoke-btn-sing" onClick={startSinging}>
                                🎤 Start Singing
                            </button>
                        ) : (
                            <button className="karaoke-btn karaoke-btn-stop" onClick={stopSinging}>
                                ⏹ Stop
                            </button>
                        )}
                        <button
                            className="karaoke-btn karaoke-btn-secondary"
                            onClick={() => { setScore(0); setCurrentPitch(null); }}
                        >
                            🔄 Reset Score
                        </button>
                    </div>

                    <div className="karaoke-scoring-note">
                        <strong>Scoring:</strong> Points awarded per detected pitch. Client-side YIN algorithm —
                        no latency. Reference vocal pitch analysis (server-side via librosa) can be wired
                        once vocal reference .wav is available from the backing track generator.
                    </div>

                    <div className="karaoke-scoring-note" style={{ marginTop: 16 }}>
                        <strong>Lyric scoring mode:</strong> stream microphone audio to STT, align words in real time,
                        and score your lyric accuracy against reference text.
                    </div>

                    <label style={{ display: 'block', marginTop: 12, fontWeight: 600 }}>
                        Reference Lyrics
                    </label>
                    <textarea
                        value={referenceLyrics}
                        onChange={(e) => setReferenceLyrics(e.target.value)}
                        rows={5}
                        style={{
                            width: '100%',
                            marginTop: 8,
                            borderRadius: 10,
                            border: '1px solid #374151',
                            background: '#111827',
                            color: '#f3f4f6',
                            padding: 12,
                        }}
                        placeholder="Paste the lyrics you want to score against"
                    />

                    <div style={{ marginTop: 12 }}>
                        <button
                            className="karaoke-btn karaoke-btn-primary"
                            disabled={!backingUrl || backingUrl === 'catalogue-placeholder' || !referenceLyrics.trim()}
                            onClick={() => setShowKaraokeScorer(true)}
                        >
                            🎯 Start Integrated Lyric Scoring
                        </button>
                    </div>

                    {showKaraokeScorer && backingUrl && backingUrl !== 'catalogue-placeholder' && (
                        <KaraokeScorer
                            lyrics={referenceLyrics}
                            wordTimings={buildEstimatedWordTimings(referenceLyrics)}
                            audioSrc={backingUrl}
                            songTitle={selectedSong?.title || 'Karaoke Session'}
                            authToken={user?.token || null}
                            embedded
                            onClose={() => setShowKaraokeScorer(false)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
