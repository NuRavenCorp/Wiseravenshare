/**
 * useKaraokeTTS
 * Server-side TTS via pyttsx3 (offline, no API key needed).
 * Fetches WAV from /api/karaoke/speech/announce and plays it.
 *
 * Usage:
 *   const { announce, scoreFeedback, speaking, error } = useKaraokeTTS();
 *   announce("Now singing: Bohemian Rhapsody");
 *   scoreFeedback(88, "Bohemian Rhapsody");
 */

import { useCallback, useRef, useState } from 'react';

const BASE = '/api/karaoke/speech';

async function fetchAndPlayWav(url, onEnd, audioRef) {
    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`TTS request failed (${res.status}): ${body}`);
    }
    const arrayBuf  = await res.arrayBuffer();
    const audioCtx  = new AudioContext();
    const decoded   = await audioCtx.decodeAudioData(arrayBuf);
    const source    = audioCtx.createBufferSource();
    source.buffer   = decoded;
    source.connect(audioCtx.destination);
    source.onended  = () => {
        audioCtx.close();
        if (onEnd) onEnd();
    };
    audioRef.current = { source, audioCtx };
    source.start(0);
}

export function useKaraokeTTS() {
    const [speaking, setSpeaking] = useState(false);
    const [error,    setError]    = useState(null);
    const audioRef = useRef(null);

    const _stop = useCallback(() => {
        if (audioRef.current) {
            try {
                audioRef.current.source.stop();
                audioRef.current.audioCtx.close();
            } catch { /* already stopped */ }
            audioRef.current = null;
        }
        setSpeaking(false);
    }, []);

    const announce = useCallback(async (text, rate = 160) => {
        if (!text?.trim()) return;
        _stop();
        setError(null);
        setSpeaking(true);
        const url = `${BASE}/announce?text=${encodeURIComponent(text)}&rate=${rate}`;
        try {
            await fetchAndPlayWav(url, () => setSpeaking(false), audioRef);
        } catch (err) {
            setError(err.message);
            setSpeaking(false);
        }
    }, [_stop]);

    const scoreFeedback = useCallback(async (score, songTitle = null) => {
        _stop();
        setError(null);
        setSpeaking(true);
        let url = `${BASE}/score-feedback?score=${score}`;
        if (songTitle) url += `&song=${encodeURIComponent(songTitle)}`;
        try {
            await fetchAndPlayWav(url, () => setSpeaking(false), audioRef);
        } catch (err) {
            setError(err.message);
            setSpeaking(false);
        }
    }, [_stop]);

    return { announce, scoreFeedback, speaking, error, stop: _stop };
}
