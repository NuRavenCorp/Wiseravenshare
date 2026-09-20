V// src/hooks/useRecorder.js
import { useRef, useState, useCallback } from 'react';

export function useRecorder({ onStop, mimeType = 'audio/webm' } = {}) {
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const streamRef = useRef(null);

    const start = useCallback(async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mr = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = mr;
        chunksRef.current = [];

        mr.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
        mr.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            onStop?.(blob);
            stream.getTracks().forEach(t => t.stop());
            setRecording(false);
            setElapsed(0);
            clearInterval(timerRef.current);
        };

        mr.start(200);
        setRecording(true);
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }, [mimeType, onStop]);

    const stop = useCallback(() => mediaRecorderRef.current?.state !== 'inactive' && mediaRecorderRef.current.stop(), []);
    const cancel = useCallback(() => {
        if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current.stop();
        streamRef.current?.getTracks().forEach(t => t.stop());
        setRecording(false); setElapsed(0); clearInterval(timerRef.current);
    }, []);

    return { recording, elapsed, start, stop, cancel };
}