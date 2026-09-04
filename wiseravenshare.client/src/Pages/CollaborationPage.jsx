// wiseravenshare.client/src/Pages/CollaborationPage.jsx
// Cross-platform collaboration: lobby (create/join room) + in-room chat view.
// Adapted from the TSX design to this project's conventions: state-based
// navigation via onNavigate, useCollaborationHub hook, inline styles.

import React, { useState, useEffect } from 'react';
import { FiPlus, FiLink, FiUsers, FiMessageSquare, FiShare2, FiGlobe } from 'react-icons/fi';
import { useCollaborationHub } from '../hooks/useCollaborationHub.js';
import { detectPlatform } from '../utils/platformDetector.js';
import PlatformBadge from '../Components/Collaboration/PlatformBadge.jsx';
import CollaborationRoom from '../Components/Collaboration/CollaborationRoom.jsx';
import { ErrorBoundary } from '../Components/Common/ErrorBoundary.jsx';
import { consumeCollaborationHandoff } from '../Services/collaborationBridge';

const card = {
    background: 'transparent', border: '1px solid var(--border-color)',
    borderRadius: '14px', padding: '20px'
};

const input = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: '13px',
    background: 'transparent', color: 'var(--text-color)',
    border: '1px solid var(--border-color)', borderRadius: '10px'
};

const primaryBtn = {
    width: '100%', border: 'none', cursor: 'pointer', padding: '11px',
    borderRadius: '10px', fontWeight: 600, fontSize: '13px',
    background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))', color: '#fff'
};

const featureTile = {
    padding: '12px 8px', borderRadius: '10px', textAlign: 'center',
    background: 'transparent'
};

const extractRoomId = (roomPayload) => {
    if (typeof roomPayload === 'string') {
        const direct = roomPayload.trim();
        return direct || '';
    }

    if (!roomPayload || typeof roomPayload !== 'object') {
        return '';
    }

    const candidates = [
        roomPayload.roomId,
        roomPayload.roomID,
        roomPayload.room_id,
        roomPayload.id,
        roomPayload.RoomId
    ];

    for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) {
            return value;
        }
    }

    return '';
};

const CollaborationPage = ({ initialRoomId }) => {
    const { isConnected, isConnecting, createRoom, joinRoom } = useCollaborationHub();
    const [platform, setPlatform] = useState('web');
    const [activeRoomId, setActiveRoomId] = useState(initialRoomId || null);
    const [tab, setTab] = useState('create');
    const [roomName, setRoomName] = useState('');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setPlatform(detectPlatform().platform);
    }, []);

    useEffect(() => {
        const handoff = consumeCollaborationHandoff();
        if (!handoff) {
            return;
        }

        if (handoff.mode === 'join') {
            setTab('join');
            setJoinRoomId(String(handoff.roomIdOrLink || '').trim());
            return;
        }

        setTab('create');
        setRoomName(String(handoff.roomName || '').trim());
    }, []);

    // Support deep links like /?room=ROOMID
    useEffect(() => {
        if (!activeRoomId && typeof window !== 'undefined') {
            const roomId = new URLSearchParams(window.location.search).get('room');
            if (roomId) setActiveRoomId(roomId);
        }
    }, [activeRoomId]);

    const handleCreateRoom = async () => {
        if (!roomName.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
            const room = await createRoom(roomName.trim(), platform);
            const roomId = extractRoomId(room);
            if (roomId) setActiveRoomId(roomId);
            else setError('Room created but no ID was returned.');
        } catch (err) {
            setError(err?.message || 'Failed to create room.');
        } finally {
            setBusy(false);
        }
    };

    const handleJoinRoom = async () => {
        // Accept a raw ID or a full invite link containing ?room=
        const raw = joinRoomId.trim();
        if (!raw || busy) return;
        let roomId = raw;
        const match = raw.match(/[?&]room=([^&]+)/);
        if (match) roomId = decodeURIComponent(match[1]);
        setBusy(true);
        setError(null);
        try {
            await joinRoom(roomId);
            setActiveRoomId(roomId);
        } catch (err) {
            setError(err?.message || 'Failed to join room.');
        } finally {
            setBusy(false);
        }
    };

    if (activeRoomId) {
        return (
            <ErrorBoundary>
                <CollaborationRoom
                    roomId={activeRoomId}
                    onLeave={() => {
                        setActiveRoomId(null);
                        if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
                            window.history.replaceState({}, '', window.location.pathname);
                        }
                    }}
                />
            </ErrorBoundary>
        );
    }

    const tabBtn = (id, Icon, label) => (
        <button
            onClick={() => setTab(id)}
            style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '10px', borderRadius: '10px', cursor: 'pointer', fontSize: '13px',
                border: 'none', fontWeight: tab === id ? 600 : 400,
                background: tab === id ? 'var(--highlight-color)' : 'transparent',
                color: tab === id ? '#fff' : 'var(--light-color)'
            }}
        >
            <Icon size={14} /> {label}
        </button>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: 640, margin: '0 auto' }}>
            <div style={{ textAlign: 'center' }}>
                <img
                    src="/raven-enflight.jpeg"
                    alt="Raven enflight"
                    style={{
                        width: '96px',
                        height: '96px',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        border: '1px solid var(--border-color)',
                        marginBottom: '10px'
                    }}
                />
                <h1 style={{ margin: '0 0 6px', fontSize: '22px' }}>Cross-Platform Collaboration</h1>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--light-color)' }}>
                    Connect and collaborate with users across TikTok, Facebook, Instagram and more
                </p>
                <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <PlatformBadge platform={platform} size="md" />
                </div>
            </div>

            {!isConnected && (
                <div style={{ ...card, textAlign: 'center', fontSize: '12px', color: 'var(--light-color)' }}>
                    {isConnecting ? 'Connecting to collaboration server...' : 'Offline — reconnecting...'}
                </div>
            )}

            <div style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '12px', background: 'transparent', border: '1px solid var(--border-color)' }}>
                {tabBtn('create', FiPlus, 'Create Room')}
                {tabBtn('join', FiLink, 'Join Room')}
            </div>

            <div style={card}>
                {tab === 'create' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>
                                Room Name
                            </label>
                            <input
                                type="text"
                                value={roomName}
                                onChange={(e) => setRoomName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                                placeholder="Enter collaboration room name..."
                                style={input}
                            />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                            <div style={featureTile}>
                                <FiUsers size={18} color="var(--highlight-color)" />
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>Unlimited Users</div>
                            </div>
                            <div style={featureTile}>
                                <FiMessageSquare size={18} color="var(--highlight-color)" />
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>Real-time Chat</div>
                            </div>
                            <div style={featureTile}>
                                <FiShare2 size={18} color="var(--highlight-color)" />
                                <div style={{ fontSize: '10px', color: 'var(--light-color)', marginTop: '4px' }}>File Sharing</div>
                            </div>
                        </div>
                        <button
                            onClick={handleCreateRoom}
                            disabled={!roomName.trim() || busy || !isConnected}
                            style={{ ...primaryBtn, opacity: !roomName.trim() || busy || !isConnected ? 0.5 : 1 }}
                        >
                            {busy ? 'Creating...' : 'Create Collaboration Room'}
                        </button>
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--light-color)', textAlign: 'center' }}>
                            Share the room link with others to collaborate across platforms
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>
                                Room ID or Invite Link
                            </label>
                            <input
                                type="text"
                                value={joinRoomId}
                                onChange={(e) => setJoinRoomId(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                                placeholder="Paste room ID or invite link..."
                                style={input}
                            />
                        </div>
                        <button
                            onClick={handleJoinRoom}
                            disabled={!joinRoomId.trim() || busy || !isConnected}
                            style={{ ...primaryBtn, opacity: !joinRoomId.trim() || busy || !isConnected ? 0.5 : 1 }}
                        >
                            {busy ? 'Joining...' : 'Join Room'}
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '11px', color: 'var(--light-color)' }}>
                            <FiGlobe size={12} /> <span>Rooms work across all platforms</span>
                        </div>
                    </div>
                )}
            </div>

            {error && (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger-color, #ef4444)', textAlign: 'center' }}>{error}</p>
            )}

            <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--light-color)' }}>
                <p style={{ margin: '2px 0' }}>⚡ Real-time collaboration powered by SignalR</p>
                <p style={{ margin: '2px 0' }}>📱 Works on TikTok, Facebook, Instagram, Twitter and Web</p>
            </div>
        </div>
    );
};

export default CollaborationPage;
