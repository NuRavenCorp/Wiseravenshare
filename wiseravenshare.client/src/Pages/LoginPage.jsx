import React, { useEffect, useRef, useState } from 'react';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';

const LoginPage = ({ onAuth }) => {
    const [mode, setMode] = useState('login');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [bio, setBio] = useState('');
    const [location, setLocation] = useState('');
    const [website, setWebsite] = useState('');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState('');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [cameraStream, setCameraStream] = useState(null);
    const [error, setError] = useState('');
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (cameraOpen && videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraOpen, cameraStream]);

    useEffect(() => () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
        }
    }, [cameraStream]);

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });

    const handleAvatarChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Profile photo must be an image file.');
            return;
        }

        try {
            const dataUrl = await readFileAsDataUrl(file);
            setAvatarFile(file);
            setAvatarPreview(dataUrl);
            setCameraError('');
        } catch (err) {
            setError(err.message || 'Unable to load photo.');
        }
    };

    const startCamera = async () => {
        setError('');
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream);
            setCameraOpen(true);
        } catch (err) {
            setCameraError('Camera access was denied or is unavailable on this device.');
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
        }
        setCameraStream(null);
        setCameraOpen(false);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setAvatarPreview(dataUrl);
        setAvatarFile(null);
        stopCamera();
    };

    const submit = async () => {
        setError('');

        if (!email.trim() || !password.trim() || (mode === 'signup' && !name.trim())) {
            setError('Please fill all required fields.');
            return;
        }

        const emailValue = email.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailValue)) {
            setError('Please enter a valid email address.');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }

        try {
            await onAuth?.({
                mode,
                name,
                email: emailValue,
                password,
                bio,
                location,
                website,
                avatar: avatarPreview,
                avatarFile
            });
        } catch (err) {
            setError(err?.message || 'Authentication failed.');
        }
    };

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, var(--primary-color), var(--bg-color))'
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '420px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '28px',
                    boxShadow: '0 24px 60px rgba(3, 8, 20, 0.28)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '22px' }}>
                    <WiseRavenLogo size="hero" />
                </div>
                <h2 style={{ marginBottom: '12px' }}>{mode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
                <p style={{ marginBottom: '20px', color: 'var(--light-color)' }}>
                    {mode === 'signup' ? 'Sign up to start posting and messaging.' : 'Sign in to your account.'}
                </p>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button
                        onClick={() => setMode('login')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: mode === 'login' ? 'var(--highlight-color)' : 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}
                    >
                        Login
                    </button>
                    <button
                        onClick={() => setMode('signup')}
                        style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: mode === 'signup' ? 'var(--highlight-color)' : 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}
                    >
                        Sign Up
                    </button>
                </div>

                {mode === 'signup' && (
                    <>
                        <input
                            type="text"
                            placeholder="Full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <textarea
                            placeholder="Bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            rows="2"
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)',
                                resize: 'vertical'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Location"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <input
                            type="url"
                            placeholder="Website"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <label style={{ display: 'block', marginBottom: '8px', color: 'var(--light-color)' }}>
                            Profile photo
                        </label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarChange}
                            style={{
                                width: '100%',
                                marginBottom: '12px',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            {!cameraOpen ? (
                                <button
                                    type="button"
                                    onClick={startCamera}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'transparent',
                                        color: 'var(--text-color)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Take Photo
                                </button>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={capturePhoto}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: 'var(--highlight-color)',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Capture
                                    </button>
                                    <button
                                        type="button"
                                        onClick={stopCamera}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel Camera
                                    </button>
                                </>
                            )}
                        </div>
                        {cameraError && <p style={{ color: '#f87171', marginBottom: '12px' }}>{cameraError}</p>}
                        {cameraOpen && (
                            <div style={{ marginBottom: '12px' }}>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                                />
                                <canvas ref={canvasRef} style={{ display: 'none' }} />
                            </div>
                        )}
                        {avatarPreview && (
                            <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                                <img
                                    src={avatarPreview}
                                    alt="Profile preview"
                                    style={{ width: '68px', height: '68px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                                />
                            </div>
                        )}
                    </>
                )}

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                        width: '100%',
                        marginBottom: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)'
                    }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                        width: '100%',
                        marginBottom: '12px',
                        padding: '12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)'
                    }}
                />

                {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}

                <button
                    onClick={submit}
                    style={{
                        width: '100%',
                        padding: '12px',
                        border: 'none',
                        borderRadius: '8px',
                        background: 'var(--highlight-color)',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                    }}
                >
                    {mode === 'signup' ? 'Create Account' : 'Continue'}
                </button>
            </div>
        </div>
    );
};

export default LoginPage;
