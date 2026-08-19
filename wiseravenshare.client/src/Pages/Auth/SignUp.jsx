import React from 'react';

export const SignUp = ({
    name, setName, email, setEmail, password, setPassword,
    setMode, submit, setError, setInfo
}) => (
    <>
        <div style={{ display: 'flex', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', padding: '4px', marginBottom: '20px' }}>
            <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--light-color)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}
            >
                Sign In
            </button>
            <button
                type="button"
                onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
                style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--highlight-color)',
                    color: 'var(--text-color)',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}
            >
                Sign Up
            </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div style={{ marginBottom: '14px', textAlign: 'left' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '6px' }}>
                    Full Name
                </label>
                <input
                    type="text"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '6px' }}>
                    Email Address
                </label>
                <input
                    type="email"
                    placeholder="Enter your email"
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-color)', marginBottom: '6px' }}>
                    Password
                </label>
                <input
                    type="password"
                    placeholder="At least 8 characters with uppercase, lowercase, number, and symbol"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
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
                Create Account
            </button>
        </form>

        <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--light-color)' }}>
            Already have an account?{' '}
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
                Sign In
            </button>
        </div>
    </>
);