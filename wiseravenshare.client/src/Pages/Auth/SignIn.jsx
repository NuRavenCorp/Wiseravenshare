import React from 'react';

export const SignIn = ({ email, setEmail, password, setPassword, setMode, submit, setError, setInfo }) => (
    <>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '6px' }}>
                    Email or Username
                </label>
                <input
                    type="text"
                    placeholder="Email or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)',
                        fontSize: '14px',
                        outline: 'none'
                    }}
                />
            </div>

            <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-color)' }}>
                        Password
                    </label>
                    <button
                        type="button"
                        onClick={() => { setMode('forgot'); setError(''); setInfo(''); }}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--light-color)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                    Need a password reset?
                    </button>
                </div>
                <input
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'var(--text-color)',
                        fontSize: '14px',
                        outline: 'none'
                    }}
                />
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.4 }}>
                    Use the email or username tied to your account.
                </div>
            </div>

            <button
                type="submit"
                style={{
                    width: '100%',
                    padding: '12px',
                    border: 'none',
                    borderRadius: '8px',
                    background: 'var(--highlight-color)',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '15px',
                    marginTop: '8px'
                }}
            >
                Sign In
            </button>
        </form>

        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--light-color)' }}>
            New here?{' '}
            <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
                style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600
                }}
            >
                Create an account
            </button>
        </div>

        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
            Have a team invite code?{' '}
            <button
                type="button"
                onClick={() => { setMode('teamInvite'); setError(''); setInfo(''); }}
                style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-color)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontWeight: 600
                }}
            >
                Redeem Invite
            </button>
        </div>
    </>
);