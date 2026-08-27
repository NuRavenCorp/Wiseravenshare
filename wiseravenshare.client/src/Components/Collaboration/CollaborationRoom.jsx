// wiseravenshare.client/src/Components/Collaboration/CollaborationRoom.jsx
// Real-time collaboration room: chat, presence, typing indicators and
// chunked file transfer, wired to the CrossPlatformCollaborationHub via
// the useCollaborationHub hook.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    FiSend, FiPaperclip, FiImage, FiUsers, FiMinimize2, FiMaximize2,
    FiCopy, FiCheck, FiX
} from 'react-icons/fi';
import { useCollaborationHub } from '../../hooks/useCollaborationHub.js';
import { useAuth } from '../../Contexts/AuthContext.jsx';
import PlatformBadge from './PlatformBadge.jsx';
import FileTransfer from './FileTransfer.jsx';
import CollaborationUsers from './CollaborationUsers.jsx';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const CHUNK_SIZE = 64 * 1024;

const panel = {
    background: 'var(--card-bg)', border: '1px solid var(--border-color)',
    borderRadius: '14px', overflow: 'hidden', display: 'flex', flexDirection: 'column'
};

const iconBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-color)', padding: '6px', borderRadius: '8px', display: 'flex'
};

export const CollaborationRoom = ({ roomId, onLeave }) => {
    const { user } = useAuth();
    const {
        isConnected, isConnecting, onEvent, invoke,
        joinRoom, leaveRoom, sendMessage, startFileTransfer, sendFileChunk
    } = useCollaborationHub();

    const [room, setRoom] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [activeUsers, setActiveUsers] = useState([]);
    const [typingUsers, setTypingUsers] = useState([]);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showUsers, setShowUsers] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const [fileTransfers, setFileTransfers] = useState({});

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingRef = useRef({ active: false, timeout: null });
    const isTypingRef = useRef(false);

    const myId = String(user?.id || user?.userId || '');
    const isMine = (id) => String(id) === myId;

    const addSystemMessage = useCallback((content) => {
        setMessages((prev) => [...prev, {
            id: `system-${Date.now()}-${Math.random()}`, userId: 'system',
            username: 'System', message: content, type: 'system',
            platform: 'web', timestamp: new Date()
        }]);
    }, []);

    // Join/leave room lifecycle
    useEffect(() => {
        if (!isConnected || !roomId) return;
        let cancelled = false;
        joinRoom(roomId)
            .then((roomData) => {
                if (cancelled) return;
                if (roomData) {
                    setRoom(roomData);
                    if (Array.isArray(roomData.users)) setActiveUsers(roomData.users);
                }
            })
            .catch(() => addSystemMessage('Failed to join room. It may not exist.'));
        return () => {
            cancelled = true;
            leaveRoom(roomId).catch(() => {});
        };
    }, [isConnected, roomId, joinRoom, leaveRoom, addSystemMessage]);

    // Hub event subscriptions
    useEffect(() => {
        const unsubs = [
            onEvent('ReceiveMessage', (data) => {
                setMessages((prev) => [...prev, {
                    id: data.id || `msg-${Date.now()}-${Math.random()}`,
                    userId: data.userId, username: data.username || data.userId,
                    avatar: data.avatar, message: data.message,
                    type: data.messageType || data.type || 'text',
                    platform: data.platform, timestamp: new Date(data.timestamp || Date.now())
                }]);
            }),
            onEvent('UserJoined', (data) => {
                setActiveUsers((prev) => prev.includes(data.userId) ? prev : [...prev, data.userId]);
                addSystemMessage(`${data.username || data.userId} joined the collaboration`);
            }),
            onEvent('UserLeft', (data) => {
                setActiveUsers((prev) => prev.filter((id) => id !== data.userId));
                setTypingUsers((prev) => prev.filter((id) => id !== data.userId));
                addSystemMessage(`${data.username || data.userId} left the collaboration`);
            }),
            onEvent('UserTyping', (data) => {
                setTypingUsers((prev) => data.isTyping
                    ? (prev.includes(data.userId) ? prev : [...prev, data.userId])
                    : prev.filter((id) => id !== data.userId));
            }),
            onEvent('FileTransferStarted', (data) => {
                setFileTransfers((prev) => ({ ...prev, [data.transferId]: {
                    id: data.transferId, name: data.fileName, size: data.fileSize || 0,
                    type: data.fileType || '', progress: 0, status: 'uploading',
                    sender: data.username || data.userId
                }}));
            }),
            onEvent('FileTransferProgress', (data) => {
                setFileTransfers((prev) => {
                    const t = prev[data.transferId];
                    return t ? { ...prev, [data.transferId]: { ...t, progress: data.progress } } : prev;
                });
            }),
            onEvent('FileTransferComplete', (data) => {
                setFileTransfers((prev) => {
                    const t = prev[data.transferId];
                    return t ? { ...prev, [data.transferId]: { ...t, status: 'complete', progress: 100 } } : prev;
                });
                setTimeout(() => setFileTransfers((prev) => {
                    const next = { ...prev };
                    delete next[data.transferId];
                    return next;
                }), 4000);
            })
        ];
        return () => unsubs.forEach((fn) => fn());
    }, [onEvent, addSystemMessage]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!newMessage.trim() || isSending) return;
        setIsSending(true);
        try {
            await sendMessage(roomId, newMessage.trim(), 'text');
            setNewMessage('');
            if (isTypingRef.current) {
                isTypingRef.current = false;
                invoke('StopTyping', roomId).catch(() => {});
            }
        } catch {
            addSystemMessage('Failed to send message.');
        } finally {
            setIsSending(false);
        }
    };

    const handleTyping = (e) => {
        setNewMessage(e.target.value);
        if (e.target.value.trim() && !isTypingRef.current) {
            isTypingRef.current = true;
            invoke('StartTyping', roomId).catch(() => {});
        }
        if (typingRef.current.timeout) clearTimeout(typingRef.current.timeout);
        typingRef.current.timeout = setTimeout(() => {
            if (isTypingRef.current) {
                isTypingRef.current = false;
                invoke('StopTyping', roomId).catch(() => {});
            }
        }, 2000);
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            addSystemMessage('File size exceeds the 100MB limit.');
            return;
        }
        let transferId;
        try {
            const result = await startFileTransfer(roomId, file.name, file.size, file.type);
            transferId = result?.transferId || `${Date.now()}`;
        } catch {
            addSystemMessage('Failed to start file transfer.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                await sendFileChunk(transferId, e.target.result, reader.chunkIndex, reader.totalChunks);
            } catch {
                addSystemMessage(`File transfer failed: ${file.name}`);
                return;
            }
            reader.chunkIndex += 1;
            setFileTransfers((prev) => {
                const t = prev[transferId];
                return t ? { ...prev, [transferId]: {
                    ...t, progress: Math.round((reader.chunkIndex / reader.totalChunks) * 100)
                }} : prev;
            });
            if (reader.chunkIndex < reader.totalChunks) readNextChunk();
        };
        const readNextChunk = () => {
            const start = reader.chunkIndex * CHUNK_SIZE;
            reader.readAsDataURL(file.slice(start, Math.min(start + CHUNK_SIZE, file.size)));
        };
        reader.chunkIndex = 0;
        reader.totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        readNextChunk();
    };

    const handleCopyLink = () => {
        navigator.clipboard?.writeText(`${window.location.origin}/?room=${roomId}`);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2500);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    if (!isConnected) {
        return (
            <div style={{ ...panel, padding: '40px', textAlign: 'center' }}>
                {isConnecting ? (
                    <>
                        <div className="collab-spinner" />
                        <p style={{ color: 'var(--light-color)' }}>Connecting to collaboration server...</p>
                    </>
                ) : (
                    <p style={{ color: 'var(--danger-color, #ef4444)' }}>
                        Unable to reach the collaboration server. Please refresh to retry.
                    </p>
                )}
            </div>
        );
    }

    return (
        <div
            style={{
                ...panel,
                height: isFullscreen ? 'calc(100vh - 90px)' : '560px',
                position: isFullscreen ? 'fixed' : 'relative',
                inset: isFullscreen ? '70px 8px 8px 8px' : undefined,
                zIndex: isFullscreen ? 50 : undefined
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderBottom: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                    <h3 style={{ margin: 0, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {room?.name || `Room ${roomId}`}
                    </h3>
                    <PlatformBadge platform={room?.platform || 'web'} size="xs" />
                    <span style={{ fontSize: '11px', color: 'var(--light-color)', whiteSpace: 'nowrap' }}>
                        {activeUsers.length} online
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <button onClick={handleCopyLink} style={iconBtn} title="Copy invite link">
                        {copySuccess ? <FiCheck size={16} color="#22c55e" /> : <FiCopy size={16} />}
                    </button>
                    <button onClick={() => setShowUsers(!showUsers)} style={iconBtn} title="Users">
                        <FiUsers size={16} />
                    </button>
                    <button onClick={() => setIsMinimized(!isMinimized)} style={iconBtn} title="Minimize">
                        {isMinimized ? <FiMaximize2 size={16} /> : <FiMinimize2 size={16} />}
                    </button>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} style={iconBtn} title="Fullscreen">
                        {isFullscreen ? <FiMinimize2 size={16} /> : <FiMaximize2 size={16} />}
                    </button>
                    {onLeave && (
                        <button onClick={onLeave} style={iconBtn} title="Leave room">
                            <FiX size={16} color="var(--danger-color, #ef4444)" />
                        </button>
                    )}
                </div>
            </div>

            {!isMinimized && (
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {/* Chat column */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div style={{
                            display: 'flex', gap: '6px', padding: '6px 10px', overflowX: 'auto',
                            borderBottom: '1px solid var(--border-color)', alignItems: 'center'
                        }}>
                            {activeUsers.slice(0, 8).map((id) => (
                                <span key={id} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    fontSize: '11px', padding: '3px 8px', borderRadius: 999,
                                    background: 'rgba(255,255,255,0.06)', whiteSpace: 'nowrap'
                                }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                                    {isMine(id) ? 'You' : String(id).slice(0, 12)}
                                </span>
                            ))}
                            {activeUsers.length > 8 && (
                                <span style={{ fontSize: '11px', color: 'var(--light-color)' }}>
                                    +{activeUsers.length - 8} more
                                </span>
                            )}
                            {typingUsers.length > 0 && (
                                <span style={{ fontSize: '11px', color: 'var(--light-color)' }} className="collab-typing">
                                    {typingUsers.length === 1 ? 'Someone is' : `${typingUsers.length} users are`} typing...
                                </span>
                            )}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {messages.map((msg) => {
                                if (msg.type === 'system') {
                                    return (
                                        <div key={msg.id} style={{
                                            alignSelf: 'center', fontSize: '11px', padding: '3px 10px',
                                            borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'var(--light-color)'
                                        }}>
                                            {msg.message}
                                        </div>
                                    );
                                }
                                const mine = isMine(msg.userId);
                                return (
                                    <div key={msg.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
                                        <div style={{
                                            padding: '8px 12px', borderRadius: '12px',
                                            background: mine ? 'rgba(79,140,255,0.18)' : 'rgba(255,255,255,0.06)'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                                                <img
                                                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(msg.userId)}`}
                                                    alt="" width={18} height={18} style={{ borderRadius: '50%' }}
                                                />
                                                <span style={{ fontSize: '11px', fontWeight: 600 }}>
                                                    {mine ? 'You' : msg.username}
                                                </span>
                                                {msg.platform && msg.platform !== 'web' && (
                                                    <PlatformBadge platform={msg.platform} size="xs" showLabel={false} />
                                                )}
                                                <span style={{ fontSize: '10px', color: 'var(--light-color)' }}>
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '13px', wordBreak: 'break-word' }}>{msg.message}</p>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <label style={{ ...iconBtn, cursor: 'pointer' }} title="Attach file">
                                    <FiPaperclip size={18} />
                                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} />
                                </label>
                                <label style={{ ...iconBtn, cursor: 'pointer' }} title="Send image">
                                    <FiImage size={18} />
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
                                </label>
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={handleTyping}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Type a message..."
                                    style={{
                                        flex: 1, padding: '8px 12px', fontSize: '13px',
                                        background: 'var(--background-color, rgba(255,255,255,0.05))',
                                        color: 'var(--text-color)', border: '1px solid var(--border-color)', borderRadius: '10px'
                                    }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!newMessage.trim() || isSending}
                                    style={{
                                        border: 'none', cursor: 'pointer', padding: '9px 12px',
                                        borderRadius: '10px', display: 'flex', alignItems: 'center',
                                        background: 'var(--highlight-color)', color: '#fff',
                                        opacity: !newMessage.trim() || isSending ? 0.5 : 1
                                    }}
                                    title="Send"
                                >
                                    <FiSend size={16} />
                                </button>
                            </div>
                            <FileTransfer
                                files={Object.values(fileTransfers)}
                                onCancel={(id) => setFileTransfers((prev) => {
                                    const next = { ...prev };
                                    delete next[id];
                                    return next;
                                })}
                            />
                        </div>
                    </div>

                    {/* Users sidebar */}
                    {showUsers && (
                        <div style={{
                            width: 260, flexShrink: 0, borderLeft: '1px solid var(--border-color)'
                        }}>
                            <CollaborationUsers
                                users={activeUsers}
                                currentUser={user}
                                onClose={() => setShowUsers(false)}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default CollaborationRoom;
