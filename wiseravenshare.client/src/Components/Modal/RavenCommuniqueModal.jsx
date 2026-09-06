// wiseravenshare.client/src/Components/Modal/RavenCommuniqueModal.jsx
import React, { useEffect, useState } from 'react';
import { getCommuniqueMessages, sendCommunique } from '../../Services/communiqueService';
import '../../Styles/RavenCommunique.css';

const CHANNELS = [
    { key: 'sms',       label: 'SMS',       icon: '💬' },
    { key: 'whatsapp',  label: 'WhatsApp',  icon: '📱' },
    { key: 'voice',     label: 'Voice',     icon: '📞' }
];

const STATUS = { idle: 'idle', sending: 'sending', success: 'success', error: 'error' };

export default function RavenCommuniqueModal({ isOpen, onClose }) {
    const [channel, setChannel]   = useState('sms');
    const [to, setTo]             = useState('');
    const [message, setMessage]   = useState('');
    const [status, setStatus]     = useState(STATUS.idle);
    const [feedback, setFeedback] = useState('');
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const isVoice     = channel === 'voice';
    const charLimit   = 1600;
    const charsLeft   = charLimit - message.length;

    const loadHistory = async (selectedChannel = '') => {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const items = await getCommuniqueMessages({
                channel: selectedChannel || '',
                limit: 12
            });
            setHistory(Array.isArray(items) ? items : []);
        } catch (err) {
            setHistory([]);
            setHistoryError(err?.message || 'Unable to load aggregated message history.');
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        loadHistory('');
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSend = async (e) => {
        e.preventDefault();
        if (!to.trim()) { setFeedback('Please enter a recipient number.'); return; }
        if (!isVoice && !message.trim()) { setFeedback('Please enter a message.'); return; }

        setStatus(STATUS.sending);
        setFeedback('');

        try {
            await sendCommunique(channel, to.trim(), message.trim());
            setStatus(STATUS.success);
            setFeedback(
                channel === 'voice'
                    ? 'Voice call initiated!'
                    : `${channel === 'whatsapp' ? 'WhatsApp message' : 'SMS'} sent successfully.`
            );
            setTo('');
            setMessage('');
            await loadHistory('');
        } catch (err) {
            setStatus(STATUS.error);
            setFeedback(err.message || 'Send failed. Please try again.');
            await loadHistory('');
        }
    };

    const handleClose = () => {
        setStatus(STATUS.idle);
        setFeedback('');
        setTo('');
        setMessage('');
        onClose();
    };

    return (
        <div
            className="rc-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="RavenCommuniqué"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
            <div className="rc-modal">
                {/* Header */}
                <div className="rc-header">
                    <span className="rc-logo">🪶</span>
                    <h2 className="rc-title">RavenCommuniqué</h2>
                    <button className="rc-close" onClick={handleClose} aria-label="Close">×</button>
                </div>

                {/* Channel tabs */}
                <div className="rc-tabs" role="tablist">
                    {CHANNELS.map(ch => (
                        <button
                            key={ch.key}
                            role="tab"
                            aria-selected={channel === ch.key}
                            className={`rc-tab${channel === ch.key ? ' rc-tab--active' : ''}`}
                            onClick={() => { setChannel(ch.key); setFeedback(''); setStatus(STATUS.idle); }}
                        >
                            {ch.icon} {ch.label}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form className="rc-form" onSubmit={handleSend} noValidate>
                    <label className="rc-label" htmlFor="rc-to">
                        Recipient {isVoice ? 'number' : 'phone number'}
                    </label>
                    <input
                        id="rc-to"
                        className="rc-input"
                        type="tel"
                        placeholder="+1 555 000 0000"
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        disabled={status === STATUS.sending}
                        required
                    />

                    {!isVoice && (
                        <>
                            <label className="rc-label" htmlFor="rc-message">Message</label>
                            <textarea
                                id="rc-message"
                                className="rc-textarea"
                                rows={4}
                                maxLength={charLimit}
                                placeholder={channel === 'whatsapp' ? 'WhatsApp message…' : 'SMS message…'}
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                disabled={status === STATUS.sending}
                                required
                            />
                            <p className={`rc-char-count${charsLeft < 80 ? ' rc-char-count--warn' : ''}`}>
                                {charsLeft} characters remaining
                            </p>
                        </>
                    )}

                    {isVoice && (
                        <p className="rc-voice-hint">
                            A Twilio-bridged voice call will be placed to the number above.
                        </p>
                    )}

                    {/* Feedback */}
                    {feedback && (
                        <div className={`rc-feedback rc-feedback--${status}`} role="alert">
                            {status === STATUS.success && '✅ '}
                            {status === STATUS.error   && '⚠️ '}
                            {feedback}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="rc-submit"
                        disabled={status === STATUS.sending}
                    >
                        {status === STATUS.sending
                            ? 'Sending…'
                            : isVoice
                                ? '📞 Place Call'
                                : channel === 'whatsapp'
                                    ? '📱 Send WhatsApp'
                                    : '💬 Send SMS'}
                    </button>
                </form>

                <p className="rc-powered">Powered by Twilio · RavenCommuniqué</p>

                <div style={{ marginTop: '12px', borderTop: '1px solid rgba(148,163,184,0.3)', paddingTop: '10px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '8px' }}>
                        Aggregated Channel Activity (SMS · WhatsApp · Voice)
                    </div>
                    {historyLoading && (
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>Loading activity…</div>
                    )}
                    {!historyLoading && historyError && (
                        <div style={{ fontSize: '12px', color: '#fca5a5' }}>{historyError}</div>
                    )}
                    {!historyLoading && !historyError && history.length === 0 && (
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>No activity yet.</div>
                    )}
                    {!historyLoading && history.length > 0 && (
                        <div style={{ display: 'grid', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                            {history.map((entry) => (
                                <div
                                    key={entry.id}
                                    style={{
                                        border: '1px solid rgba(148,163,184,0.3)',
                                        borderRadius: '8px',
                                        padding: '6px 8px',
                                        fontSize: '11px',
                                        background: 'rgba(15,23,42,0.5)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                        <strong style={{ textTransform: 'uppercase' }}>{entry.channel}</strong>
                                        <span>{entry.requestedAtUtc ? new Date(entry.requestedAtUtc).toLocaleString() : ''}</span>
                                    </div>
                                    <div>To: {entry.to}</div>
                                    {entry.messagePreview && <div style={{ opacity: 0.9 }}>{entry.messagePreview}</div>}
                                    <div style={{ color: entry.success ? '#86efac' : '#fca5a5' }}>
                                        {entry.success ? 'Delivered request accepted' : (entry.errorMessage || 'Failed')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
