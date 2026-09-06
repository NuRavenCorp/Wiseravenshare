// wiseravenshare.client/src/Components/Communication/PhoneVerificationModal.jsx
import React, { useState } from 'react';
import { communicationService } from '@/Services/CommunicationService';
import './PhoneVerificationModal.css';

/**
 * Phone Verification Modal Component
 * Handles SMS/WhatsApp phone verification workflow
 */
export const PhoneVerificationModal = ({ isOpen, onClose, onVerified }) => {
    const [step, setStep] = useState('phone'); // 'phone' | 'code' | 'success'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [channel, setChannel] = useState('sms'); // 'sms' | 'whatsapp'
    const [verificationSid, setVerificationSid] = useState('');

    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Validate phone number format (E.164)
            if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
                setError('Please enter a valid phone number (e.g., +1234567890)');
                setLoading(false);
                return;
            }

            const result = await communicationService.requestVerification(phoneNumber, channel);

            if (result.success) {
                setVerificationSid(result.verificationSid);
                setStep('code');
                setError('');
            } else {
                setError(result.error || 'Failed to send verification code');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
            console.error('Verification error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (!code || code.length < 6) {
                setError('Please enter a valid code');
                setLoading(false);
                return;
            }

            const result = await communicationService.confirmVerification(phoneNumber, code);

            if (result.success && result.isVerified) {
                setStep('success');
                setTimeout(() => {
                    if (onVerified) {
                        onVerified({ phoneNumber, channel });
                    }
                    onClose();
                }, 2000);
            } else {
                setError('Invalid code. Please try again.');
            }
        } catch (err) {
            setError('An error occurred. Please try again.');
            console.error('Verification error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="phone-verification-modal-overlay" onClick={onClose}>
            <div className="phone-verification-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Verify Your Phone Number</h2>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {step === 'phone' && (
                        <form onSubmit={handlePhoneSubmit} className="verification-form">
                            <div className="form-group">
                                <label htmlFor="phone">Phone Number</label>
                                <div className="phone-input-group">
                                    <span className="country-code">+</span>
                                    <input
                                        id="phone"
                                        type="tel"
                                        placeholder="1234567890"
                                        value={phoneNumber.replace(/^\+/, '')}
                                        onChange={(e) => setPhoneNumber('+' + e.target.value.replace(/\D/g, ''))}
                                        disabled={loading}
                                        required
                                    />
                                </div>
                                <small>Include country code (e.g., +1 for USA)</small>
                            </div>

                            <div className="form-group">
                                <label>Send verification code via:</label>
                                <div className="channel-selector">
                                    <label className={`channel-option ${channel === 'sms' ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="channel"
                                            value="sms"
                                            checked={channel === 'sms'}
                                            onChange={() => setChannel('sms')}
                                            disabled={loading}
                                        />
                                        <span className="channel-icon">📱</span>
                                        <span>SMS</span>
                                    </label>
                                    <label className={`channel-option ${channel === 'whatsapp' ? 'selected' : ''}`}>
                                        <input
                                            type="radio"
                                            name="channel"
                                            value="whatsapp"
                                            checked={channel === 'whatsapp'}
                                            onChange={() => setChannel('whatsapp')}
                                            disabled={loading}
                                        />
                                        <span className="channel-icon">💬</span>
                                        <span>WhatsApp</span>
                                    </label>
                                </div>
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || !phoneNumber}
                            >
                                {loading ? 'Sending...' : 'Send Code'}
                            </button>
                        </form>
                    )}

                    {step === 'code' && (
                        <form onSubmit={handleCodeSubmit} className="verification-form">
                            <div className="form-group">
                                <label>Verification Code</label>
                                <p className="info-text">
                                    Enter the 6-digit code sent to {phoneNumber} via {channel.toUpperCase()}
                                </p>
                                <input
                                    type="text"
                                    placeholder="000000"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    maxLength="6"
                                    disabled={loading}
                                    required
                                    className="code-input"
                                />
                            </div>

                            {error && <div className="error-message">{error}</div>}

                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={loading || code.length !== 6}
                            >
                                {loading ? 'Verifying...' : 'Verify Code'}
                            </button>

                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setStep('phone');
                                    setCode('');
                                    setError('');
                                }}
                                disabled={loading}
                            >
                                Back
                            </button>
                        </form>
                    )}

                    {step === 'success' && (
                        <div className="success-state">
                            <div className="success-icon">✓</div>
                            <h3>Phone Verified!</h3>
                            <p>{phoneNumber} has been verified</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PhoneVerificationModal;
