import React, { useState } from 'react';
import { useAuth } from '../Contexts/AuthContext';
import { useNotification } from '../Contexts/NotificationContext';
import { apiService } from '../Services/api';

const AcceptTeamInvitePage = () => {
    const { user, acceptTeamInvite } = useAuth();
    const { addToast } = useNotification();
    
    // We already know their email, but we'll include it readonly or hidden?
    // Wait, the API needs the email. Let's just use user.email.
    const [inviteToken, setInviteToken] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!inviteToken.trim() || !password.trim()) {
            addToast('Invite token and password are required.', 'warning');
            return;
        }

        setLoading(true);
        try {
            await acceptTeamInvite({ 
                inviteToken: inviteToken.trim(), 
                email: user.email, 
                password: password, 
                name: user.name || ''
            });
            addToast('Team invite accepted successfully.', 'success');
            setInviteToken('');
            setPassword('');
        } catch (error) {
            addToast(error.message || 'Failed to accept team invite.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '20px' }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ marginTop: 0, marginBottom: '10px' }}>Join a Team</h2>
                <div style={{ color: 'var(--light-color)', fontSize: '14px', marginBottom: '24px' }}>
                    Enter your team invite token and your current password to join the team.
                </div>
                
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', marginBottom: '6px', color: 'var(--light-color)' }}>Account Email</label>
                        <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.02)',
                                color: 'var(--light-color)',
                                cursor: 'not-allowed'
                            }}
                        />
                    </div>
                    <div>
                        <input
                            type="text"
                            placeholder="Team Invite Token"
                            value={inviteToken}
                            onChange={(e) => setInviteToken(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Current Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '14px',
                            background: 'var(--highlight-color)',
                            color: 'var(--text-color)',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'Processing...' : 'Accept Team Invite'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AcceptTeamInvitePage;
