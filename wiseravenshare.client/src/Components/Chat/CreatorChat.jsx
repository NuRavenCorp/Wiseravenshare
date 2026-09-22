import React, { useEffect, useRef, useState } from 'react';
import { Client } from '@twilio/conversations';
import { getConversationsToken } from '../../Services/chatService';

/**
 * CreatorChat — real-time Twilio Conversations widget.
 *
 * Props:
 *   conversationSid  – the Conversations room SID to join
 *   currentUser      – identity of the logged-in creator
 *   onClose          – called when user dismisses the panel
 */
export default function CreatorChat({ conversationSid, currentUser, onClose }) {
    const [messages, setMessages]     = useState([]);
    const [text, setText]             = useState('');
    const [status, setStatus]         = useState('connecting');
    const [error, setError]           = useState('');
    const [typing, setTyping]         = useState([]);
    const conversationRef             = useRef(null);
    const clientRef                   = useRef(null);
    const bottomRef                   = useRef(null);

    useEffect(() => {
        if (!conversationSid) return;

        let client;
        let conversation;

        const init = async () => {
            setStatus('connecting');
            setError('');
            try {
                const { token, identity } = await getConversationsToken();
                client = await Client.create(token);
                clientRef.current = client;

                conversation = await client.getConversationBySid(conversationSid);
                conversationRef.current = conversation;

                const paginator = await conversation.getMessages(50);
                setMessages(paginator.items);
                setStatus('ready');

                conversation.on('messageAdded', (msg) => {
                    setMessages((prev) => [...prev, msg]);
                });

                conversation.on('typingStarted', (participant) => {
                    if (participant.identity !== identity) {
                        setTyping((prev) => [...new Set([...prev, participant.identity])]);
                    }
                });

                conversation.on('typingEnded', (participant) => {
                    setTyping((prev) => prev.filter((id) => id !== participant.identity));
                });

            } catch (err) {
                console.error('CreatorChat init error:', err);
                setStatus('error');
                setError(err?.message || 'Could not connect to chat.');
            }
        };

        init();

        return () => {
            conversation?.removeAllListeners?.();
            client?.shutdown?.();
        };
    }, [conversationSid]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!text.trim() || !conversationRef.current) return;
        try {
            await conversationRef.current.sendMessage(text.trim());
            setText('');
        } catch (err) {
            console.error('Send error:', err);
        }
    };

    const handleTyping = (e) => {
        setText(e.target.value);
        conversationRef.current?.typing().catch(() => {});
    };

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: '100%', minHeight: '360px', maxHeight: '520px',
            background: 'rgba(15,23,42,0.95)', borderRadius: '12px',
            border: '1px solid rgba(148,163,184,0.2)', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderBottom: '1px solid rgba(148,163,184,0.15)',
                background: 'rgba(30,41,59,0.8)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                        background: status === 'ready' ? '#22c55e' : status === 'error' ? '#ef4444' : '#facc15'
                    }} />
                    <span style={{ fontSize: '14px', fontWeight: 700 }}>
                        {status === 'connecting' ? 'Connecting…' : status === 'error' ? 'Connection Error' : '🪶 RavenChat'}
                    </span>
                </div>
                {onClose && (
                    <button onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '20px', cursor: 'pointer' }}
                        aria-label="Close chat">×</button>
                )}
            </div>

            {/* Error state */}
            {status === 'error' && (
                <div style={{ padding: '16px', fontSize: '13px', color: '#fca5a5', textAlign: 'center' }}>
                    ⚠️ {error}
                </div>
            )}

            {/* Messages stream */}
            {status !== 'error' && (
                <div style={{
                    flex: 1, overflowY: 'auto', padding: '12px 14px',
                    display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                    {status === 'connecting' && (
                        <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '12px', marginTop: '20px' }}>
                            Establishing secure connection…
                        </div>
                    )}

                    {messages.map((msg) => {
                        const isOwn = msg.author === currentUser;
                        return (
                            <div key={msg.sid} style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: isOwn ? 'flex-end' : 'flex-start'
                            }}>
                                {!isOwn && (
                                    <span style={{ fontSize: '10px', opacity: 0.6, marginBottom: '2px', paddingLeft: '4px' }}>
                                        {msg.author}
                                    </span>
                                )}
                                <div style={{
                                    maxWidth: '72%', padding: '8px 12px', wordBreak: 'break-word',
                                    borderRadius: isOwn ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                                    background: isOwn
                                        ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                                        : 'rgba(51,65,85,0.8)',
                                    fontSize: '13px', lineHeight: '1.45'
                                }}>
                                    {msg.body}
                                </div>
                                <span style={{ fontSize: '9px', opacity: 0.45, marginTop: '2px' }}>
                                    {msg.dateCreated
                                        ? new Date(msg.dateCreated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                        : ''}
                                </span>
                            </div>
                        );
                    })}

                    {typing.length > 0 && (
                        <div style={{ fontSize: '11px', opacity: 0.6, fontStyle: 'italic' }}>
                            {typing.join(', ')} {typing.length === 1 ? 'is' : 'are'} typing…
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
            )}

            {/* Input */}
            <form onSubmit={sendMessage} style={{
                display: 'flex', gap: '8px', padding: '10px 12px',
                borderTop: '1px solid rgba(148,163,184,0.15)',
                background: 'rgba(30,41,59,0.6)'
            }}>
                <input
                    value={text}
                    onChange={handleTyping}
                    placeholder={status === 'ready' ? 'Message…' : 'Connecting…'}
                    disabled={status !== 'ready'}
                    maxLength={1500}
                    style={{
                        flex: 1, padding: '9px 12px', borderRadius: '8px',
                        border: '1px solid rgba(148,163,184,0.25)',
                        background: 'rgba(15,23,42,0.7)', color: '#f1f5f9',
                        fontSize: '13px', outline: 'none'
                    }}
                />
                <button
                    type="submit"
                    disabled={status !== 'ready' || !text.trim()}
                    style={{
                        padding: '9px 14px', borderRadius: '8px', border: 'none',
                        background: status === 'ready' && text.trim()
                            ? 'linear-gradient(135deg, #6366f1, #3b82f6)'
                            : 'rgba(99,102,241,0.3)',
                        color: '#fff', fontWeight: 700, fontSize: '13px',
                        cursor: status === 'ready' && text.trim() ? 'pointer' : 'not-allowed',
                        transition: 'background 0.2s'
                    }}
                >
                    Send
                </button>
            </form>
        </div>
    );
}
