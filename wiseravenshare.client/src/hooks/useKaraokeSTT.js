/**
 * useKaraokeSTT
 * Connects to the ASP.NET Core WebSocket proxy → Python sherpa-onnx STT.
 * Captures microphone audio via Web Audio API, resamples to 16 kHz mono,
 * streams 16-bit PCM chunks to the server, and returns:
 *   - transcript  : latest partial/final text
 *   - words       : [{word, start, end}] with timestamps for lyric highlighting
 *   - isListening : bool
 *   - start()     : begin capture
 *   - stop()      : end capture
 *   - error       : string | null
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const SAMPLE_RATE    = 16000;
const CHUNK_DURATION = 0.1; // seconds per audio chunk sent to server
const CHUNK_SAMPLES  = Math.floor(SAMPLE_RATE * CHUNK_DURATION);

function buildSttWsUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/api/karaoke/speech/stt-stream`;
}

export function useKaraokeSTT() {
    const [transcript,  setTranscript]  = useState('');
    const [words,       setWords]       = useState([]); // [{word, start, end}]
    const [isListening, setIsListening] = useState(false);
    const [error,       setError]       = useState(null);

    const wsRef           = useRef(null);
    const audioCtxRef     = useRef(null);
    const streamRef       = useRef(null);
    const processorRef    = useRef(null);
    const sampleBufferRef = useRef(new Float32Array(0));

    const stop = useCallback(() => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setIsListening(false);
        sampleBufferRef.current = new Float32Array(0);
    }, []);

    const start = useCallback(async () => {
        setError(null);
        setTranscript('');
        setWords([]);

        let micStream;
        try {
            micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (err) {
            setError('Microphone access denied: ' + err.message);
            return;
        }

        streamRef.current = micStream;

        // Open WebSocket to C# proxy
        const ws = new WebSocket(buildSttWsUrl());
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
            setIsListening(true);
        };

        ws.onmessage = (event) => {
            try {
                const frame = JSON.parse(event.data);
                if (frame.text !== undefined) setTranscript(frame.text);
                if (frame.words)              setWords(frame.words);
                if (frame.error)              setError(frame.error);
            } catch {
                // binary frames not expected from this endpoint
            }
        };

        ws.onerror = () => setError('STT WebSocket error. Is the speech service running?');
        ws.onclose = () => setIsListening(false);

        // Set up Web Audio API pipeline: mic → resampler → 16-bit PCM chunks
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(micStream);

        // ScriptProcessor for raw PCM access (widely supported; AudioWorklet preferred for production)
        const bufferSize   = 4096;
        const processor    = audioCtx.createScriptProcessor(bufferSize, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
            if (ws.readyState !== WebSocket.OPEN) return;

            const inputData   = e.inputBuffer.getChannelData(0); // float32 at audioCtx.sampleRate
            const resampledLen = Math.floor(inputData.length * SAMPLE_RATE / audioCtx.sampleRate);

            // Linear interpolation resample to 16 kHz
            const resampled = new Float32Array(resampledLen);
            for (let i = 0; i < resampledLen; i++) {
                const srcIdx = i * audioCtx.sampleRate / SAMPLE_RATE;
                const lo = Math.floor(srcIdx);
                const hi = Math.min(lo + 1, inputData.length - 1);
                const frac = srcIdx - lo;
                resampled[i] = inputData[lo] * (1 - frac) + inputData[hi] * frac;
            }

            // Accumulate into chunk buffer
            const combined = new Float32Array(sampleBufferRef.current.length + resampled.length);
            combined.set(sampleBufferRef.current);
            combined.set(resampled, sampleBufferRef.current.length);
            sampleBufferRef.current = combined;

            // Drain complete chunks
            while (sampleBufferRef.current.length >= CHUNK_SAMPLES) {
                const chunk = sampleBufferRef.current.slice(0, CHUNK_SAMPLES);
                sampleBufferRef.current = sampleBufferRef.current.slice(CHUNK_SAMPLES);

                // Convert float32 → int16 PCM
                const pcm = new Int16Array(chunk.length);
                for (let i = 0; i < chunk.length; i++) {
                    pcm[i] = Math.max(-32768, Math.min(32767, Math.round(chunk[i] * 32767)));
                }
                ws.send(pcm.buffer);
            }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination); // required to trigger onaudioprocess
    }, []);

    // Cleanup on unmount
    useEffect(() => () => stop(), [stop]);

    return { transcript, words, isListening, error, start, stop };
}
