// wiseravenshare.client/src/Components/Communication/CommunicationPreferences.jsx
import React, { useState, useEffect } from 'react';
import { communicationService, preferenceHelper } from '@/Services/CommunicationService';
import PhoneVerificationModal from './PhoneVerificationModal';
import './CommunicationPreferences.css';

/**
 * Communication Preferences Component
 * Manages user notification settings and phone verification
 */
export const CommunicationPreferences = () => {
    const [preferences, setPreferences] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showVerificationModal, setShowVerificationModal] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        setLoading(true);
        try {
            const prefs = await communicationService.getPreferences();
            if (prefs) {
                setPreferences(prefs);
            }
        } catch (err) {
            setError('Failed to load preferences');
            console.error('Error loading preferences:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (key) => {
        const newPreferences = { ...preferences, [key]: !preferences[key] };
        setPreferences(newPreferences);
        setSaving(true);

        try {
            const result = await communicationService.updatePreferences(newPreferences);
            if (result.success) {
                setSuccessMessage('Preferences updated');
                setTimeout(() => setSuccessMessage(''), 3000);
            } else {
                setError('Failed to update preferences');
            }
        } catch (err) {
            setError('Failed to save preferences');
            console.error('Error updating preferences:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleChannelChange = async (channel) => {
        const newPreferences = { ...preferences, preferredChannel: channel };
        setPreferences(newPreferences);
        setSaving(true);

        try {
            const result = await communicationService.updatePreferences(newPreferences);
            if (result.success) {
                setSuccessMessage('Preferred channel updated');
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch (err) {
            setError('Failed to update channel preference');
        } finally {
            setSaving(false);
        }
    };

    const handleVerificationComplete = (data) => {
        setShowVerificationModal(false);
        setSuccessMessage('Phone number verified!');
        setTimeout(() => setSuccessMessage(''), 3000);
        loadPreferences();
    };

    if (loading) {
        return <div className="preferences-container loading">Loading preferences...</div>;
    }

    if (!preferences) {
        return <div className="preferences-container error">Failed to load preferences</div>;
    }

    return (
        <div className="preferences-container">
            <PhoneVerificationModal
                isOpen={showVerificationModal}
                onClose={() => setShowVerificationModal(false)}
                onVerified={handleVerificationComplete}
            />

            <div className="preferences-section">
                <h2>Communication Settings</h2>

                {successMessage && <div className="success-banner">{successMessage}</div>}
                {error && <div className="error-banner">{error}</div>}

                {/* Notification Toggles */}
                <div className="preferences-group">
                    <h3>Notification Channels</h3>

                    <div className="preference-item">
                        <div className="preference-info">
                            <label htmlFor="sms-toggle">
                                <span className="icon">📱</span>
                                SMS Notifications
                            </label>
                            <p className="description">Receive text message alerts</p>
                        </div>
                        <div className="toggle-switch">
                            <input
                                id="sms-toggle"
                                type="checkbox"
                                checked={preferences.enableSmsNotifications}
                                onChange={() => handleToggle('enableSmsNotifications')}
                                disabled={saving}
                            />
                            <label htmlFor="sms-toggle" className="toggle-label"></label>
                        </div>
                    </div>

                    <div className="preference-item">
                        <div className="preference-info">
                            <label htmlFor="whatsapp-toggle">
                                <span className="icon">💬</span>
                                WhatsApp Notifications
                            </label>
                            <p className="description">Receive WhatsApp messages</p>
                        </div>
                        <div className="toggle-switch">
                            <input
                                id="whatsapp-toggle"
                                type="checkbox"
                                checked={preferences.enableWhatsAppNotifications}
                                onChange={() => handleToggle('enableWhatsAppNotifications')}
                                disabled={saving}
                            />
                            <label htmlFor="whatsapp-toggle" className="toggle-label"></label>
                        </div>
                    </div>

                    <div className="preference-item">
                        <div className="preference-info">
                            <label htmlFor="engagement-toggle">
                                <span className="icon">🔔</span>
                                Engagement Notifications
                            </label>
                            <p className="description">
                                Notify me of likes, comments, shares, and mentions
                            </p>
                        </div>
                        <div className="toggle-switch">
                            <input
                                id="engagement-toggle"
                                type="checkbox"
                                checked={preferences.enableEngagementNotifications}
                                onChange={() => handleToggle('enableEngagementNotifications')}
                                disabled={saving}
                            />
                            <label htmlFor="engagement-toggle" className="toggle-label"></label>
                        </div>
                    </div>

                    <div className="preference-item">
                        <div className="preference-info">
                            <label htmlFor="alerts-toggle">
                                <span className="icon">⚠️</span>
                                Security Alerts
                            </label>
                            <p className="description">
                                Notify me of login attempts and account changes
                            </p>
                        </div>
                        <div className="toggle-switch">
                            <input
                                id="alerts-toggle"
                                type="checkbox"
                                checked={preferences.enableAlerts}
                                onChange={() => handleToggle('enableAlerts')}
                                disabled={saving}
                            />
                            <label htmlFor="alerts-toggle" className="toggle-label"></label>
                        </div>
                    </div>
                </div>

                {/* Preferred Channel */}
                <div className="preferences-group">
                    <h3>Preferred Communication Channel</h3>
                    <p className="group-description">
                        Choose your default method for receiving notifications
                    </p>

                    <div className="channel-options">
                        <label className={`channel-card ${preferences.preferredChannel === 'sms' ? 'selected' : ''}`}>
                            <input
                                type="radio"
                                name="channel"
                                value="sms"
                                checked={preferences.preferredChannel === 'sms'}
                                onChange={() => handleChannelChange('sms')}
                                disabled={saving}
                            />
                            <div className="channel-content">
                                <span className="channel-icon">📱</span>
                                <div>
                                    <span className="channel-name">SMS</span>
                                    <p>Text messages to your phone</p>
                                </div>
                            </div>
                        </label>

                        <label className={`channel-card ${preferences.preferredChannel === 'whatsapp' ? 'selected' : ''}`}>
                            <input
                                type="radio"
                                name="channel"
                                value="whatsapp"
                                checked={preferences.preferredChannel === 'whatsapp'}
                                onChange={() => handleChannelChange('whatsapp')}
                                disabled={saving}
                            />
                            <div className="channel-content">
                                <span className="channel-icon">💬</span>
                                <div>
                                    <span className="channel-name">WhatsApp</span>
                                    <p>Messages through WhatsApp</p>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Phone Verification */}
                <div className="preferences-group">
                    <h3>Phone Number Verification</h3>

                    <div className="verification-status">
                        {preferences.isVerified && preferences.verifiedPhoneNumber ? (
                            <div className="verified-badge">
                                <span className="status-icon">✓</span>
                                <div>
                                    <p className="status-label">Verified</p>
                                    <p className="phone-number">{preferences.verifiedPhoneNumber}</p>
                                </div>
                            </div>
                        ) : (
                            <div className="unverified-badge">
                                <span className="status-icon">!</span>
                                <div>
                                    <p className="status-label">Not Verified</p>
                                    <p className="description">Verify your phone number to enable SMS/WhatsApp</p>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={() => setShowVerificationModal(true)}
                        disabled={saving}
                    >
                        {preferences.isVerified ? 'Change Phone Number' : 'Verify Phone Number'}
                    </button>
                </div>

                {/* Two-Factor Authentication */}
                <div className="preferences-group">
                    <h3>Two-Factor Authentication (2FA)</h3>
                    <p className="group-description">
                        Add an extra layer of security to your account
                    </p>

                    <div className="2fa-info">
                        {preferences.isVerified ? (
                            <div className="info-box success">
                                <p>
                                    ✓ You can now enable SMS-based 2FA on your account.
                                    Your phone number has been verified.
                                </p>
                            </div>
                        ) : (
                            <div className="info-box warning">
                                <p>
                                    Verify your phone number first to enable 2FA.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunicationPreferences;
