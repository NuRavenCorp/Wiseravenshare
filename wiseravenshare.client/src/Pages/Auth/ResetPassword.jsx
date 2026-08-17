import React from 'react';

export const ResetPassword = ({ resetToken, setResetToken, password, setPassword, submit }) => (
    <>
        <h2 style={{ marginBottom: '12px' }}>Reset Password</h2>
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
        <input
            type="password"
            placeholder="New password"
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
            Set New Password
        </button>
    </>
);