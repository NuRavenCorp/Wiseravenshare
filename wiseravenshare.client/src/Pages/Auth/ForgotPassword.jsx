import React from 'react';

export const ForgotPassword = ({ email, setEmail, submit, setMode, setError, setInfo }) => (
    <>
        <h2 style={{ marginBottom: '12px' }}>Reset your password</h2>
        <div style={{ marginBottom: '14px', fontSize: '13px', color: 'var(--light-color)', lineHeight: 1.4 }}>
            Enter the email on your account and we&apos;ll prepare a reset token.
        </div>
        <input
            type="email"
            placeholder="Email address"
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
            Request Reset Token
        </button>
    </>
);