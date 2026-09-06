// wiseravenshare.client/src/Components/Communication/TwoFactorAuthTest.jsx
import React, { useState } from 'react';
import { communicationService, verificationHelper } from '@/Services/CommunicationService';
import PhoneVerificationModal from './PhoneVerificationModal';
import './TwoFactorAuthTest.css';

/**
 * 2FA Test Component
 * End-to-end testing workflow for two-factor authentication
 */
export const TwoFactorAuthTest = () => {
    const [testState, setTestState] = useState('initial'); // 'initial' | 'requesting' | 'entering_code' | 'success' | 'error'
    const [phoneNumber, setPhoneNumber] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [testMessage, setTestMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [testLog, setTestLog] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}`;
        setTestLog((prev) => [...prev, { message: logEntry, type }]);
    };

    const handleStartTest = async () => {
        if (!phoneNumber.match(/^\+?[1-9]\d{1,14}$/)) {
            setErrorMessage('Invalid phone number format');
            addLog('❌ Invalid phone number format', 'error');
            return;
        }

        setLoading(true);
        setErrorMessage('');
        addLog(`📱 Starting 2FA test with phone number: ${phoneNumber}`, 'info');

        try {
            // Step 1: Request verification
            addLog('Step 1: Requesting verification code...', 'info');
            const result = await communicationService.requestVerification(phoneNumber, 'sms');

            if (result.success) {
                addLog(`✓ Verification code sent successfully. SID: ${result.verificationSid?.substring(0, 10)}...`, 'success');
                setTestState('entering_code');
                setTestMessage(`Code sent to ${phoneNumber}. Check your SMS and enter the code below.`);
            } else {
                throw new Error(result.error || 'Failed to send verification code');
            }
        } catch (error) {
            addLog(`❌ Failed to request verification: ${error.message}`, 'error');
            setErrorMessage(`Error: ${error.message}`);
            setTestState('error');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async () => {
        if (verificationCode.length !== 6) {
            setErrorMessage('Please enter a 6-digit code');
            addLog('❌ Invalid code length', 'error');
            return;
        }

        setLoading(true);
        setErrorMessage('');
        addLog(`Step 2: Verifying code: ${verificationCode.replace(/\d/g, '*')}`, 'info');

        try {
            const result = await communicationService.confirmVerification(phoneNumber, verificationCode);

            if (result.success && result.isVerified) {
                addLog('✓ Phone number verified successfully!', 'success');
                addLog('✓ User preferences updated with verified status', 'success');
                setTestState('success');
                setTestMessage('2FA verification completed successfully!');
                
                // Test SMS sending
                await testSendSms();
            } else {
                throw new Error(result.error || 'Invalid code');
            }
        } catch (error) {
            addLog(`❌ Verification failed: ${error.message}`, 'error');
            setErrorMessage(`Error: ${error.message}`);
            setTestState('error');
        } finally {
            setLoading(false);
        }
    };

    const testSendSms = async () => {
        try {
            addLog('Step 3: Testing SMS send...', 'info');
            const smsResult = await communicationService.sendSms(
                `✓ 2FA test successful! Your WiseRavenShare account is now secured.`,
                phoneNumber
            );
            if (smsResult.success) {
                addLog('✓ Test SMS sent successfully', 'success');
            }
        } catch (error) {
            addLog(`⚠ SMS test failed: ${error.message}`, 'warning');
        }
    };

    const handleReset = () => {
        setTestState('initial');
        setPhoneNumber('');
        setVerificationCode('');
        setTestMessage('');
        setErrorMessage('');
        setTestLog([]);
    };

    return (
        <div className="twofa-test-container">
            <PhoneVerificationModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onVerified={() => {
                    setShowModal(false);
                    handleReset();
                    addLog('✓ Modal-based verification completed', 'success');
                }}
            />

            <div className="test-panel">
                <div className="test-header">
                    <h1>🔐 2FA Test Workflow</h1>
                    <p>End-to-end testing for SMS-based two-factor authentication</p>
                </div>

                {/* Test Steps */}
                <div className="test-steps">
                    <div className={`step ${testState !== 'initial' ? 'completed' : 'active'}`}>
                        <div className="step-number">1</div>
                        <div className="step-content">
                            <h3>Request Verification Code</h3>
                            <p>Enter phone number to receive SMS code</p>
                        </div>
                    </div>

                    <div className={`step ${testState === 'success' || testState === 'entering_code' || testState === 'error' ? 'active' : ''} ${testState === 'success' ? 'completed' : ''}`}>
                        <div className="step-number">2</div>
                        <div className="step-content">
                            <h3>Verify Code</h3>
                            <p>Enter the 6-digit code from SMS</p>
                        </div>
                    </div>

                    <div className={`step ${testState === 'success' ? 'completed' : ''}`}>
                        <div className="step-number">3</div>
                        <div className="step-content">
                            <h3>Confirm & Send Test SMS</h3>
                            <p>Confirm verification and send test message</p>
                        </div>
                    </div>
                </div>

                {/* Status Messages */}
                {errorMessage && (
                    <div className="status-message error">
                        <span className="icon">⚠️</span>
                        <span>{errorMessage}</span>
                    </div>
                )}

                {testMessage && (
                    <div className="status-message success">
                        <span className="icon">ℹ️</span>
                        <span>{testMessage}</span>
                    </div>
                )}

                {/* Test Form */}
                <div className="test-form">
                    {testState === 'initial' && (
                        <div className="form-section">
                            <h3>Step 1: Enter Phone Number</h3>
                            <div className="form-group">
                                <label htmlFor="phone">Phone Number (E.164 Format)</label>
                                <input
                                    id="phone"
                                    type="tel"
                                    placeholder="+1234567890"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    disabled={loading}
                                />
                                <small>Include country code (e.g., +1 for USA, +44 for UK)</small>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleStartTest}
                                disabled={loading || !phoneNumber}
                            >
                                {loading ? 'Sending...' : 'Send Verification Code'}
                            </button>
                        </div>
                    )}

                    {testState === 'entering_code' && (
                        <div className="form-section">
                            <h3>Step 2: Enter Verification Code</h3>
                            <div className="form-group">
                                <label htmlFor="code">6-Digit Code</label>
                                <input
                                    id="code"
                                    type="text"
                                    placeholder="000000"
                                    value={verificationCode}
                                    onChange={(e) =>
                                        setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                    }
                                    maxLength="6"
                                    disabled={loading}
                                    className="code-input"
                                />
                                <small>Enter the code sent to your phone</small>
                            </div>
                            <button
                                className="btn btn-primary"
                                onClick={handleVerifyCode}
                                disabled={loading || verificationCode.length !== 6}
                            >
                                {loading ? 'Verifying...' : 'Verify Code'}
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={handleReset}
                                disabled={loading}
                            >
                                Start Over
                            </button>
                        </div>
                    )}

                    {testState === 'success' && (
                        <div className="form-section success-section">
                            <div className="success-checkmark">✓</div>
                            <h3>✓ 2FA Test Successful!</h3>
                            <p>
                                Your phone number has been verified and SMS notifications are ready.
                                A test SMS has been sent to {phoneNumber}.
                            </p>
                            <button className="btn btn-primary" onClick={handleReset}>
                                Run Another Test
                            </button>
                        </div>
                    )}

                    {testState === 'error' && (
                        <div className="form-section error-section">
                            <div className="error-icon">✕</div>
                            <h3>✕ Test Failed</h3>
                            <p>Please review the error message above and try again.</p>
                            <button className="btn btn-primary" onClick={handleReset}>
                                Try Again
                            </button>
                        </div>
                    )}
                </div>

                {/* Test Log */}
                <div className="test-log">
                    <h3>Test Log</h3>
                    <div className="log-entries">
                        {testLog.length === 0 ? (
                            <p className="no-logs">Logs will appear here during testing...</p>
                        ) : (
                            testLog.map((entry, index) => (
                                <div key={index} className={`log-entry ${entry.type}`}>
                                    {entry.message}
                                </div>
                            ))
                        )}
                    </div>
                    {testLog.length > 0 && (
                        <button
                            className="btn btn-small btn-secondary"
                            onClick={() => setTestLog([])}
                        >
                            Clear Log
                        </button>
                    )}
                </div>

                {/* Alternative Test Method */}
                <div className="alternative-test">
                    <h3>Alternative: Test with Modal Component</h3>
                    <p>Click below to test the phone verification modal directly:</p>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setShowModal(true)}
                    >
                        Open Verification Modal
                    </button>
                </div>

                {/* Test Instructions */}
                <div className="test-instructions">
                    <h3>Test Instructions</h3>
                    <ol>
                        <li>Enter a valid phone number in E.164 format</li>
                        <li>Click "Send Verification Code"</li>
                        <li>Wait for SMS to arrive (usually within a few seconds)</li>
                        <li>Enter the 6-digit code from the SMS</li>
                        <li>Click "Verify Code"</li>
                        <li>If successful, a confirmation SMS will be sent</li>
                    </ol>
                    <p className="note">
                        <strong>Note:</strong> This uses real Twilio integration. SMS charges apply.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TwoFactorAuthTest;
