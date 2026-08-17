import React from 'react';

export const SignUp = ({
    name, setName, email, setEmail, password, setPassword, bio, setBio,
    location, setLocation, website, setWebsite, referralCode, setReferralCode,
    avatarPreview, handleAvatarChange, cameraOpen, startCamera, capturePhoto,
    stopCamera, cameraError, videoRef, canvasRef, setMode, submit, setError,
    setInfo, isAdminLoginVisible, setIsAdminLoginVisible
}) => (
    <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <button
                onClick={() => { setMode('login'); setError(''); setInfo(''); setIsAdminLoginVisible(false); }}
                style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
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
                    background: 'var(--highlight-color)',
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
                    background: 'transparent',
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
                    background: isAdminLoginVisible ? 'var(--highlight-color)' : 'transparent',
                    color: 'var(--text-color)',
                    cursor: 'pointer'
                }}
            >
                Admin login only
            </button>
        </div>

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
            Create Account
        </button>
    </>
);