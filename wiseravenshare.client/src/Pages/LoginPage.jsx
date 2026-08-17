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
    const [loginRevealed, setLoginRevealed] = useState(false);
    const [isAdminLoginVisible, setIsAdminLoginVisible] = useState(false);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

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
            const dataUrl = await readFileAsDataUrl(file);
            setAvatarFile(file);
            setAvatarPreview(dataUrl);
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

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setAvatarPreview(dataUrl); setAvatarFile(null); stopCamera();
    };

    const submit = async () => {
        setError('');
        setInfo('');
        const loginValue = email.trim();

        if (mode === 'signup') {
            if (!loginValue || !password.trim() || !name.trim()) { setError('Please fill all required fields.'); return; }
            if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        } else if (mode === 'login') {
            if (!loginValue || !password.trim()) { setError('Please fill all required fields.'); return; }
        } else if (mode === 'teamInvite') {
            if (!loginValue || !password.trim() || !inviteToken.trim()) { setError('Email, invite token, and password are required.'); return; }
            if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
        } else if (mode === 'forgot') {
            if (!loginValue) { setError('Please enter your email address.'); return; }
        } else if (mode === 'reset') {
            if (!resetToken.trim() || !password.trim()) { setError('Reset token and new password are required.'); return; }
            if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
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
            window.localStorage.removeItem(AUTH_DRAFT_KEY);
        } catch (err) {
            setError(err.message || 'Authentication failed. Please check your credentials and try again.');
        }
    };

    const startSocialAuth = (providerId) => {
        if (typeof window === 'undefined') return;
        setError('');
        const returnUrl = `${window.location.origin}${window.location.pathname}`;
        const endpoint = authService.getSocialLoginStartUrl(providerId, returnUrl);
        window.location.assign(endpoint);
    };

    return (
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', padding: '20px' }}>
            <div style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', padding: '40px', width: '100%', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                        <div style={{ width: '60px', height: '60px' }}><WiseRavenLogo /></div>
                    </div>
                    {error && <p style={{ color: '#f87171', marginBottom: '12px' }}>{error}</p>}
                    {info && <p style={{ color: '#93c5fd', marginBottom: '12px' }}>{info}</p>}

                    {mode === 'login' && <SignIn email={email} setEmail={setEmail} password={password} setPassword={setPassword} setMode={setMode} submit={submit} setError={setError} setInfo={setInfo} isAdminLoginVisible={isAdminLoginVisible} setIsAdminLoginVisible={setIsAdminLoginVisible} loginRevealed={loginRevealed} setLoginRevealed={setLoginRevealed} />}
                    {mode === 'signup' && <SignUp name={name} setName={setName} email={email} setEmail={setEmail} password={password} setPassword={setPassword} bio={bio} setBio={setBio} location={location} setLocation={setLocation} website={website} setWebsite={setWebsite} referralCode={referralCode} setReferralCode={setReferralCode} avatarPreview={avatarPreview} handleAvatarChange={handleAvatarChange} cameraOpen={cameraOpen} startCamera={startCamera} capturePhoto={capturePhoto} stopCamera={stopCamera} cameraError={cameraError} videoRef={videoRef} canvasRef={canvasRef} setMode={setMode} submit={submit} setError={setError} setInfo={setInfo} isAdminLoginVisible={isAdminLoginVisible} setIsAdminLoginVisible={setIsAdminLoginVisible} />}
                    {mode === 'teamInvite' && <TeamInvite name={name} setName={setName} email={email} setEmail={setEmail} inviteToken={inviteToken} setInviteToken={setInviteToken} password={password} setPassword={setPassword} setMode={setMode} submit={submit} setError={setError} setInfo={setInfo} isAdminLoginVisible={isAdminLoginVisible} setIsAdminLoginVisible={setIsAdminLoginVisible} />}
                    {mode === 'forgot' && <ForgotPassword email={email} setEmail={setEmail} setMode={setMode} submit={submit} setError={setError} setInfo={setInfo} />}
                    {mode === 'reset' && <ResetPassword resetToken={resetToken} setResetToken={setResetToken} password={password} setPassword={setPassword} submit={submit} />}
                    {(mode === 'login' || mode === 'signup') && (
                        <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {SOCIAL_PROVIDERS.map((provider) => (
                                <button
                                    key={provider.id}
                                    type="button"
                                    onClick={() => startSocialAuth(provider.id)}
                                    style={{
                                        width: '100%',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-color)',
                                        background: 'transparent',
                                        color: 'var(--text-color)',
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        fontWeight: 600
                                    }}
                                >
                                    {provider.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
export default LoginPage;
