// wiseravenshare.client/src/Components/Collaboration/CollaborationUsers.jsx
// Sidebar list of connected users with search + online presence.

import React, { useState } from 'react';
import { FiX, FiSearch } from 'react-icons/fi';
import PlatformBadge from './PlatformBadge.jsx';

export const CollaborationUsers = ({ users = [], currentUser, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = users.filter((userId) =>
        String(userId).toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px', borderBottom: '1px solid var(--border-color)'
            }}>
                <h4 style={{ margin: 0, fontSize: '14px' }}>Users ({users.length})</h4>
                <button onClick={onClose} style={iconBtn}><FiX size={16} /></button>
            </div>

            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ position: 'relative' }}>
                    <FiSearch size={14} style={{
                        position: 'absolute', left: 10, top: '50%',
                        transform: 'translateY(-50%)', color: 'var(--light-color)'
                    }} />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', boxSizing: 'border-box', paddingLeft: '30px', paddingRight: '10px',
                            padding: '8px 10px 8px 30px', fontSize: '13px',
                            background: 'var(--card-bg)', color: 'var(--text-color)',
                            border: '1px solid var(--border-color)', borderRadius: '8px'
                        }}
                    />
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {filtered.map((userId) => {
                    const isCurrentUser = String(userId) === String(currentUser?.id || currentUser?.userId);
                    return (
                        <div
                            key={userId}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '8px', borderRadius: '8px',
                                background: isCurrentUser ? 'rgba(79,140,255,0.12)' : 'transparent'
                            }}
                        >
                            <img
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(userId)}`}
                                alt={userId}
                                width={28} height={28}
                                style={{ borderRadius: '50%', background: 'var(--border-color)' }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {isCurrentUser ? 'You' : String(userId).slice(0, 12)}
                                    </span>
                                    {isCurrentUser && <span style={{ fontSize: '10px', color: 'var(--highlight-color)' }}>(you)</span>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                                    <span style={{ fontSize: '10px', color: 'var(--light-color)' }}>Online</span>
                                </div>
                            </div>
                            <PlatformBadge platform="web" size="xs" showLabel={false} />
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <p style={{ fontSize: '12px', color: 'var(--light-color)', textAlign: 'center' }}>No users found</p>
                )}
            </div>
        </div>
    );
};

const iconBtn = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-color)', padding: '4px', borderRadius: '6px', display: 'flex'
};

export default CollaborationUsers;
