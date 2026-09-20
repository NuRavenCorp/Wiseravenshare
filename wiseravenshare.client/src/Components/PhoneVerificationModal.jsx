import React, { useState, useEffect } from 'react'
import './PhoneVerificationModal.css'
import { communicationService } from '../../Services/CommunicationService'

const PhoneVerificationModal = ({ isOpen, onClose, onSuccess }) => {
  const [stage, setStage] = useState('phone') // 'phone' | 'otp' | 'success' | 'error'
  const [phoneNumber, setPhoneNumber] = useState('')
  const [country, setCountry] = useState('US')
  const [channel, setChannel] = useState('sms') // 'sms' | 'whatsapp'
  const [otpCode, setOtpCode] = useState('')
  const [verificationSid, setVerificationSid] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [resendCountdown, setResendCountdown] = useState(0)

  useEffect(() => {
    let timer
    if (resendCountdown > 0) {
      timer = setTimeout(() => setResendCountdown(resendCountdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [resendCountdown])

  if (!isOpen) return null

  const countryPhoneCodes = {
    US: '+1',
    CA: '+1',
    GB: '+44',
    AU: '+61',
    DE: '+49',
    FR: '+33',
    JP: '+81',
    IN: '+91',
    BR: '+55',
    MX: '+52'
  }

  const formatPhoneNumber = (number) => {
    const code = countryPhoneCodes[country] || '+1'
    const cleaned = number.replace(/\D/g, '')
    return `${code}${cleaned}`
  }

  const handleStartVerification = async () => {
    setLoading(true)
    setError('')

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber)

      // Call verification start endpoint
      const response = await communicationService.startCommuniqueVerification(
        formattedPhone,
        channel
      )

      if (response && response.verificationSid) {
        setVerificationSid(response.verificationSid)
        setStage('otp')
        setSuccessMessage(`Verification code sent via ${channel.toUpperCase()}`)
        setTimeout(() => setSuccessMessage(''), 5000)
      } else {
        setError('Failed to start verification. Please try again.')
      }
    } catch (err) {
      console.error('Verification start error:', err)
      setError(err.message || 'Failed to send verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckCode = async () => {
    if (otpCode.length !== 6) {
      setError('Please enter a 6-digit code')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await communicationService.checkCommuniqueVerification(
        verificationSid,
        otpCode
      )

      if (response && response.status === 'approved') {
        setStage('success')
        setSuccessMessage('Phone number verified successfully!')
        setTimeout(() => {
          onSuccess?.(phoneNumber, channel)
          handleClose()
        }, 2000)
      } else {
        setError('Invalid verification code. Please try again.')
      }
    } catch (err) {
      console.error('Verification check error:', err)
      setError(err.message || 'Failed to verify code')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCountdown > 0) return

    setLoading(true)
    setError('')

    try {
      const formattedPhone = formatPhoneNumber(phoneNumber)
      const response = await communicationService.startCommuniqueVerification(
        formattedPhone,
        channel
      )

      if (response && response.verificationSid) {
        setVerificationSid(response.verificationSid)
        setOtpCode('')
        setSuccessMessage(`Verification code resent via ${channel.toUpperCase()}`)
        setResendCountdown(60)
        setTimeout(() => setSuccessMessage(''), 5000)
      } else {
        setError('Failed to resend code. Please try again.')
      }
    } catch (err) {
      console.error('Resend error:', err)
      setError(err.message || 'Failed to resend code')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPhoneNumber('')
    setOtpCode('')
    setStage('phone')
    setError('')
    setSuccessMessage('')
    setVerificationSid('')
    setResendCountdown(0)
    onClose()
  }

  return (
    <div className="phone-verification-modal-overlay">
      <div className="phone-verification-modal">
        <button className="modal-close-btn" onClick={handleClose}>
          ✕
        </button>

        <h2 className="modal-title">Verify Your Phone Number</h2>
        <p className="modal-subtitle">
          Receive SMS or WhatsApp messages about your podcasts and content
        </p>

        {error && (
          <div className="modal-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        )}

        {successMessage && (
          <div className="modal-success">
            <span className="success-icon">✓</span>
            {successMessage}
          </div>
        )}

        {stage === 'phone' && (
          <div className="phone-stage">
            <div className="form-group">
              <label className="form-label">Country/Region</label>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="form-select"
                disabled={loading}
              >
                {Object.keys(countryPhoneCodes).map((c) => (
                  <option key={c} value={c}>
                    {c} ({countryPhoneCodes[c]})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="(555) 123-4567"
                className="form-input"
                disabled={loading}
              />
              <small className="form-hint">
                Format: {countryPhoneCodes[country] || '+1'} + your number
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Preferred Channel</label>
              <div className="channel-selector">
                <label className="channel-option">
                  <input
                    type="radio"
                    name="channel"
                    value="sms"
                    checked={channel === 'sms'}
                    onChange={(e) => setChannel(e.target.value)}
                    disabled={loading}
                  />
                  <span className="channel-label">📱 SMS</span>
                </label>
                <label className="channel-option">
                  <input
                    type="radio"
                    name="channel"
                    value="whatsapp"
                    checked={channel === 'whatsapp'}
                    onChange={(e) => setChannel(e.target.value)}
                    disabled={loading}
                  />
                  <span className="channel-label">💬 WhatsApp</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleStartVerification}
              disabled={!phoneNumber || loading}
              className="btn btn-primary btn-full"
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </div>
        )}

        {stage === 'otp' && (
          <div className="otp-stage">
            <p className="otp-instruction">
              Enter the 6-digit code sent to your {channel === 'sms' ? 'phone number' : 'WhatsApp'}:
            </p>

            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength="6"
              className="otp-input"
              disabled={loading}
              autoComplete="off"
            />

            <button
              onClick={handleCheckCode}
              disabled={otpCode.length !== 6 || loading}
              className="btn btn-primary btn-full"
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              onClick={handleResend}
              disabled={resendCountdown > 0 || loading}
              className="btn btn-secondary btn-full"
            >
              {resendCountdown > 0
                ? `Resend in ${resendCountdown}s`
                : 'Resend Code'}
            </button>

            <button
              onClick={() => {
                setStage('phone')
                setOtpCode('')
              }}
              className="btn btn-link"
            >
              Use a different number
            </button>
          </div>
        )}

        {stage === 'success' && (
          <div className="success-stage">
            <div className="success-icon-large">✓</div>
            <h3>Phone Verified!</h3>
            <p>You'll now receive notifications about your podcasts and content</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default PhoneVerificationModal
