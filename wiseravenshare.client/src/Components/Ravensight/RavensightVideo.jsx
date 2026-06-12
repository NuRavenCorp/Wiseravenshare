import React, { useState } from 'react';
import VideoRecorder from './VideoRecorder';
import VideoFeed from './VideoFeed';
import VideoUploader from './VideoUploader';
import VideoLibrary from './VideoLibrary';
import WiseRavenLogo from '../Common/WiseRavenLogo';

const RavensightVideo = () => {
    const [activeTab, setActiveTab] = useState('record'); // record, feed, upload, library
    const [notifications, setNotifications] = useState([]);
    const addNotification = (message, type = 'info') => {
        const id = Date.now();
        setNotifications(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== id));
        }, 5000);
    };

    const tabs = [
        { id: 'record', label: '🎥 Record Video', icon: '🎥' },
        { id: 'feed', label: '📺 Video Feed', icon: '📺' },
        { id: 'upload', label: '📤 Upload to YouTube', icon: '📤' },
        { id: 'library', label: '📚 My Library', icon: '📚' }
    ];

    return (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '16px',
            overflow: 'hidden',
            border: '1px solid var(--border-color)'
        }}>
            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, var(--highlight-color) 0%, var(--accent-color) 100%)',
                padding: '20px',
                color: 'white'
            }}>
                <div style={{ marginBottom: '10px' }}>
                    <WiseRavenLogo showTagline={false} />
                </div>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                    <i className="fas fa-crow"></i>
                    Ravensight Video Studio
                </h2>
                <p style={{ opacity: 0.9 }}>Record, upload, and share videos directly to YouTube</p>
            </div>

            {/* Tab Navigation */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--secondary-color)',
                padding: '0 20px'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '15px 25px',
                            background: activeTab === tab.id ? 'var(--card-bg)' : 'transparent',
                            border: 'none',
                            color: activeTab === tab.id ? 'var(--text-color)' : 'var(--highlight-color)',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            borderBottom: activeTab === tab.id ? '3px solid var(--highlight-color)' : 'none',
                            transition: 'all 0.3s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div style={{ padding: '20px', minHeight: '600px' }}>
                {activeTab === 'record' && (
                    <VideoRecorder onNotification={addNotification} />
                )}
                {activeTab === 'feed' && (
                    <VideoFeed onNotification={addNotification} />
                )}
                {activeTab === 'upload' && (
                    <VideoUploader onNotification={addNotification} />
                )}
                {activeTab === 'library' && (
                    <VideoLibrary onNotification={addNotification} />
                )}
            </div>

            {/* Notifications */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 1000
            }}>
                {notifications.map(notif => (
                    <div
                        key={notif.id}
                        style={{
                            background: notif.type === 'success' ? '#4caf50' :
                                notif.type === 'error' ? '#f44336' :
                                    notif.type === 'warning' ? '#ff9800' : '#2196f3',
                            color: 'white',
                            padding: '12px 20px',
                            borderRadius: '8px',
                            marginBottom: '10px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            animation: 'slideIn 0.3s ease-out',
                            cursor: 'pointer'
                        }}
                        onClick={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))}
                    >
                        {notif.message}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RavensightVideo;