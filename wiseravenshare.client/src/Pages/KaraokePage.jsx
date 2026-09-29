import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../Contexts/AuthContext';
import KaraokeScorer from '../Components/Karaoke/KaraokeScorer';
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
    const [selectedSong, setSelectedSong] = useState(null);
    const [backingUrl, setBackingUrl] = useState(null);
    const [backingStatus, setBackingStatus] = useState('idle'); // idle|generating|ready|error
    const [backingMessage, setBackingMessage] = useState('');

    // upload
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const uploadRef = useRef(null);

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
    const [showKaraokeScorer, setShowKaraokeScorer] = useState(false);
    const [referenceLyrics, setReferenceLyrics] = useState(DEFAULT_REFERENCE_LYRICS);

    useEffect(() => {
        fetch('/api/karaoke/catalogue')
            .then(r => r.ok ? r.json() : Promise.resolve(DEMO_SONGS))
            .then(data => setCatalogue(data.length ? data : DEMO_SONGS))
            .catch(() => setCatalogue(DEMO_SONGS));

        fetch('/api/karaoke/health')
            .then(r => r.json())
            .then(d => setHealth(d.upstream))
            .catch(() => setHealth('offline'));
    }, []);

    /* ── backing track generation ── */
    const generateBacking = async (file, songTitle = 'Uploaded Song') => {
        setBackingStatus('generating');
        setBackingMessage(`Separating vocals from "${songTitle}" — this takes 1–3 min on CPU…`);
        setBackingUrl(null);

        const formData = new FormData();
        formData.append('audioFile', file);

        try {
            const res = await fetch('/api/karaoke/generate-backing', {
                method: 'POST',
                body: formData,
                headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {}
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Error ${res.status}`);
            }

            const blob = await res.blob();
            setBackingUrl(URL.createObjectURL(blob));
            setBackingStatus('ready');
            setBackingMessage('✅ Backing track ready — switch to Sing tab!');
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
                        Select a public-domain / community song to sing — no licence required.
                    </p>
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
                                </div>
                                <div className={`karaoke-song-source karaoke-source-${song.source?.split('-')[0]}`}>
                                    {song.source}
                                </div>
                            </div>
                        ))}
                    </div>

                    {selectedSong && selectedSong.id !== 'upload' && (
                        <div className="karaoke-selected-actions">
                            <p>Selected: <strong>{selectedSong.title}</strong></p>
                            <p style={{ fontSize: '0.82rem', color: '#9ca3af', margin: '4px 0 12px' }}>
                                Catalogue songs use pre-processed instrumental files. Upload your own to
                                separate vocals with htdemucs_ft.
                            </p>
                            <button
                                className="karaoke-btn karaoke-btn-primary"
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
                            {backingMessage}
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

                    {/* architecture note */}
                    <div className="karaoke-arch-note">
                        <strong>How it works</strong>
                        <ol>
                            <li>Your song is sent to the Python FastAPI microservice</li>
                            <li>htdemucs_ft separates it into 4 stems: drums, bass, other, vocals</li>
                            <li>The non-vocal stems are mixed into a single instrumental track</li>
                            <li>You sing along while the backing track plays</li>
                        </ol>
                    </div>
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
