import React, { useState, useEffect } from 'react'
import './CommunicationPreferences.css'
import { communicationService } from '../../Services/CommunicationService'

const CommunicationPreferences = ({ userId, onPhoneVerifyClick }) => {
  const [preferences, setPreferences] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPhoneEdit, setShowPhoneEdit] = useState(false)

  useEffect(() => {
    if (userId) {
      loadPreferences()
    }
  }, [userId])

  const loadPreferences = async () => {
    setLoading(true)
    setError('')

    try {
      const prefs = await communicationService.preferenceHelper.getPreferences(userId)
      if (prefs) {
        setPreferences(prefs)
        setPhoneNumber(prefs.phoneNumber || '')
      } else {
        // Initialize with defaults
        setPreferences({
          userId,
          enableSmsNotifications: true,
          enableWhatsAppNotifications: true,
          enableEngagementNotifications: true,
          preferredChannel: 'sms',
          phoneNumber: ''
        })
      }
    } catch (err) {
      console.error('Load preferences error:', err)
      setError('Failed to load preferences')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = async (field) => {
    const updated = {
      ...preferences,
      [field]: !preferences[field]
    }
    setPreferences(updated)
    await savePreferences(updated)
  }

  const handleChannelChange = async (newChannel) => {
    const updated = {
      ...preferences,
      preferredChannel: newChannel
    }
    setPreferences(updated)
    await savePreferences(updated)
  }

  const savePreferences = async (prefs) => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const result = await communicationService.preferenceHelper.updatePreferences(userId, prefs)
      if (result) {
        setSuccess('Preferences saved successfully!')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        setError('Failed to save preferences')
      }
    } catch (err) {
      console.error('Save preferences error:', err)
      setError(err.message || 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="preferences-loading">Loading preferences...</div>
  }

  if (!preferences) {
    return <div className="preferences-error">Unable to load preferences</div>
  }

  return (
    <div className="communication-preferences">
      <div className="preferences-header">
        <h3 className="preferences-title">📬 Communication Preferences</h3>
        <p className="preferences-subtitle">
          Choose how you want to receive notifications about your podcasts and content
        </p>
      </div>

      {error && (
        <div className="preferences-alert error">
          <span className="alert-icon">⚠️</span>
          {error}
        </div>
      )}

      {success && (
        <div className="preferences-alert success">
          <span className="alert-icon">✓</span>
          {success}
        </div>
      )}

      {/* Phone Number Section */}
      <div className="preferences-section">
        <h4 className="section-title">Phone Number</h4>
        {phoneNumber ? (
          <div className="phone-verified">
            <div className="phone-info">
              <span className="phone-icon">📱</span>
              <div className="phone-details">
                <span className="phone-number">{phoneNumber}</span>
                <span className="phone-status verified">✓ Verified</span>
              </div>
            </div>
            <button
              className="btn-small btn-secondary"
              onClick={() => onPhoneVerifyClick?.()}
            >
              Change Number
            </button>
          </div>
        ) : (
          <div className="phone-not-verified">
            <p className="phone-message">No phone number verified yet</p>
            <button
              className="btn btn-primary"
              onClick={() => onPhoneVerifyClick?.()}
            >
              Add & Verify Phone Number
            </button>
          </div>
        )}
      </div>

      {/* SMS Notifications */}
      <div className="preferences-section">
        <div className="preference-item">
          <div className="preference-info">
            <h4 className="preference-label">📱 SMS Notifications</h4>
            <p className="preference-description">
              Receive text messages when your podcasts are published or need attention
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.enableSmsNotifications}
              onChange={() => handleToggle('enableSmsNotifications')}
              disabled={!phoneNumber || saving}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {!phoneNumber && (
          <p className="preference-hint">
            💡 Verify your phone number to enable SMS notifications
          </p>
        )}
      </div>

      {/* WhatsApp Notifications */}
      <div className="preferences-section">
        <div className="preference-item">
          <div className="preference-info">
            <h4 className="preference-label">💬 WhatsApp Notifications</h4>
            <p className="preference-description">
              Receive WhatsApp messages about podcast updates and engagement
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.enableWhatsAppNotifications}
              onChange={() => handleToggle('enableWhatsAppNotifications')}
              disabled={!phoneNumber || saving}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
        {!phoneNumber && (
          <p className="preference-hint">
            💡 Verify your phone number to enable WhatsApp notifications
          </p>
        )}
      </div>

      {/* Engagement Notifications */}
      <div className="preferences-section">
        <div className="preference-item">
          <div className="preference-info">
            <h4 className="preference-label">💌 Engagement Notifications</h4>
            <p className="preference-description">
              Get alerts when listeners comment, share, or engage with your content
            </p>
          </div>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={preferences.enableEngagementNotifications}
              onChange={() => handleToggle('enableEngagementNotifications')}
              disabled={saving}
            />
            <span className="toggle-slider"></span>
          </label>
        </div>
      </div>

      {/* Preferred Channel */}
      {phoneNumber && (
        <div className="preferences-section">
          <h4 className="section-title">Preferred Channel</h4>
          <p className="section-description">
            When both SMS and WhatsApp are enabled, which should we use first?
          </p>
          <div className="channel-selector">
            <label className="channel-radio">
              <input
                type="radio"
                name="preferred-channel"
                value="sms"
                checked={preferences.preferredChannel === 'sms'}
                onChange={(e) => handleChannelChange(e.target.value)}
                disabled={saving}
              />
              <span className="channel-name">📱 SMS</span>
            </label>
            <label className="channel-radio">
              <input
                type="radio"
                name="preferred-channel"
                value="whatsapp"
                checked={preferences.preferredChannel === 'whatsapp'}
                onChange={(e) => handleChannelChange(e.target.value)}
                disabled={saving}
              />
              <span className="channel-name">💬 WhatsApp</span>
            </label>
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="preferences-info-box">
        <h4 className="info-title">ℹ️ How We Use Your Information</h4>
        <ul className="info-list">
          <li>Your phone number is encrypted and stored securely</li>
          <li>We only send notifications when you enable them</li>
          <li>You can disable notifications anytime</li>
          <li>SMS and WhatsApp messages are sent through Twilio</li>
          <li>See our <a href="/privacy">Privacy Policy</a> for details</li>
        </ul>
      </div>

      {/* Save Button */}
      <button
        className="btn btn-primary btn-full"
        onClick={() => savePreferences(preferences)}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  )
}

export default CommunicationPreferences
