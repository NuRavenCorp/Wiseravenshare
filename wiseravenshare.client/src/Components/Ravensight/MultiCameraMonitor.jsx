/**
 * MultiCameraMonitor.jsx
 *
 * Up to three independent virtual monitors, each sourced from a distinct
 * camera device (or the same device shared across monitors for different
 * angle/zoom framing). Users choose how many monitors are active (1, 2, or 3)
 * and assign any enumerated video-input device to each slot independently.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaVideo, FaVideoSlash, FaExpand, FaCompress, FaSync } from 'react-icons/fa';

const MONITOR_LABELS = ['Monitor A', 'Monitor B', 'Monitor C'];
const MAX_MONITORS = 3;

const stopStream = (stream) => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
};

const Monitor = ({ label, devices, active, onToggle }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [deviceId, setDeviceId] = useState('');
    const [error, setError] = useState('');
    const [fullscreen, setFullscreen] = useState(false);
    const [mirror, setMirror] = useState(true);
    const containerRef = useRef(null);

    // Set default device once device list is available
    useEffect(() => {
        if (devices.length > 0 && !deviceId) {
            setDeviceId(devices[0].deviceId);
        }
    }, [devices, deviceId]);

    const startStream = useCallback(async (id) => {
        stopStream(streamRef.current);
        streamRef.current = null;
        setError('');
        if (!id || !active) return;
        try {
            const constraints = {
                video: id === '__default__' ? true : { deviceId: { exact: id } },
                audio: false,
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            setError(err?.message || 'Camera unavailable');
        }
    }, [active]);

    // React when device or active state changes
    useEffect(() => {
        if (active && deviceId) {
            startStream(deviceId);
        } else {
            stopStream(streamRef.current);
            streamRef.current = null;
            if (videoRef.current) videoRef.current.srcObject = null;
        }
        return () => {
            stopStream(streamRef.current);
            streamRef.current = null;
        };
    }, [active, deviceId, startStream]);

    const toggleFullscreen = async () => {
        if (!fullscreen) {
            try {
                await containerRef.current?.requestFullscreen?.();
                setFullscreen(true);
            } catch {}
        } else {
            try {
                await document.exitFullscreen?.();
                setFullscreen(false);
            } catch {}
        }
    };

    useEffect(() => {
        const handler = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handler);
        return () => document.removeEventListener('fullscreenchange', handler);
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: '#0d0f14',
                border: '1px solid #2a2d3a',
                borderRadius: 10,
                overflow: 'hidden',
            }}
        >
            {/* Monitor header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: '#16192a',
                borderBottom: '1px solid #2a2d3a',
                flexShrink: 0,
            }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                    {label}
                </span>
                <select
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    disabled={!active || devices.length === 0}
                    style={{
                        flex: 1,
                        background: '#0d0f14',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: 5,
                        padding: '2px 6px',
                        fontSize: 11,
                        cursor: 'pointer',
                    }}
                >
                    {devices.length === 0
                        ? <option value="">No cameras found</option>
                        : devices.map((d, i) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Camera ${i + 1}`}
                            </option>
                        ))
                    }
                </select>

                <button
                    onClick={() => setMirror((m) => !m)}
                    title={mirror ? 'Mirroring on' : 'Mirroring off'}
                    style={iconBtn}
                >
                    <FaSync size={11} color={mirror ? '#60a5fa' : '#64748b'} />
                </button>

                <button onClick={toggleFullscreen} title="Fullscreen" style={iconBtn}>
                    {fullscreen ? <FaCompress size={11} color="#94a3b8" /> : <FaExpand size={11} color="#94a3b8" />}
                </button>

                <button
                    onClick={onToggle}
                    title={active ? 'Deactivate monitor' : 'Activate monitor'}
                    style={iconBtn}
                >
                    {active
                        ? <FaVideo size={11} color="#22c55e" />
                        : <FaVideoSlash size={11} color="#ef4444" />
                    }
                </button>
            </div>

            {/* Video area */}
            <div style={{ position: 'relative', flex: 1, background: '#060810', minHeight: 160 }}>
                {active && !error && (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                            transform: mirror ? 'scaleX(-1)' : 'none',
                        }}
                    />
                )}

                {!active && (
                    <div style={offOverlay}>
                        <FaVideoSlash size={28} color="#334155" />
                        <span style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>Monitor off</span>
                    </div>
                )}

                {active && error && (
                    <div style={offOverlay}>
                        <FaVideoSlash size={28} color="#ef4444" />
                        <span style={{ color: '#ef4444', fontSize: 11, marginTop: 8, textAlign: 'center', padding: '0 12px' }}>
                            {error}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

const iconBtn = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '3px 5px',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
};

const offOverlay = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
};

const MultiCameraMonitor = () => {
    const [devices, setDevices] = useState([]);
    const [monitorCount, setMonitorCount] = useState(1);
    const [activeMonitors, setActiveMonitors] = useState([true, false, false]);
    const [devicesLoaded, setDevicesLoaded] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const loadDevices = useCallback(async () => {
        try {
            // Prompt for permission first so labels are populated
            await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
                .then((s) => s.getTracks().forEach((t) => t.stop()))
                .catch(() => {});

            const all = await navigator.mediaDevices.enumerateDevices();
            const videoInputs = all.filter((d) => d.kind === 'videoinput');
            setDevices(videoInputs);
            setDevicesLoaded(true);
        } catch {
            setPermissionDenied(true);
            setDevicesLoaded(true);
        }
    }, []);

    useEffect(() => {
        loadDevices();
        const onChange = () => loadDevices();
        navigator.mediaDevices?.addEventListener('devicechange', onChange);
        return () => navigator.mediaDevices?.removeEventListener('devicechange', onChange);
    }, [loadDevices]);

    const setCount = (n) => {
        setMonitorCount(n);
        setActiveMonitors((prev) => {
            const next = [...prev];
            for (let i = 0; i < MAX_MONITORS; i++) {
                if (i >= n) next[i] = false;
                else if (i === 0) next[i] = true; // always activate at least monitor A
            }
            return next;
        });
    };

    const toggleMonitor = (i) => {
        setActiveMonitors((prev) => {
            const next = [...prev];
            next[i] = !next[i];
            return next;
        });
    };

    if (permissionDenied) {
        return (
            <div style={{ padding: 24, color: '#ef4444', textAlign: 'center' }}>
                <FaVideoSlash size={32} style={{ marginBottom: 12 }} />
                <p style={{ fontWeight: 700 }}>Camera permission denied</p>
                <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
                    Allow camera access in your browser settings to use Multi-Cam monitors.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Controls bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                background: '#16192a',
                borderRadius: 8,
                border: '1px solid #2a2d3a',
                flexWrap: 'wrap',
            }}>
                <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600 }}>MONITORS</span>

                {[1, 2, 3].map((n) => (
                    <button
                        key={n}
                        onClick={() => setCount(n)}
                        style={{
                            padding: '4px 14px',
                            borderRadius: 6,
                            border: '1px solid',
                            borderColor: monitorCount === n ? '#60a5fa' : '#334155',
                            background: monitorCount === n ? '#1e3a5f' : 'transparent',
                            color: monitorCount === n ? '#93c5fd' : '#64748b',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                        }}
                    >
                        {n}
                    </button>
                ))}

                <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 11 }}>
                    {devicesLoaded
                        ? `${devices.length} camera${devices.length !== 1 ? 's' : ''} detected`
                        : 'Detecting cameras…'}
                </span>

                <button
                    onClick={loadDevices}
                    title="Refresh device list"
                    style={{ ...iconBtn, padding: '4px 8px', border: '1px solid #334155', borderRadius: 6 }}
                >
                    <FaSync size={11} color="#64748b" />
                </button>
            </div>

            {/* Monitor grid */}
            <div style={{
                display: 'flex',
                gap: 10,
                alignItems: 'stretch',
                flexWrap: monitorCount === 3 ? 'wrap' : 'nowrap',
                minHeight: 220,
            }}>
                {Array.from({ length: monitorCount }).map((_, i) => (
                    <Monitor
                        key={i}
                        label={MONITOR_LABELS[i]}
                        devices={devices}
                        active={activeMonitors[i]}
                        onToggle={() => toggleMonitor(i)}
                    />
                ))}
            </div>

            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
                Each monitor streams its selected camera independently. Mirror toggles horizontal flip per monitor.
                Assign the same camera to multiple monitors for multi-angle framing, or different devices for split-source feeds.
            </p>
        </div>
    );
};

export default MultiCameraMonitor;
