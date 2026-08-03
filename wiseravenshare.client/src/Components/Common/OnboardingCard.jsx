import React, { useEffect, useState } from 'react';
import { apiService } from '../../Services/api';

const OnboardingCard = ({ onNavigate }) => {
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        try {
            const response = await apiService.getOnboardingState();
            setState(response.data);
        } catch {
            setState(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    if (loading || !state || state.completedSteps >= state.totalSteps) {
        return null;
    }

    const items = [
        { key: 'welcomeCompleted', label: 'Welcome completed' },
        { key: 'profileCompleted', label: 'Complete your profile' },
        { key: 'firstPostCompleted', label: 'Create your first post' },
        { key: 'firstFollowCompleted', label: 'Follow one creator' },
        { key: 'inviteSentCompleted', label: 'Invite one friend' }
    ];

    return (
        <div
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '14px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Activation Checklist</h3>
                <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                    {state.completedSteps}/{state.totalSteps}
                </span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', marginTop: '10px', overflow: 'hidden' }}>
                <div
                    style={{
                        height: '100%',
                        width: `${state.progressPercent}%`,
                        background: 'linear-gradient(90deg, var(--highlight-color), var(--accent-color))'
                    }}
                />
            </div>
            <div style={{ marginTop: '10px', display: 'grid', gap: '6px' }}>
                {items.map((item) => (
                    <div key={item.key} style={{ fontSize: '13px', opacity: state[item.key] ? 1 : 0.85 }}>
                        {state[item.key] ? '✓' : '○'} {item.label}
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button
                    onClick={() => onNavigate?.('profile')}
                    style={{
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-color)',
                        borderRadius: '999px',
                        padding: '6px 10px',
                        cursor: 'pointer'
                    }}
                >
                    Complete Profile
                </button>
                <button
                    onClick={() => onNavigate?.('growth')}
                    style={{
                        border: '1px solid var(--highlight-color)',
                        background: 'var(--highlight-color)',
                        color: 'white',
                        borderRadius: '999px',
                        padding: '6px 10px',
                        cursor: 'pointer'
                    }}
                >
                    Invite Friends
                </button>
            </div>
        </div>
    );
};

export default OnboardingCard;
