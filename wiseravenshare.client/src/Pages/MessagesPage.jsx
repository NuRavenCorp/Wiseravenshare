import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createHubConnection } from '../Services/realtimeHub.js';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';

const STORAGE_KEY = 'wiseMessagesConversations';

const formatClock = (value) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const relativeTime = (value) => {
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return 'now';

    const deltaMinutes = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (deltaMinutes < 1) return 'now';
    if (deltaMinutes < 60) return `${deltaMinutes}m`;

    const deltaHours = Math.round(deltaMinutes / 60);
    if (deltaHours < 24) return `${deltaHours}h`;
    return `${Math.round(deltaHours / 24)}d`;
};

const normalizeIncomingMessage = (payload = {}) => ({
    id: String(payload.id || Date.now()),
    senderUserId: String(payload.senderUserId || '').trim().toLowerCase(),
    recipientUserId: String(payload.recipientUserId || '').trim().toLowerCase(),
    text: String(payload.text || '').trim(),
    sentAtUtc: payload.sentAtUtc || new Date().toISOString(),
    fromPersonnel: Boolean(payload.fromPersonnel)
});

const seedConversations = [
    {
        id: 'user2',
        participantUserId: 'user2',
        name: 'Sarah Johnson',
        avatar: 'SJ',
        lastMessage: 'Hey, how are you doing?',
        time: '2h',
        unread: 1,
        online: true,
        messages: [
            { id: 'seed-1', text: "Hey there! How's it going?", incoming: true, time: '10:30 AM', sentAtUtc: new Date().toISOString() }
        ]
    },
    {
        id: 'user3',
        participantUserId: 'user3',
        name: 'Michael Chen',
        avatar: 'MC',
        lastMessage: 'The project is due next week',
        time: '1d',
        unread: 0,
        online: false,
        messages: [
            { id: 'seed-2', text: 'The project is due next week', incoming: true, time: 'Yesterday', sentAtUtc: new Date().toISOString() }
        ]
    }
];

const MessagesPage = () => {
    const { user } = useAuth();
    const { addToast, addNotification } = useNotification();
    const [selectedConversationId, setSelectedConversationId] = useState(null);
    const [messageInput, setMessageInput] = useState('');
    const [isRavenDelivering, setIsRavenDelivering] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const ravenTimerRef = useRef(null);
    const connectionRef = useRef(null);
    const [conversations, setConversations] = useState(() => {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(stored) && stored.length > 0 ? stored : seedConversations;
        } catch {
            return seedConversations;
        }
    });

    const selectedConversation = useMemo(() => {
        if (!selectedConversationId) {
            return null;
        }

        return conversations.find((conversation) => conversation.id === selectedConversationId) || null;
    }, [conversations, selectedConversationId]);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
        } catch {
            // Ignore storage write failures.
        }
    }, [conversations]);

    useEffect(() => () => {
        if (ravenTimerRef.current) {
            clearTimeout(ravenTimerRef.current);
        }
    }, []);

    useEffect(() => {
        const activeUserId = String(user?.id || '').trim().toLowerCase();
        if (!activeUserId) {
            return undefined;
        }

        let isMounted = true;
        const connection = createHubConnection('/hubs/messages');
        connectionRef.current = connection;

        const onIncomingMessage = (rawPayload) => {
            const payload = normalizeIncomingMessage(rawPayload);
            if (!payload.text || !payload.senderUserId || !payload.recipientUserId) {
                return;
            }

            if (payload.senderUserId !== activeUserId && payload.recipientUserId !== activeUserId) {
                return;
            }

            const otherPartyId = payload.senderUserId === activeUserId
                ? payload.recipientUserId
                : payload.senderUserId;
            const incoming = payload.senderUserId !== activeUserId;

            setConversations((prev) => {
                const existing = prev.find((conversation) => conversation.participantUserId === otherPartyId || conversation.id === otherPartyId);
                const messageEntry = {
                    id: payload.id,
                    text: payload.text,
                    incoming,
                    time: formatClock(payload.sentAtUtc),
                    sentAtUtc: payload.sentAtUtc
                };

                if (existing) {
                    return prev.map((conversation) => {
                        if (conversation.id !== existing.id) {
                            return conversation;
                        }

                        const alreadyExists = Array.isArray(conversation.messages)
                            && conversation.messages.some((message) => String(message.id) === payload.id);
                        if (alreadyExists) {
                            return conversation;
                        }

                        const isSelected = selectedConversationId === conversation.id;
                        return {
                            ...conversation,
                            messages: [...(conversation.messages || []), messageEntry],
                            lastMessage: payload.text,
                            time: relativeTime(payload.sentAtUtc),
                            unread: incoming && !isSelected ? (Number(conversation.unread) || 0) + 1 : (Number(conversation.unread) || 0)
                        };
                    });
                }

                const fallbackAvatar = (otherPartyId[0] || 'U').toUpperCase();
                const createdConversation = {
                    id: otherPartyId,
                    participantUserId: otherPartyId,
                    name: payload.fromPersonnel ? 'Wiseravenshare Personnel' : `User ${otherPartyId.slice(0, 6)}`,
                    avatar: payload.fromPersonnel ? 'WS' : fallbackAvatar,
                    lastMessage: payload.text,
                    time: relativeTime(payload.sentAtUtc),
                    unread: incoming ? 1 : 0,
                    online: false,
                    messages: [messageEntry]
                };

                return [createdConversation, ...prev];
            });

            if (incoming) {
                addNotification({
                    title: payload.fromPersonnel ? 'Wiseravenshare Personnel' : 'New message',
                    message: payload.text,
                    type: 'message'
                });
            }
        };

        connection.on('DirectMessageReceived', onIncomingMessage);

        const connect = async () => {
            try {
                await connection.start();
                if (!isMounted) {
                    await connection.stop();
                    return;
                }

                setIsConnected(true);
                await connection.invoke('JoinDirectChannel', activeUserId);
            } catch {
                setIsConnected(false);
                addToast('Real-time messaging is temporarily unavailable.', 'warning');
            }
        };

        connect();

        connection.onclose(() => {
            setIsConnected(false);
        });

        connection.onreconnected(async () => {
            setIsConnected(true);
            try {
                await connection.invoke('JoinDirectChannel', activeUserId);
            } catch {
                // Ignore reconnect join failures.
            }
        });

        return () => {
            isMounted = false;
            connection.off('DirectMessageReceived', onIncomingMessage);
            connectionRef.current = null;
            connection.stop().catch(() => null);
        };
    }, [addNotification, addToast, selectedConversationId, user?.id]);

    const sendMessage = () => {
        const text = messageInput.trim();
        if (!text || !selectedConversation) return;

        const activeUserId = String(user?.id || '').trim().toLowerCase();
        const recipientUserId = String(selectedConversation.participantUserId || selectedConversation.id || '').trim().toLowerCase();
        if (!activeUserId || !recipientUserId) {
            addToast('Please select a valid conversation before sending.', 'warning');
            return;
        }

        setIsRavenDelivering(true);
        if (ravenTimerRef.current) {
            clearTimeout(ravenTimerRef.current);
        }
        ravenTimerRef.current = setTimeout(() => {
            setIsRavenDelivering(false);
        }, 1400);

        setMessageInput('');

        const connection = connectionRef.current;
        if (!connection || connection.state !== 'Connected') {
            addToast('Message queue is offline. Reconnecting to real-time service.', 'warning');
            return;
        }

        connection.invoke('SendDirectMessage', {
            senderUserId: activeUserId,
            recipientUserId,
            text
        }).catch(() => {
            addToast('Failed to send message in real-time.', 'error');
        });
    };

    const selectConversation = (conversation) => {
        setSelectedConversationId(conversation.id);
        // Mark as read
        setConversations(prev => prev.map(conv =>
            conv.id === conversation.id ? { ...conv, unread: 0 } : conv
        ));
    };

    return (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '15px',
            height: 'calc(100vh - 200px)',
            display: 'flex',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
        }}>
            {/* Conversation List */}
            <div style={{
                width: '320px',
                borderRight: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
                    <input
                        type="text"
                        placeholder="Search messages..."
                        style={{
                            width: '100%',
                            padding: '12px 15px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            onClick={() => selectConversation(conv)}
                            style={{
                                padding: '15px',
                                borderBottom: '1px solid var(--border-color)',
                                cursor: 'pointer',
                                transition: 'all 0.3s',
                                background: selectedConversation?.id === conv.id ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}
                        >
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                position: 'relative'
                            }}>
                                {conv.avatar}
                                {conv.online && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '2px',
                                        right: '2px',
                                        width: '12px',
                                        height: '12px',
                                        borderRadius: '50%',
                                        background: '#4caf50',
                                        border: '2px solid var(--card-bg)'
                                    }}></div>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold' }}>{conv.name}</div>
                                <div style={{ fontSize: '13px', color: 'var(--highlight-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {conv.lastMessage}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>{conv.time}</div>
                                {conv.unread > 0 && (
                                    <div style={{
                                        background: 'var(--highlight-color)',
                                        color: 'white',
                                        borderRadius: '50%',
                                        width: '20px',
                                        height: '20px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '11px',
                                        marginTop: '4px'
                                    }}>{conv.unread}</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Message Area */}
            {selectedConversation ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    <div style={{
                        padding: '20px',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                            }}>{selectedConversation.avatar}</div>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{selectedConversation.name}</div>
                                <div style={{ fontSize: '12px', color: selectedConversation.online ? '#4caf50' : 'var(--highlight-color)' }}>
                                    {isConnected ? (selectedConversation.online ? 'Online' : 'Connected') : 'Offline'}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '15px' }}>
                            <button style={{ background: 'none', border: 'none', color: 'var(--highlight-color)', cursor: 'pointer' }}>
                                <i className="fas fa-video"></i>
                            </button>
                            <button style={{ background: 'none', border: 'none', color: 'var(--highlight-color)', cursor: 'pointer' }}>
                                <i className="fas fa-phone"></i>
                            </button>
                        </div>
                    </div>

                    <div style={{
                        flex: 1,
                        padding: '20px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        {selectedConversation.messages.map(msg => (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: msg.incoming ? 'flex-start' : 'flex-end',
                                    maxWidth: '70%',
                                    marginBottom: '15px',
                                    padding: '12px 16px',
                                    borderRadius: '18px',
                                    background: msg.incoming ? 'rgba(255, 255, 255, 0.05)' : 'linear-gradient(135deg, var(--secondary-color), var(--accent-color))',
                                    borderTopLeftRadius: msg.incoming ? '5px' : '18px',
                                    borderTopRightRadius: msg.incoming ? '18px' : '5px'
                                }}
                            >
                                {msg.text}
                                <div style={{ fontSize: '11px', marginTop: '5px', textAlign: 'right', color: 'rgba(255, 255, 255, 0.5)' }}>
                                    {msg.time}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{
                        padding: '20px',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center'
                    }}>
                        <button style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--highlight-color)',
                            cursor: 'pointer',
                            fontSize: '20px'
                        }}>
                            <i className="fas fa-paperclip"></i>
                        </button>
                        <textarea
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="Type a message..."
                            style={{
                                flex: 1,
                                padding: '12px 15px',
                                borderRadius: '25px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-color)',
                                resize: 'none',
                                height: '45px',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button
                            onClick={sendMessage}
                            style={{
                                background: 'linear-gradient(135deg, var(--secondary-color), var(--accent-color))',
                                border: 'none',
                                borderRadius: '50%',
                                width: '45px',
                                height: '45px',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            <i className="fas fa-paper-plane"></i>
                        </button>
                    </div>

                </div>
            ) : (
                <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--highlight-color)'
                }}>
                    <div style={{ textAlign: 'center' }}>
                        <i className="fas fa-comments" style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                        <p>Select a conversation to start messaging</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessagesPage;
