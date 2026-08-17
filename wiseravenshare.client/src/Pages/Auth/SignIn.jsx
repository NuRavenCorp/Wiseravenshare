import React from 'react';

export const SignIn = ({ email, setEmail, password, setPassword, setMode, submit, setError, setInfo, isAdminLoginVisible, setIsAdminLoginVisible, loginRevealed, setLoginRevealed }) => (
    <>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
            <button
                onClick={() => { setMode('login'); setError(''); setInfo(''); setIsAdminLoginVisible(false); }}
                style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--highlight-color)',
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
                    background: 'transparent',
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

        {isAdminLoginVisible && !loginRevealed && (
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

        {isAdminLoginVisible && loginRevealed && (
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
    </>
);