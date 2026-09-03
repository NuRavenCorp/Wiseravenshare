import React, { useEffect, useRef, useState } from 'react';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';
import { authService } from '../Services/Auth.jsx';
import { SignIn } from './Auth/SignIn';
import { SignUp } from './Auth/SignUp';
import { TeamInvite } from './Auth/TeamInvite';
import { ForgotPassword } from './Auth/ForgotPassword';
import { ResetPassword } from './Auth/ResetPassword';

const AUTH_DRAFT_KEY = 'wiseAuthFormDraft';
const SOCIAL_PROVIDERS = [
    { id: 'google', label: 'Continue with Google' },
    { id: 'microsoft', label: 'Continue with Microsoft' },
    { id: 'facebook', label: 'Continue with Facebook' },
    { id: 'tiktok', label: 'Continue with TikTok' }
];

const MODE_COPY = {
    login: {
        title: 'Sign in',
        subtitle: 'Use your existing account to continue where you left off.'
    },
    signup: {
        title: 'Create account',
        subtitle: 'Join the community with a verified email and strong password.'
    },
    teamInvite: {
        title: 'Team invite',
        subtitle: 'Activate a teammate account with the invite token you received.'
    },
    forgot: {
        title: 'Reset password',
        subtitle: 'Request a reset link for the email on your account.'
    },
    reset: {
        title: 'Set a new password',
        subtitle: 'Use the reset token from your email to finish recovery.'
    }
};

const MODE_PILLS = [
    ['login', 'Sign in'],
    ['signup', 'Create account'],
    ['teamInvite', 'Team invite'],
    ['forgot', 'Forgot'],
    ['reset', 'Reset']
];

const readAuthDraft = () => {
    if (typeof window === 'undefined') return null;
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
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const changeMode = (nextMode) => {
        setMode(nextMode);
        setError('');
        setInfo('');
    };

    useEffect(() => {
        let mounted = true;
        authService.getStatus()
            .then((status) => {
                if (!mounted) return;
                const enabled = Boolean(status?.selfRegistrationEnabled);
                setSelfRegistrationEnabled(enabled);
                if (!enabled) setMode('login');
            })
            .catch(() => {
                if (mounted) {
                    // Keep public auth flow available when status probe is temporarily unreachable.
                    setSelfRegistrationEnabled(true);
                }
            });
        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const authToken = params.get('authToken') || '';
        const refreshToken = params.get('refreshToken') || '';
        const adminPassToken = params.get('adminPassToken') || '';
        const socialError = params.get('socialAuthError') || '';

        if (socialError.trim()) {
            setError(socialError.trim());
            params.delete('socialAuthError');
            params.delete('authProvider');
            const next = params.toString();
            window.history.replaceState({}, '', `${window.location.pathname}${next ? `?${next}` : ''}`);
            return;
        }

        if (!authToken.trim()) return;

        authService.setToken(authToken.trim());
        authService.setRefreshToken(refreshToken.trim());
        authService.setAdminPassToken(adminPassToken.trim());
        window.localStorage.removeItem(AUTH_DRAFT_KEY);

        params.delete('authToken');
        params.delete('refreshToken');
        params.delete('adminPassToken');
        params.delete('authProvider');
        const next = params.toString();
        window.history.replaceState({}, '', `${window.location.pathname}${next ? `?${next}` : ''}`);
        window.location.reload();
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const referralFromUrl = params.get('ref') || params.get('referral') || params.get('referralCode');
        const teamTokenFromUrl = params.get('teamToken') || params.get('inviteToken') || params.get('memberToken');
        const emailFromUrl = params.get('email') || '';

        if (teamTokenFromUrl?.trim()) {
            setInviteToken(teamTokenFromUrl.trim());
            if (emailFromUrl.trim()) setEmail(emailFromUrl.trim());
            setMode('teamInvite');
            setInfo('Team access token detected. Set your password to activate your team login.');
            return;
        }

        const normalizedCode = referralFromUrl?.trim();
        if (!normalizedCode) return;

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
        if (typeof window === 'undefined') return;
        const payload = { mode, name, email, password, resetToken, bio, location, website, referralCode, inviteToken, avatarPreview, info };
        window.localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify(payload));
    }, [mode, name, email, password, resetToken, bio, location, website, referralCode, inviteToken, avatarPreview, info]);

    useEffect(() => {
        if (cameraOpen && videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraOpen, cameraStream]);

    useEffect(() => () => {
        if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
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
            const compressed = await compressAvatarImage(file, 180, 60000);
            setAvatarFile(file);
            setAvatarPreview(compressed);
            setCameraError('');
        } catch (err) {
            setError(err.message || 'Unable to load photo.');
        }
    };

    const startCamera = async () => {
        setError(''); setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream); setCameraOpen(true);
        } catch (err) {
            setCameraError('Camera access was denied or is unavailable on this device.');
        }
    };

    const stopCamera = () => {
        if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null); setCameraOpen(false);
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        try {
            const compressed = await compressAvatarImage(dataUrl, 180, 60000);
            setAvatarPreview(compressed);
        } catch {
            setAvatarPreview(dataUrl);
        }
        setAvatarFile(null);
        stopCamera();
    };

    const submit = async () => {
        setError('');
        setInfo('');
        const loginValue = email.trim();

        const meetsPasswordPolicy = (pwd) => pwd.length >= 8 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd);

        if (mode === 'signup') {
            if (!loginValue || !password.trim() || !name.trim()) { setError('Please fill all required fields.'); return; }
            if (!meetsPasswordPolicy(password)) { setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'); return; }
        } else if (mode === 'login') {
            if (!loginValue || !password.trim()) { setError('Please fill all required fields.'); return; }
        } else if (mode === 'teamInvite') {
            if (!loginValue || !password.trim() || !inviteToken.trim()) { setError('Email, invite token, and password are required.'); return; }
            if (!meetsPasswordPolicy(password)) { setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'); return; }
        } else if (mode === 'forgot') {
            if (!loginValue) { setError('Please enter your email address.'); return; }
        } else if (mode === 'reset') {
            if (!resetToken.trim() || !password.trim()) { setError('Reset token and new password are required.'); return; }
            if (!meetsPasswordPolicy(password)) { setError('Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'); return; }
        }

        try {
            if (mode === 'forgot') {
                const response = await authService.requestPasswordReset(loginValue);
                if (response?.resetToken) {
                    setResetToken(response.resetToken); setMode('reset');
                    setInfo('Reset token generated. Enter a new password to finish reset.');
                } else {
                    setInfo(response?.message || 'If your account exists, reset instructions have been sent.');
                }
                return;
            }
            if (mode === 'reset') {
                await authService.resetPassword(resetToken.trim(), password.trim());
                setMode('login'); setPassword(''); setResetToken('');
                setInfo('Password reset successful. Sign in with your new password.');
                return;
            }
            await onAuth?.({ mode, name, email: loginValue, password, bio, location, website, avatar: avatarPreview, avatarFile, referralCode, inviteToken });
            if (mode !== 'signup') {
                window.localStorage.removeItem(AUTH_DRAFT_KEY);
            }
        } catch (err) {
            setError(err.message || 'Authentication failed. Please check your credentials and try again.');
        }
    };

    const startSocialAuth = (providerId) => {
        if (typeof window === 'undefined') return;
        setError('');
        const returnUrl = `${window.location.origin}${window.location.pathname}`;
        authService.socialLogin(providerId, returnUrl)
            .then((response) => {
                if (response?.token) {
                    window.location.reload();
                }
            })
            .catch((err) => {
                setError(err?.message || 'Social sign-in failed.');
            });
    };

    const modeDetails = MODE_COPY[mode] || MODE_COPY.login;

    return (
        <div style={{
            minHeight: '100vh',
            background: 'radial-gradient(circle at top left, rgba(255, 201, 94, 0.16), transparent 28%), radial-gradient(circle at top right, rgba(153, 102, 255, 0.16), transparent 24%), var(--bg-color)',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <div style={{
                position: 'absolute',
                inset: 'auto -6% 64% auto',
                width: '340px',
                height: '340px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.04)',
                filter: 'blur(18px)',
                pointerEvents: 'none'
            }} />
            <div style={{
                position: 'absolute',
                inset: '16% auto auto -8%',
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                background: 'rgba(255, 201, 94, 0.08)',
                filter: 'blur(22px)',
                pointerEvents: 'none'
            }} />

            <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'grid', gridTemplateRows: 'auto 1fr', gap: '24px', padding: '24px' }}>
                <header style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 16px',
                        borderRadius: '999px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.04)',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.15)'
                    }}>
                        <WiseRavenLogo size="compact" showTagline={false} />
                        <span style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                        <span style={{ color: 'var(--light-color)', fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                            Trusted access for Wiseravenshare
                        </span>
                    </div>
                </header>

                <div style={{
                    width: '100%',
                    maxWidth: '1180px',
                    margin: '0 auto',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                    gap: '24px',
                    alignItems: 'stretch'
                }}>
                    <aside style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.03))',
                        border: '1px solid var(--border-color)',
                        borderRadius: '28px',
                        padding: '32px',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.24)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '100%'
                    }}>
                        <div>
                            <div style={{ marginBottom: '24px' }}>
                                <WiseRavenLogo size="hero" showTagline />
                            </div>
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 12px',
                                borderRadius: '999px',
                                background: 'rgba(255, 201, 94, 0.12)',
                                border: '1px solid rgba(255, 201, 94, 0.22)',
                                color: 'var(--highlight-color)',
                                fontSize: '12px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase'
                            }}>
                                Secure access
                            </div>
                            <h1 style={{ margin: '18px 0 12px', fontSize: '2.4rem', lineHeight: 1.05 }}>
                                One place to sign in, join, or recover access.
                            </h1>
                            <p style={{ margin: 0, color: 'var(--light-color)', lineHeight: 1.7, fontSize: '15px' }}>
                                Use your existing account, create a new one, or activate a team invite with a guided flow that keeps the next step obvious.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '12px', marginTop: '28px' }}>
                            {[
                                'Fast sign in with clear recovery if you forget your password',
                                'New account setup that keeps your draft saved on this device',
                                'Team invite activation for approved members only'
                            ].map((item) => (
                                <div key={item} style={{
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'flex-start',
                                    padding: '12px 14px',
                                    borderRadius: '16px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    color: 'var(--text-color)',
                                    lineHeight: 1.5
                                }}>
                                    <span style={{ color: 'var(--highlight-color)', fontWeight: 900 }}>✓</span>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <main style={{
                        background: 'rgba(9, 13, 25, 0.82)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '28px',
                        padding: '28px',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.26)',
                        backdropFilter: 'blur(18px)'
                    }}>
                        <div style={{ display: 'grid', gap: '18px' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
                                gap: '10px'
                            }}>
                                {MODE_PILLS.map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => changeMode(value)}
                                        style={{
                                            borderRadius: '999px',
                                            border: mode === value ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: mode === value ? 'linear-gradient(135deg, var(--highlight-color), rgba(255, 201, 94, 0.82))' : 'rgba(255,255,255,0.03)',
                                            color: mode === value ? '#111827' : 'var(--text-color)',
                                            padding: '10px 12px',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            boxShadow: mode === value ? '0 10px 24px rgba(255, 201, 94, 0.18)' : 'none'
                                        }}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.8rem' }}>{modeDetails.title}</h2>
                                <p style={{ margin: '10px 0 0', color: 'var(--light-color)', lineHeight: 1.6 }}>
                                    {modeDetails.subtitle}
                                </p>
                            </div>

                            {error && (
                                <div style={{
                                    borderRadius: '14px',
                                    border: '1px solid rgba(248, 113, 113, 0.3)',
                                    background: 'rgba(248, 113, 113, 0.1)',
                                    color: '#fecaca',
                                    padding: '12px 14px'
                                }}>
                                    {error}
                                </div>
                            )}
                            {info && (
                                <div style={{
                                    borderRadius: '14px',
                                    border: '1px solid rgba(96, 165, 250, 0.3)',
                                    background: 'rgba(96, 165, 250, 0.1)',
                                    color: '#bfdbfe',
                                    padding: '12px 14px'
                                }}>
                                    {info}
                                </div>
                            )}
                        </div>

                        <div style={{ marginTop: '20px' }}>
                            <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center' }}>
                                    <WiseRavenLogo size="compact" showTagline={false} />
                                </div>
                                {mode === 'signup' && (
                                    <div style={{
                                        marginTop: '14px',
                                        borderRadius: '14px',
                                        border: '1px solid rgba(255, 201, 94, 0.22)',
                                        background: 'rgba(255, 201, 94, 0.08)',
                                        color: 'var(--text-color)',
                                        padding: '10px 12px',
                                        fontSize: '12px',
                                        lineHeight: 1.5,
                                        textAlign: 'left'
                                    }}>
                                        Your signup draft stays saved on this device while you finish later.
                                    </div>
                                )}
                            </div>

                            <div style={{ maxWidth: '620px', margin: '0 auto' }}>
                                {mode === 'login' && <SignIn email={email} setEmail={setEmail} password={password} setPassword={setPassword} setMode={changeMode} submit={submit} setError={setError} setInfo={setInfo} />}
                                {mode === 'signup' && <SignUp name={name} setName={setName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} setMode={changeMode} submit={submit} setError={setError} setInfo={setInfo} />}
                                {mode === 'teamInvite' && <TeamInvite name={name} setName={setName} email={email} setEmail={setEmail} inviteToken={inviteToken} setInviteToken={setInviteToken} password={password} setPassword={setPassword} setMode={changeMode} submit={submit} setError={setError} setInfo={setInfo} />}
                                {mode === 'forgot' && <ForgotPassword email={email} setEmail={setEmail} setMode={changeMode} submit={submit} setError={setError} setInfo={setInfo} />}
                                {mode === 'reset' && <ResetPassword resetToken={resetToken} setResetToken={setResetToken} password={password} setPassword={setPassword} submit={submit} />}
                            </div>

                            {(mode === 'login' || mode === 'signup') && (
                                <div style={{ marginTop: '22px' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        color: 'var(--light-color)',
                                        marginBottom: '12px',
                                        fontSize: '13px'
                                    }}>
                                        <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                                        <span>Or continue with</span>
                                        <span style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
                                    </div>
                                    <div style={{ display: 'grid', gap: '10px' }}>
                                        {SOCIAL_PROVIDERS.map((provider) => (
                                            <button
                                                key={provider.id}
                                                type="button"
                                                onClick={() => startSocialAuth(provider.id)}
                                                style={{
                                                    width: '100%',
                                                    borderRadius: '14px',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'rgba(255,255,255,0.03)',
                                                    color: 'var(--text-color)',
                                                    padding: '12px 14px',
                                                    cursor: 'pointer',
                                                    fontWeight: 700
                                                }}
                                            >
                                                {provider.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
};
export default LoginPage;
