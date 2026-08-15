import React, { useEffect, useRef, useState } from 'react';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';
import { authService } from '../Services/Auth.jsx';

const AUTH_DRAFT_KEY = 'wiseAuthFormDraft';

const readAuthDraft = () => {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(AUTH_DRAFT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const LoginPage = ({ onAuth }) => {
    const initialDraft = readAuthDraft();
    const [mode, setMode] = useState(initialDraft?.mode || 'login');
    const [name, setName] = useState(initialDraft?.name || '');
    const [email, setEmail] = useState(initialDraft?.email || '');
    const [password, setPassword] = useState(initialDraft?.password || '');
    const [resetToken, setResetToken] = useState(initialDraft?.resetToken || '');
    const [bio, setBio] = useState(initialDraft?.bio || '');
    const [location, setLocation] = useState(initialDraft?.location || '');
    const [website, setWebsite] = useState(initialDraft?.website || '');
    const [referralCode, setReferralCode] = useState(initialDraft?.referralCode || '');
    const [inviteToken, setInviteToken] = useState(initialDraft?.inviteToken || '');
    const [avatarFile, setAvatarFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState(initialDraft?.avatarPreview || '');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [cameraStream, setCameraStream] = useState(null);
    const [error, setError] = useState('');
    const [info, setInfo] = useState(initialDraft?.info || '');
    const [selfRegistrationEnabled, setSelfRegistrationEnabled] = useState(true);
    const [loginRevealed, setLoginRevealed] = useState(false);
    const [isAdminLoginVisible, setIsAdminLoginVisible] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        let mounted = true;

        authService.getStatus()
            .then((status) => {
                if (!mounted) {
                    return;
                }

                const enabled = Boolean(status?.selfRegistrationEnabled);
                setSelfRegistrationEnabled(enabled);
                if (!enabled) {
                    setMode('login');
                }
            })
            .catch(() => {
                if (mounted) {
                    setSelfRegistrationEnabled(false);
                    setMode('login');
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const referralFromUrl =
            params.get('ref') ||
            params.get('referral') ||
            params.get('referralCode');
        const teamTokenFromUrl =
            params.get('teamToken') ||
            params.get('inviteToken') ||
            params.get('memberToken');
        const emailFromUrl = params.get('email') || '';

        if (teamTokenFromUrl?.trim()) {
            setInviteToken(teamTokenFromUrl.trim());
            if (emailFromUrl.trim()) {
                setEmail(emailFromUrl.trim());
            }
            setMode('teamInvite');
            setInfo('Team access token detected. Set your password to activate your team login.');
            return;
        }

        const normalizedCode = referralFromUrl?.trim();
        if (!normalizedCode) {
            return;
        }

        if (selfRegistrationEnabled) {
            setReferralCode(normalizedCode);
            setMode('signup');
            setInfo('Referral code detected. Complete signup to redeem it.');
            return;
        }

        setReferralCode(normalizedCode);
        setMode('login');
        setInfo('Admin-only access is enabled. Sign in with the configured admin account.');
    }, [selfRegistrationEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const payload = {
            mode,
            name,
            email,
            password,
            resetToken,
            bio,
            location,
            website,
            referralCode,
            inviteToken,
            avatarPreview,
            info
        };

        window.localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(payload));
    }, [mode, name, email, password, resetToken, bio, location, website, referralCode, inviteToken, avatarPreview, info]);

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

    const clearAuthDraft = () => {
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(AUTH_DRAFT_KEY);
        }
    };

    const submit = async () => {
        setError('');
        setInfo('');

        const loginValue = email.trim();

        if (mode === 'signup') {
            if (!loginValue || !password.trim() || !name.trim()) {
                setError('Please fill all required fields.');
                return;
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(loginValue)) {
                setError('Please enter a valid email address.');
                return;
            }

            if (password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
            }
        } else if (mode === 'login') {
            if (!loginValue || !password.trim()) {
                setError('Please fill all required fields.');
                return;
            }
        } else if (mode === 'teamInvite') {
            if (!loginValue || !password.trim() || !inviteToken.trim()) {
                setError('Email, invite token, and password are required.');
                return;
            }

            if (password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
            }
        } else if (mode === 'forgot') {
            if (!loginValue) {
                setError('Please enter your email address.');
                return;
            }
        } else if (mode === 'reset') {
            if (!resetToken.trim() || !password.trim()) {
                setError('Reset token and new password are required.');
                return;
            }

            if (password.length < 8) {
                setError('Password must be at least 8 characters.');
                return;
            }
        }

        try {
            if (mode === 'forgot') {
                const response = await authService.requestPasswordReset(loginValue);
                if (response?.resetToken) {
                    setResetToken(response.resetToken);
                    setMode('reset');
                    setInfo('Reset token generated. Enter a new password to finish reset.');
                } else {
                    setInfo(response?.message || 'If your account exists, reset instructions have been sent.');
                }
                return;
            }

            if (mode === 'reset') {
                await authService.resetPassword(resetToken.trim(), password.trim());
                setMode('login');
                setPassword('');
                setResetToken('');
                setInfo('Password reset successful. Sign in with your new password.');
                return;
            }

            await onAuth?.({
                mode,
                name,
                email: loginValue,
                password,
                bio,
                location,
                website,
                avatar: avatarPreview,
                avatarFile,
                referralCode,
                inviteToken
            });
            clearAuthDraft();
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
                <div
                    className="ancient-warning-banner"
                    style={{
                        marginBottom: '18px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 176, 77, 0.7)',
                        background: 'linear-gradient(135deg, rgba(118, 45, 18, 0.8), rgba(255, 82, 82, 0.2), rgba(76, 35, 18, 0.75))',
                        color: '#fff4d6',
                        fontWeight: 800,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        boxShadow: 'inset 0 0 18px rgba(255, 214, 120, 0.18), 0 0 18px rgba(255, 160, 74, 0.2)'
                    }}
                >
                    Liars, beware.
                </div>
                <h2 style={{ marginBottom: '12px' }}>
                    {mode === 'signup' && 'Create Account'}
                    {mode === 'login' && 'Sign In'}
                    {mode === 'teamInvite' && 'Team Invite Access'}
                    {mode === 'forgot' && 'Forgot Password'}
                    {mode === 'reset' && 'Reset Password'}
                </h2>
                <div style={{ marginBottom: '20px', color: 'var(--light-color)', lineHeight: 1.6 }}>
                    <p style={{ margin: 0 }}>
                        in ancient Egypt it was considered a terribe crime to knowingly lie. Things like the All seeing eye was mean to invoke that whether you kn ew it or not, the Gods were watching. Real men and women did not degrade themselves by lying, it was/ is and always will be a cowardly act.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <button
                        onClick={() => { setMode('login'); setError(''); setInfo(''); setIsAdminLoginVisible(false); }}
                        style={{
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
                        onClick={() => { setMode('signup'); setError(''); setInfo(''); setIsAdminLoginVisible(false); }}
                        style={{
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
                    <button
                        onClick={() => { setMode('teamInvite'); setError(''); setInfo(''); setIsAdminLoginVisible(false); }}
                        style={{
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: mode === 'teamInvite' ? 'var(--highlight-color)' : 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}
                    >
                        Team Invite
                    </button>
                    <button
                        onClick={() => { setMode('login'); setError(''); setInfo(''); setIsAdminLoginVisible(true); }}
                        style={{
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: isAdminLoginVisible || mode === 'admin' ? 'var(--highlight-color)' : 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}
                    >
                        Admin login only
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
                        <input
                            type="text"
                            placeholder="Referral code (optional)"
                            value={referralCode}
                            onChange={(e) => setReferralCode(e.target.value)}
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

                {mode === 'teamInvite' && (
                    <>
                        <input
                            type="text"
                            placeholder="Full name (optional)"
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
                        <input
                            type="text"
                            placeholder="Team invite token"
                            value={inviteToken}
                            onChange={(e) => setInviteToken(e.target.value)}
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
                    </>
                )}

                {mode !== 'reset' && (
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
                )}

                {mode === 'reset' && (
                    <input
                        type="text"
                        placeholder="Reset token"
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
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
                )}

                {mode !== 'forgot' && (
                    <input
                        type="password"
                        placeholder={mode === 'reset' ? 'New password' : 'Password'}
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
                )}

                {mode === 'login' && (
                    <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                        style={{
                            width: '100%',
                            marginBottom: '12px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--light-color)',
                            textAlign: 'right',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        Forgot password?
                    </button>
                )}

                {mode === 'forgot' && (
                    <button
                        type="button"
                        onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                        style={{
                            width: '100%',
                            marginBottom: '12px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--light-color)',
                            textAlign: 'left',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        Back to login
                    </button>
                )}

                {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
                {info && <p style={{ color: '#93c5fd', marginBottom: '12px' }}>{info}</p>}

                {mode === 'login' && (
                    <button
                        type="button"
                        onClick={submit}
                        style={{
                            width: '100%',
                            padding: '12px',
                            border: 'none',
                            borderRadius: '8px',
                            background: 'var(--highlight-color)',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            marginBottom: '12px'
                        }}
                    >
                        Sign In
                    </button>
                )}

                {mode === 'login' && isAdminLoginVisible && !loginRevealed && (
                    <button
                        type="button"
                        onClick={() => { setLoginRevealed(true); setInfo('Admin login revealed. Use the admin credential field below.'); }}
                        style={{
                            width: '100%',
                            padding: '12px',
                            border: '1px dashed var(--border-color)',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--light-color)',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Reveal admin login
                    </button>
                )}

                {mode === 'login' && isAdminLoginVisible && loginRevealed && (
                    <button
                        type="button"
                        onClick={submit}
                        onDoubleClick={() => { setLoginRevealed(false); setInfo('Admin login hidden. Click reveal admin login to access it again.'); }}
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
                        Continue as Admin
                    </button>
                )}

                {mode !== 'login' && (
                    <button
                        type="button"
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
                        {mode === 'signup' && 'Create Account'}
                        {mode === 'teamInvite' && 'Activate Team Access'}
                        {mode === 'forgot' && 'Request Reset Token'}
                        {mode === 'reset' && 'Set New Password'}
                    </button>
                )}
                <p style={{ marginTop: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--light-color)' }}>
                    By using Wise-Ravens you agree to our{' '}
                    <a
                        href="https://wise-ravens.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--highlight-color)', textDecoration: 'underline' }}
                    >
                        Privacy Policy
                    </a>.
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
