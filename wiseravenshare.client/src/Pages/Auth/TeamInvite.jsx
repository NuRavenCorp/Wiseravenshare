import React from 'react';

export const TeamInvite = ({ name, setName, email, setEmail, inviteToken, setInviteToken, password, setPassword, setMode, submit, setError, setInfo, isAdminLoginVisible, setIsAdminLoginVisible }) => (
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
                    background: 'var(--highlight-color)',
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
            placeholder="Create pass key (password) to join"
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
    </>
);