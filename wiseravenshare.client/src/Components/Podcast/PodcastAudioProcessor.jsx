import React, { useRef, useState } from 'react';
import { useAuth } from '../../Contexts/AuthContext';
import { getAuthToken } from '../../Services/authStorage';

const ALLOWED_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4',
    'audio/x-m4a', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/vorbis'];
const MAX_MB = 500;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

export default function PodcastAudioProcessor() {
    const { user } = useAuth();
    const [file, setFile] = useState(null);
    const [status, setStatus] = useState('idle'); // idle | processing | done | error
    const [message, setMessage] = useState('');
    const [processedUrl, setProcessedUrl] = useState(null);
    const [processedName, setProcessedName] = useState('processed.wav');
    const [serviceHealth, setServiceHealth] = useState(null);
    const inputRef = useRef(null);

    const checkHealth = async () => {
        try {
            const res = await fetch('/api/podcast-audio/health');
            const data = await res.json();
            setServiceHealth(data.upstream === 'ok' ? 'online' : 'degraded');
        } catch {
            setServiceHealth('offline');
        }
    };

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        if (!ALLOWED_TYPES.includes(selected.type) && !selected.name.match(/\.(wav|mp3|m4a|flac|ogg)$/i)) {
            setMessage('Unsupported format. Use WAV, MP3, M4A, FLAC, or OGG.');
            return;
        }

        if (selected.size > MAX_MB * 1024 * 1024) {
            setMessage(`File too large. Maximum is ${MAX_MB} MB.`);
            return;
        }

        setFile(selected);
        setMessage('');
        setProcessedUrl(null);
        setStatus('idle');
    };

    const handleProcess = async () => {
        if (!file) return;
        setStatus('processing');
        setMessage('Running Audacity-equivalent DSP chain (DC removal → noise reduction → gate → compression → -16 LUFS normalisation)…');
        setProcessedUrl(null);

        const formData = new FormData();
        formData.append('audioFile', file);

        try {
            const token = getAuthToken();
            const res = await fetch('/api/podcast-audio/process', {
                method: 'POST',
                body: formData,
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `Server error ${res.status}`);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const name = `processed_${file.name.replace(/\.[^.]+$/, '')}.wav`;
            setProcessedUrl(url);
            setProcessedName(name);
            setStatus('done');
            setMessage('✅ Processing complete — preview and download below.');
        } catch (err) {
            setStatus('error');
            setMessage(`❌ ${err.message}`);
        }
    };

    const handleReset = () => {
        setFile(null);
        setStatus('idle');
        setMessage('');
        setProcessedUrl(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    const healthColor = { online: '#22c55e', degraded: '#f59e0b', offline: '#ef4444' };

    return (
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span style={{ fontSize: 28 }}>🎙️</span>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                        Podcast Audio Processor
                    </h2>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #9ca3af)' }}>
                        Audacity-equivalent DSP · DC removal · Noise reduction · -16 LUFS normalise
                    </p>
                </div>
                <div
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                    onClick={checkHealth}
                    title="Click to check service status"
                >
                    <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: serviceHealth ? healthColor[serviceHealth] : '#6b7280',
                        display: 'inline-block'
                    }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #9ca3af)' }}>
                        {serviceHealth ?? 'Check status'}
                    </span>
                </div>
            </div>

            {/* Upload zone */}
            <div
                style={{
                    border: '2px dashed var(--border-color, #374151)',
                    borderRadius: 12, padding: 32, textAlign: 'center',
                    cursor: 'pointer', transition: 'border-color 0.2s', marginBottom: 16,
                }}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped) handleFileChange({ target: { files: [dropped] } });
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".wav,.mp3,.m4a,.flac,.ogg"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                {file ? (
                    <div>
                        <div style={{ fontSize: 32 }}>🎵</div>
                        <strong style={{ display: 'block', marginTop: 8 }}>{file.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #9ca3af)' }}>
                            {formatBytes(file.size)}
                        </span>
                    </div>
                ) : (
                    <div>
                        <div style={{ fontSize: 40 }}>📁</div>
                        <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>Drop audio or click to browse</p>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #9ca3af)' }}>
                            WAV · MP3 · M4A · FLAC · OGG · max {MAX_MB} MB
                        </p>
                    </div>
                )}
            </div>

            {message && (
                <p style={{
                    padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                    background: status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(99,102,241,0.08)',
                    color: status === 'error' ? '#ef4444' : 'var(--text-primary, #e5e7eb)',
                    fontSize: '0.85rem'
                }}>
                    {message}
                </p>
            )}

            {/* DSP chain info */}
            <div style={{
                background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.78rem',
                color: 'var(--text-secondary, #9ca3af)'
            }}>
                <strong style={{ color: 'var(--text-primary, #e5e7eb)', display: 'block', marginBottom: 6 }}>
                    Processing chain
                </strong>
                {[
                    ['1', 'DC Offset Removal', 'Centres waveform — prevents distortion'],
                    ['2', 'Noise Reduction', 'Spectral gating — prop_decrease 0.85, 23 ms FFT window'],
                    ['3', 'Noise Gate', '-40 dB threshold, -24 dB reduction, A/H/D 10/50/100 ms'],
                    ['4', 'Compression', '-18 dB threshold, 4:1 ratio'],
                    ['5', 'Loudness Normalisation', '-16 LUFS target (ITU-R BS.1770-4 — podcast standard)'],
                ].map(([n, name, desc]) => (
                    <div key={n} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                        <span style={{ minWidth: 16, fontWeight: 700, color: '#818cf8' }}>{n}.</span>
                        <span><strong style={{ color: 'var(--text-primary, #e5e7eb)' }}>{name}</strong> — {desc}</span>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                    onClick={handleProcess}
                    disabled={!file || status === 'processing'}
                    style={{
                        flex: 1, padding: '12px 20px', borderRadius: 8,
                        background: '#6366f1', color: '#fff', border: 'none',
                        cursor: (!file || status === 'processing') ? 'not-allowed' : 'pointer',
                        opacity: (!file || status === 'processing') ? 0.6 : 1,
                        fontWeight: 600, fontSize: '0.9rem', minWidth: 140
                    }}
                >
                    {status === 'processing' ? '⏳ Processing…' : '🎛️ Clean Audio'}
                </button>
                {file && (
                    <button
                        onClick={handleReset}
                        style={{
                            padding: '12px 18px', borderRadius: 8, background: 'transparent',
                            border: '1px solid var(--border-color, #374151)',
                            color: 'var(--text-primary, #e5e7eb)', cursor: 'pointer',
                            fontWeight: 600, fontSize: '0.9rem'
                        }}
                    >
                        Reset
                    </button>
                )}
            </div>

            {processedUrl && (
                <div style={{
                    marginTop: 20, padding: 16, borderRadius: 10,
                    border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)'
                }}>
                    <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#22c55e' }}>✅ Processed audio ready</p>
                    <audio src={processedUrl} controls style={{ width: '100%', marginBottom: 12 }} />
                    <a
                        href={processedUrl}
                        download={processedName}
                        style={{
                            display: 'inline-block', padding: '10px 18px', borderRadius: 8,
                            background: '#22c55e', color: '#fff', textDecoration: 'none',
                            fontWeight: 600, fontSize: '0.9rem'
                        }}
                    >
                        ⬇️ Download {processedName}
                    </a>
                </div>
            )}
        </div>
    );
}
