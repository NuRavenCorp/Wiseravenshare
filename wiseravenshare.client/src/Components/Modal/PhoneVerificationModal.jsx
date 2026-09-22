import React, { useState } from 'react';
import {
    startCommuniqueVerification,
    checkCommuniqueVerification
} from '../../Services/communiqueService';

const CHANNELS = [
    { key: 'sms', label: 'SMS', icon: '💬' },
    { key: 'whatsapp', label: 'WhatsApp', icon: '📱' }
];

const STATUS = { idle: 'idle', starting: 'starting', waiting: 'waiting', checking: 'checking', success: 'success', error: 'error' };

/**
 * Phone Verification Modal
 * Allows users to start Twilio Verify and check codes via SMS or WhatsApp
 */
export default function PhoneVerificationModal({ isOpen, onClose }) {
    const [step, setStep] = useState('enter-phone'); // 'enter-phone' | 'check-code' | 'success'
    const [channel, setChannel] = useState('sms');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [status, setStatus] = useState(STATUS.idle);
    const [feedback, setFeedback] = useState('');

    if (!isOpen) return null;

    const handleStartVerification = async (e) => {
        e?.preventDefault();
        if (!phoneNumber.trim()) {
            setFeedback('Please enter a phone number.');
            return;
        }

        setStatus(STATUS.starting);
        setFeedback('');

        try {
            await startCommuniqueVerification(phoneNumber.trim(), channel);
            setStatus(STATUS.waiting);
            setFeedback(`Verification code sent via ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.`);
            setStep('check-code');
            setVerificationCode('');
        } catch (err) {
            setStatus(STATUS.error);
            setFeedback(err?.message || 'Failed to start verification.');
        }
    };

    const handleCheckCode = async (e) => {
        e?.preventDefault();
        if (!verificationCode.trim() || verificationCode.length < 4) {
            setFeedback('Please enter the code you received.');
            return;
        }

        setStatus(STATUS.checking);
        setFeedback('');

        try {
            const result = await checkCommuniqueVerification(phoneNumber.trim(), verificationCode.trim());
            if (result?.approved) {
                setStatus(STATUS.success);
                setFeedback('✅ Phone number verified successfully!');
                setStep('success');
                setTimeout(() => {
                    handleClose();
                }, 2000);
            } else {
                setStatus(STATUS.error);
                setFeedback('❌ Verification code is incorrect. Please try again.');
                setVerificationCode('');
            }
        } catch (err) {
            setStatus(STATUS.error);
            setFeedback(err?.message || 'Failed to verify code.');
        }
    };

    const handleClose = () => {
        setStep('enter-phone');
        setPhoneNumber('');
        setVerificationCode('');
        setStatus(STATUS.idle);
        setFeedback('');
        onClose();
    };

    return (
        <div
            className="pv-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Phone Verification"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999
            }}
        >
            <div
                className="pv-modal"
                style={{
                    background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))',
                    border: '1px solid rgba(148,163,184,0.2)',
                    borderRadius: '12px',
                    padding: '24px',
                    maxWidth: '420px',
                    width: '90%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🔐 Verify Phone Number
                    </h2>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#94a3b8'
                        }}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                {/* Step 1: Enter Phone */}
                {step === 'enter-phone' && (
                    <form onSubmit={handleStartVerification}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                placeholder="+1 (718) 593-9370"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                disabled={status === STATUS.starting}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    background: 'rgba(15,23,42,0.6)',
                                    color: '#fff',
                                    fontSize: '14px',
                                    boxSizing: 'border-box',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                            <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                                Include country code (e.g. +1 for US/Canada)
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '8px' }}>
                                Verification Method
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {CHANNELS.map((ch) => (
                                    <button
                                        key={ch.key}
                                        type="button"
                                        onClick={() => setChannel(ch.key)}
                                        disabled={status === STATUS.starting}
                                        style={{
                                            flex: 1,
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: channel === ch.key ? '2px solid #38bdf8' : '1px solid rgba(148,163,184,0.3)',
                                            background: channel === ch.key ? 'rgba(56,189,248,0.15)' : 'rgba(15,23,42,0.6)',
                                            color: channel === ch.key ? '#38bdf8' : '#94a3b8',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                            fontSize: '13px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {ch.icon} {ch.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {feedback && (
                            <div
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    fontSize: '12px',
                                    background: status === STATUS.error ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                    border: status === STATUS.error ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)',
                                    color: status === STATUS.error ? '#fca5a5' : '#86efac'
                                }}
                                role="alert"
                            >
                                {feedback}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={status === STATUS.starting}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: status === STATUS.starting ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '14px',
                                cursor: status === STATUS.starting ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {status === STATUS.starting ? 'Sending...' : `Send Code via ${channel.toUpperCase()}`}
                        </button>
                    </form>
                )}

                {/* Step 2: Check Code */}
                {step === 'check-code' && (
                    <form onSubmit={handleCheckCode}>
                        <div style={{ marginBottom: '12px', padding: '12px', borderRadius: '6px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                            <div style={{ fontSize: '12px', color: '#86efac', fontWeight: 600 }}>
                                ✓ Code sent to {phoneNumber}
                            </div>
                            <div style={{ fontSize: '11px', opacity: 0.8, marginTop: '4px' }}>
                                via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}
                            </div>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1', display: 'block', marginBottom: '6px' }}>
                                Verification Code
                            </label>
                            <input
                                type="text"
                                placeholder="000000"
                                maxLength="10"
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value)}
                                disabled={status === STATUS.checking}
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    background: 'rgba(15,23,42,0.6)',
                                    color: '#fff',
                                    fontSize: '18px',
                                    letterSpacing: '4px',
                                    textAlign: 'center',
                                    boxSizing: 'border-box',
                                    outline: 'none',
                                    transition: 'border-color 0.2s'
                                }}
                            />
                            <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '4px' }}>
                                Enter the 6-digit code
                            </div>
                        </div>

                        {feedback && (
                            <div
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    marginBottom: '12px',
                                    fontSize: '12px',
                                    background: status === STATUS.error ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
                                    border: status === STATUS.error ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(34,197,94,0.3)',
                                    color: status === STATUS.error ? '#fca5a5' : '#86efac'
                                }}
                                role="alert"
                            >
                                {feedback}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setStep('enter-phone');
                                    setVerificationCode('');
                                    setFeedback('');
                                    setStatus(STATUS.idle);
                                }}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(148,163,184,0.3)',
                                    background: 'transparent',
                                    color: '#94a3b8',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Back
                            </button>
                            <button
                                type="submit"
                                disabled={status === STATUS.checking}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: status === STATUS.checking ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #3b82f6)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    cursor: status === STATUS.checking ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {status === STATUS.checking ? 'Verifying...' : 'Verify Code'}
                            </button>
                        </div>
                    </form>
                )}

                {/* Step 3: Success */}
                {step === 'success' && (
                    <div style={{ textAlign: 'center', padding: '20px 0' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: '#86efac' }}>
                            Verified!
                        </h3>
                        <p style={{ margin: '0 0 16px 0', fontSize: '13px', opacity: 0.8 }}>
                            Your phone number has been verified successfully.
                        </p>
                        <button
                            onClick={handleClose}
                            style={{
                                padding: '10px 20px',
                                borderRadius: '6px',
                                border: 'none',
                                background: 'rgba(34,197,94,0.2)',
                                color: '#86efac',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            Close
                        </button>
                    </div>
                )}

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(148,163,184,0.1)', fontSize: '10px', opacity: 0.6, textAlign: 'center' }}>
                    Powered by Twilio Verify
                </div>
            </div>
        </div>
    );
}
