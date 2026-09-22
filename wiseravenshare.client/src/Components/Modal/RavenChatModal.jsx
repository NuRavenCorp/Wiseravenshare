import React, { useMemo, useState } from 'react';
import CreatorChat from '../Chat/CreatorChat';
import { createConversationRoom } from '../../Services/chatService';

export default function RavenChatModal({ isOpen, onClose, currentUserIdentity, currentUserLabel }) {
    const [recipientIdentity, setRecipientIdentity] = useState('');
    const [friendlyName, setFriendlyName] = useState('');
    const [conversationSid, setConversationSid] = useState('');
    const [mode, setMode] = useState('launch'); // launch | chat
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const canLaunch = useMemo(() => Boolean(String(currentUserIdentity || '').trim()), [currentUserIdentity]);

    if (!isOpen) return null;

    const resetState = () => {
        setRecipientIdentity('');
        setFriendlyName('');
        setConversationSid('');
        setMode('launch');
        setLoading(false);
        setError('');
    };

    const handleClose = () => {
        resetState();
        onClose?.();
    };

    const handleCreateRoom = async (e) => {
        e.preventDefault();
        const otherIdentity = String(recipientIdentity || '').trim();
        if (!otherIdentity) {
            setError('Enter the other creator identity.');
            return;
        }
        if (!canLaunch) {
            setError('Please sign in before opening RavenChat.');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const result = await createConversationRoom(otherIdentity, friendlyName.trim());
            setConversationSid(result?.conversationSid || '');
            setMode('chat');
        } catch (err) {
            setError(err?.message || 'Could not create a RavenChat room.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="RavenChat"
            onClick={(e) => e.target === e.currentTarget && handleClose()}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                background: 'rgba(0,0,0,0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
            }}
        >
            <div
                style={{
                    width: 'min(980px, 96vw)',
                    maxHeight: '92vh',
                    overflow: 'hidden',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))',
                    border: '1px solid rgba(148,163,184,0.2)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderBottom: '1px solid rgba(148,163,184,0.15)'
                }}>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: 800 }}>🪶 RavenChat</div>
                        <div style={{ fontSize: '12px', opacity: 0.72 }}>
                            Real-time creator chat{currentUserLabel ? ` · ${currentUserLabel}` : ''}
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        aria-label="Close RavenChat"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#cbd5e1',
                            fontSize: '28px',
                            cursor: 'pointer',
                            lineHeight: 1
                        }}
                    >
                        ×
                    </button>
                </div>

                {mode === 'launch' ? (
                    <form onSubmit={handleCreateRoom} style={{ padding: '18px', display: 'grid', gap: '12px' }}>
                        <div style={{ fontSize: '13px', opacity: 0.8 }}>
                            Start a private 1-on-1 room with another creator by entering their user identity.
                        </div>

                        <input
                            value={recipientIdentity}
                            onChange={(e) => setRecipientIdentity(e.target.value)}
                            placeholder="Recipient identity (user id / sub / username)"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(148,163,184,0.24)',
                                background: 'rgba(15,23,42,0.8)',
                                color: '#f8fafc',
                                outline: 'none'
                            }}
                        />

                        <input
                            value={friendlyName}
                            onChange={(e) => setFriendlyName(e.target.value)}
                            placeholder="Optional room name"
                            style={{
                                width: '100%',
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(148,163,184,0.24)',
                                background: 'rgba(15,23,42,0.8)',
                                color: '#f8fafc',
                                outline: 'none'
                            }}
                        />

                        {error && (
                            <div style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(239,68,68,0.3)',
                                background: 'rgba(239,68,68,0.1)',
                                color: '#fca5a5',
                                fontSize: '13px'
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={handleClose}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(148,163,184,0.24)',
                                    background: 'transparent',
                                    color: '#e2e8f0',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '999px',
                                    border: 'none',
                                    background: loading ? 'rgba(59,130,246,0.45)' : 'linear-gradient(135deg, #0f766e, #2563eb)',
                                    color: 'white',
                                    cursor: loading ? 'not-allowed' : 'pointer',
                                    fontWeight: 700
                                }}
                            >
                                {loading ? 'Launching…' : 'Launch RavenChat'}
                            </button>
                        </div>
                    </form>
                ) : (
                    <div style={{ padding: '16px', flex: 1, minHeight: 0 }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '10px',
                            gap: '12px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ fontSize: '13px', opacity: 0.8 }}>
                                Room SID: <code>{conversationSid}</code>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMode('launch')}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '999px',
                                    border: '1px solid rgba(148,163,184,0.24)',
                                    background: 'transparent',
                                    color: '#e2e8f0',
                                    cursor: 'pointer'
                                }}
                            >
                                Back
                            </button>
                        </div>
                        <div style={{ height: 'calc(92vh - 130px)', minHeight: '420px' }}>
                            <CreatorChat
                                conversationSid={conversationSid}
                                currentUser={String(currentUserIdentity || '').trim()}
                                onClose={handleClose}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
