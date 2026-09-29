/**
 * KaraokeScorer
 * Full karaoke performance component:
 *   - Displays reference lyrics word-by-word with real-time highlighting
 *     driven by requestAnimationFrame + audio currentTime
 *   - Captures mic via useKaraokeSTT and streams to sherpa-onnx STT
 *   - After the track ends, scores the performance via POST /api/karaoke/speech/score
 *   - Plays spoken feedback via useKaraokeTTS
 *
 * Props:
 *   lyrics      : string          – full song lyrics (whitespace-separated words)
 *   wordTimings : [{word, start, end}] – reference word timestamps from the backing track
 *   audioSrc    : string          – URL of the backing (instrumental) track
 *   songTitle   : string
 *   onClose     : () => void
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useKaraokeSTT } from '../../hooks/useKaraokeSTT';
import { useKaraokeTTS } from '../../hooks/useKaraokeTTS';

const HIGHLIGHT_LOOKAHEAD_MS = 50; // start highlighting slightly early for feel

export default function KaraokeScorer({ lyrics = '', wordTimings = [], audioSrc, songTitle = 'this song', onClose, authToken = null }) {
    const refWords   = lyrics.trim().split(/\s+/).filter(Boolean);
    const timings    = wordTimings; // [{word, start, end}]

    const audioRef       = useRef(null);
    const rafRef         = useRef(null);
    const [activeIdx,    setActiveIdx]    = useState(-1);
    const [phase,        setPhase]        = useState('idle');   // idle | countdown | singing | scored
    const [countdown,    setCountdown]    = useState(3);
    const [score,        setScore]        = useState(null);
    const [scoreLabel,   setScoreLabel]   = useState('');
    const [transcript,   setLocalTranscript] = useState('');

    const stt = useKaraokeSTT();
    const tts = useKaraokeTTS(authToken);

    // ── Lyric highlight loop via requestAnimationFrame ─────────────────
    const highlightLoop = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const t = audio.currentTime * 1000; // ms
        let idx = -1;
        for (let i = 0; i < timings.length; i++) {
            if (t >= timings[i].start * 1000 - HIGHLIGHT_LOOKAHEAD_MS) {
                idx = i;
            }
        }
        setActiveIdx(idx);
        rafRef.current = requestAnimationFrame(highlightLoop);
    }, [timings]);

    // ── Countdown then start ───────────────────────────────────────────
    const startCountdown = useCallback(async () => {
        setPhase('countdown');
        await tts.announce(`Get ready to sing ${songTitle} in`);
        let c = 3;
        setCountdown(c);
        const tick = setInterval(() => {
            c--;
            setCountdown(c);
            if (c === 0) {
                clearInterval(tick);
                startSinging();
            }
        }, 1000);
    }, [songTitle, tts]);

    const startSinging = useCallback(() => {
        setPhase('singing');
        stt.start();
        const audio = audioRef.current;
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {});
            rafRef.current = requestAnimationFrame(highlightLoop);
        }
    }, [stt, highlightLoop]);

    // ── Score after track ends ─────────────────────────────────────────
    const finalize = useCallback(async (hypothesis) => {
        setPhase('scored');
        cancelAnimationFrame(rafRef.current);
        stt.stop();

        try {
            const res = await fetch('/api/karaoke/speech/score', {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body:    JSON.stringify({ reference: lyrics, hypothesis, song_title: songTitle }),
            });
            if (res.ok) {
                const data = await res.json();
                setScore(data.score);
                setScoreLabel(data.label);
                await tts.scoreFeedback(data.score, songTitle);
            }
        } catch (err) {
            console.warn('Scoring failed:', err);
        }
    }, [lyrics, songTitle, stt, tts, authToken]);

    // Keep local transcript updated from STT hook
    useEffect(() => {
        if (stt.transcript) setLocalTranscript(stt.transcript);
    }, [stt.transcript]);

    // Finalize when audio ends
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onEnded = () => finalize(transcript);
        audio.addEventListener('ended', onEnded);
        return () => audio.removeEventListener('ended', onEnded);
    }, [transcript, finalize]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cancelAnimationFrame(rafRef.current);
            stt.stop();
        };
    }, [stt]);

    // ── Render ─────────────────────────────────────────────────────────
    return (
        <div style={styles.overlay}>
            <div style={styles.card}>
                {/* Header */}
                <div style={styles.header}>
                    <span style={styles.title}>🎤 {songTitle}</span>
                    <button type="button" style={styles.closeBtn} onClick={onClose}>✕</button>
                </div>

                {/* Hidden audio element */}
                {audioSrc && (
                    <audio ref={audioRef} src={audioSrc} preload="auto" style={{ display: 'none' }} />
                )}

                {/* Countdown */}
                {phase === 'countdown' && (
                    <div style={styles.countdown}>{countdown > 0 ? countdown : '🎵'}</div>
                )}

                {/* Lyrics display */}
                {(phase === 'singing' || phase === 'scored') && (
                    <div style={styles.lyricsBox}>
                        {refWords.map((word, i) => {
                            const isActive = i === activeIdx;
                            const isPast   = i < activeIdx;
                            return (
                                <span
                                    key={i}
                                    style={{
                                        ...styles.word,
                                        ...(isActive ? styles.wordActive : {}),
                                        ...(isPast   ? styles.wordPast   : {}),
                                    }}
                                >
                                    {word}{' '}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* STT live transcript */}
                {phase === 'singing' && transcript && (
                    <div style={styles.liveTranscript}>
                        🎙️ <em>{transcript}</em>
                    </div>
                )}

                {/* Score result */}
                {phase === 'scored' && score !== null && (
                    <div style={styles.scoreBox}>
                        <div style={styles.scorePct}>{score}%</div>
                        <div style={styles.scoreLabel}>{scoreLabel}</div>
                        <button
                            type="button"
                            style={styles.retryBtn}
                            onClick={() => {
                                setPhase('idle');
                                setScore(null);
                                setActiveIdx(-1);
                                setLocalTranscript('');
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* Idle — start button */}
                {phase === 'idle' && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <button
                            type="button"
                            style={styles.startBtn}
                            onClick={startCountdown}
                            disabled={!audioSrc}
                        >
                            🎙️ Start Singing
                        </button>
                        {!audioSrc && (
                            <p style={styles.noAudio}>No backing track loaded. Generate one first.</p>
                        )}
                    </div>
                )}

                {/* STT / TTS errors */}
                {(stt.error || tts.error) && (
                    <div style={styles.error}>
                        {stt.error || tts.error}
                    </div>
                )}

                {/* Listening indicator */}
                {stt.isListening && (
                    <div style={styles.listenBadge}>● LIVE</div>
                )}
            </div>
        </div>
    );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = {
    overlay: {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    },
    card: {
        background: 'linear-gradient(160deg, #1a0533 0%, #0d1b3e 100%)',
        border: '1px solid rgba(167,139,250,0.3)',
        borderRadius: '20px', padding: '28px',
        width: '90%', maxWidth: '800px', maxHeight: '90vh',
        overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        position: 'relative',
    },
    header: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '20px',
    },
    title: { fontSize: '18px', fontWeight: 800, color: '#e2e8f0' },
    closeBtn: {
        background: 'none', border: 'none', color: '#94a3b8',
        fontSize: '20px', cursor: 'pointer',
    },
    countdown: {
        fontSize: '96px', fontWeight: 900, textAlign: 'center',
        color: '#a78bfa', padding: '40px 0',
        textShadow: '0 0 40px rgba(167,139,250,0.8)',
    },
    lyricsBox: {
        background: 'rgba(0,0,0,0.3)', borderRadius: '12px',
        padding: '24px', lineHeight: '2.2', fontSize: '22px',
        minHeight: '120px', marginBottom: '16px',
    },
    word: { color: '#64748b', transition: 'all 0.15s ease' },
    wordPast:   { color: '#94a3b8' },
    wordActive: {
        color: '#fbbf24', fontWeight: 800,
        textShadow: '0 0 16px rgba(251,191,36,0.8)',
        transform: 'scale(1.1)', display: 'inline-block',
    },
    liveTranscript: {
        fontSize: '13px', color: '#94a3b8', padding: '8px 12px',
        background: 'rgba(255,255,255,0.05)', borderRadius: '8px',
        marginBottom: '12px',
    },
    scoreBox: { textAlign: 'center', padding: '24px 0' },
    scorePct: {
        fontSize: '80px', fontWeight: 900, color: '#4ade80',
        textShadow: '0 0 30px rgba(74,222,128,0.6)',
    },
    scoreLabel: { fontSize: '22px', color: '#e2e8f0', marginBottom: '20px' },
    retryBtn: {
        background: 'linear-gradient(135deg, #667eea, #764ba2)',
        color: 'white', border: 'none', borderRadius: '12px',
        padding: '12px 28px', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
    },
    startBtn: {
        background: 'linear-gradient(135deg, #a78bfa, #ec4899)',
        color: 'white', border: 'none', borderRadius: '14px',
        padding: '16px 36px', fontSize: '18px', fontWeight: 800, cursor: 'pointer',
    },
    noAudio: { color: '#94a3b8', fontSize: '13px', marginTop: '12px' },
    listenBadge: {
        position: 'absolute', top: '16px', right: '60px',
        background: 'rgba(239,68,68,0.2)', color: '#f87171',
        padding: '3px 10px', borderRadius: '999px',
        fontSize: '11px', fontWeight: 800, letterSpacing: '0.1em',
    },
    error: {
        background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px', padding: '10px 14px', color: '#f87171',
        fontSize: '13px', marginTop: '12px',
    },
};
