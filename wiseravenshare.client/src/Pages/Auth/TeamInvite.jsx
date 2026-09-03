import React from 'react';

export const TeamInvite = ({ name, setName, email, setEmail, inviteToken, setInviteToken, password, setPassword, setMode, submit, setError, setInfo }) => (
    <>
        <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--light-color)', lineHeight: 1.4 }}>
            Enter the invite token you received, then create your password to activate access.
        </div>

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
            placeholder="Paste your team invite token"
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
            placeholder="Create a password to join"
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
            Activate Team Access
        </button>
        <div style={{ fontSize: '13px', color: 'var(--light-color)' }}>
            Need to sign in instead?{' '}
            <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600
                }}
            >
                Go to sign in
            </button>
        </div>
    </>
);