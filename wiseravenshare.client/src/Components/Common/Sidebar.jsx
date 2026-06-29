import React, { useEffect, useState } from 'react';
import { socialGraphService } from '../../Services/SocialGraph';
import WiseRavenLogo from './WiseRavenLogo';

const Sidebar = ({ onNavigate, currentPage, user }) => {
    const [counts, setCounts] = useState({ followers: 0, following: 0 });

    useEffect(() => {
        if (!user?.id) return undefined;

        const refreshCounts = () => {
            setCounts(socialGraphService.getCounts(user.id));
        };

        socialGraphService.registerUserProfile(user);
        refreshCounts();

        window.addEventListener('wiseraven:social-updated', refreshCounts);
        return () => {
            window.removeEventListener('wiseraven:social-updated', refreshCounts);
        };
    }, [user?.id]);

    const menuItems = [
        { id: 'feed', icon: 'fas fa-home', label: 'Feed' },
        { id: 'discover', icon: 'fas fa-compass', label: 'Discover' },
        { id: 'bookmarks', icon: 'fas fa-bookmark', label: 'Bookmarks' },
        { id: 'notifications', icon: 'fas fa-bell', label: 'Notifications' },
        { id: 'messages', icon: 'fas fa-envelope', label: 'Messages' },
        { id: 'planner', icon: 'fas fa-tasks', label: 'Planner' },
        { id: 'truthseeker', icon: 'fas fa-shield-alt', label: 'Truth Seeker' },
        { id: 'ainews', icon: 'fas fa-newspaper', label: 'AI News' },
        { id: 'ravensight', icon: 'fas fa-video', label: 'Ravensight' },
        { id: 'profile', icon: 'fas fa-user', label: 'Profile' }
    ];

    const profile = {
        name: user?.name || 'Alex Raven',
        avatar: user?.avatar || (user?.name ? user.name.charAt(0).toUpperCase() : 'AR'),
        followers: counts.followers,
        following: counts.following
    };

    const hasImageAvatar = typeof profile.avatar === 'string' && (profile.avatar.startsWith('data:image/') || profile.avatar.startsWith('http'));

    return (
        <aside className="left-column">
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '14px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'center'
            }}>
                <WiseRavenLogo />
            </div>
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                textAlign: 'center',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{
                    width: '100px',
                    height: '100px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    fontSize: '36px',
                    fontWeight: 'bold',
                    color: 'white'
                }}>
                    {hasImageAvatar ? (
                        <img
                            src={profile.avatar}
                            alt="User avatar"
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                        />
                    ) : (
                        profile.avatar
                    )}
                </div>
                <h3>{profile.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '10px', fontSize: '0.9rem' }}>
                    <span><i className="fas fa-users"></i> {profile.followers.toLocaleString()} followers</span>
                    <span><i className="fas fa-user-friends"></i> {profile.following.toLocaleString()} following</span>
                </div>
            </div>

            <ul style={{
                listStyle: 'none',
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '10px 0',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                border: '1px solid var(--border-color)'
            }}>
                {menuItems.map(item => (
                    <li key={item.id}>
                        <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); onNavigate(item.id); }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '12px 20px',
                                color: 'var(--text-color)',
                                textDecoration: 'none',
                                gap: '10px',
                                transition: 'all 0.3s ease',
                                ...(currentPage === item.id ? {
                                    color: 'var(--light-color)',
                                    fontWeight: 'bold',
                                    borderLeft: `3px solid var(--light-color)`,
                                    background: 'rgba(255, 255, 255, 0.1)'
                                } : {})
                            }}
                            onMouseEnter={(e) => {
                                if (currentPage !== item.id) {
                                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                                    e.currentTarget.style.borderLeft = '3px solid var(--highlight-color)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (currentPage !== item.id) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.borderLeft = 'none';
                                }
                            }}
                        >
                            <i className={item.icon}></i>
                            <span>{item.label}</span>
                        </a>
                    </li>
                ))}
            </ul>
        </aside>
    );
};

export default Sidebar;
