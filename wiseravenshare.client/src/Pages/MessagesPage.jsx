import React, { useEffect, useRef, useState } from 'react';

const MessagesPage = () => {
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messageInput, setMessageInput] = useState('');
    const [isRavenDelivering, setIsRavenDelivering] = useState(false);
    const [flightToken, setFlightToken] = useState(0);
    const ravenTimerRef = useRef(null);
    const [conversations, setConversations] = useState([
        {
            id: 1,
            name: 'Sarah Johnson',
            avatar: 'SJ',
            lastMessage: 'Hey, how are you doing?',
            time: '2h',
            unread: 3,
            online: true,
            messages: [
                { id: 1, text: 'Hey there! How\'s it going?', incoming: true, time: '10:30 AM' },
                { id: 2, text: 'I\'m doing great! Just working on some new features for Wiseraven.', incoming: false, time: '10:32 AM' },
                { id: 3, text: 'That sounds interesting! What kind of features?', incoming: true, time: '10:33 AM' }
            ]
        },
        {
            id: 2,
            name: 'Michael Chen',
            avatar: 'MC',
            lastMessage: 'The project is due next week',
            time: '1d',
            unread: 0,
            online: false,
            messages: [
                { id: 1, text: 'Hey Michael, how\'s the project going?', incoming: false, time: 'Yesterday' },
                { id: 2, text: 'The project is due next week', incoming: true, time: 'Yesterday' }
            ]
        }
    ]);

    useEffect(() => () => {
        if (ravenTimerRef.current) {
            clearTimeout(ravenTimerRef.current);
        }
    }, []);

    const sendMessage = () => {
        if (!messageInput.trim() || !selectedConversation) return;

        const newMessage = {
            id: Date.now(),
            text: messageInput,
            incoming: false,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setConversations(prev => prev.map(conv =>
            conv.id === selectedConversation.id
                ? { ...conv, messages: [...conv.messages, newMessage], lastMessage: messageInput }
                : conv
        ));

        setFlightToken(Date.now());
        setIsRavenDelivering(true);
        if (ravenTimerRef.current) {
            clearTimeout(ravenTimerRef.current);
        }
        ravenTimerRef.current = setTimeout(() => {
            setIsRavenDelivering(false);
        }, 1400);

        setMessageInput('');

        // Simulate reply
        setTimeout(() => {
            const replies = ['Interesting!', 'Tell me more.', 'I see.', 'Thanks for sharing!'];
            const replyMessage = {
                id: Date.now() + 1,
                text: replies[Math.floor(Math.random() * replies.length)],
                incoming: true,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setConversations(prev => prev.map(conv =>
                conv.id === selectedConversation.id
                    ? { ...conv, messages: [...conv.messages, replyMessage] }
                    : conv
            ));
        }, 1000);
    };

    const selectConversation = (conversation) => {
        setSelectedConversation(conversation);
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
                                    {selectedConversation.online ? 'Online' : 'Offline'}
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

                    {isRavenDelivering && (
                        <div className="raven-flight-overlay" key={flightToken}>
                            <div className="raven-flight-trail"></div>
                            <div className="raven-flight-icon" aria-hidden="true">
                                <i className="fas fa-crow"></i>
                            </div>
                            <div className="raven-flight-label">Delivering message...</div>
                        </div>
                    )}
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
