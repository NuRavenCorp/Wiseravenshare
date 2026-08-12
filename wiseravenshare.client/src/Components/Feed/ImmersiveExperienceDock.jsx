import React, { useMemo, useState } from 'react';

const featureGroups = [
    {
        title: 'Visual & Immersive Elements',
        accent: '#8b5cf6',
        items: [
            'Edge-to-Edge Media Player',
            'Auto-Play Engines',
            'Audio Overlay Controls',
            'Filter & Effect Triggers'
        ]
    },
    {
        title: 'Gamification & Retention',
        accent: '#f59e0b',
        items: [
            'Streak Indicators',
            'Reaction Sliders',
            'Interactive Polls',
            'Soundbite Triggers'
        ]
    },
    {
        title: 'Casual & Fast Navigation',
        accent: '#22c55e',
        items: [
            'Swipe-to-Next Gestures',
            'Surprise Me',
            'Double-Tap to Heart',
            'Picture-in-Picture'
        ]
    },
    {
        title: 'Shared-Experience Features',
        accent: '#38bdf8',
        items: [
            'Watch Party Rooms',
            'Remix / Duet Triggers',
            'Quick-Share Grid'
        ]
    }
];

const shareFriends = ['AL', 'MJ', 'SK', 'NT', 'RV'];

const DemoMediaPlayer = () => {
    const [hearts, setHearts] = useState([]);
    const [slider, setSlider] = useState(78);
    const [vote, setVote] = useState('Love it');

    const heartBurst = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const left = event.clientX - rect.left;
        const top = event.clientY - rect.top;
        const id = `${Date.now()}-${Math.random()}`;

        setHearts((prev) => [...prev, { id, left, top }]);
        setTimeout(() => {
            setHearts((prev) => prev.filter((item) => item.id !== id));
        }, 700);
    };

    const reactions = useMemo(() => [
        { label: '🔥', value: 'Loved it' },
        { label: '😄', value: 'Funny' },
        { label: '🤯', value: 'Mind blown' },
        { label: '💡', value: 'Insightful' }
    ], []);

    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.95))',
            border: '1px solid rgba(148,163,184,0.24)',
            borderRadius: '18px',
            padding: '12px',
            marginBottom: '18px',
            boxShadow: '0 14px 30px rgba(15, 23, 42, 0.38)'
        }}>
            <div
                onDoubleClick={heartBurst}
                style={{
                    position: 'relative',
                    borderRadius: '16px',
                    minHeight: '260px',
                    overflow: 'hidden',
                    background: 'radial-gradient(circle at top, rgba(59,130,246,0.3), rgba(15,23,42,0.2) 40%, rgba(2,6,23,0.95)), linear-gradient(135deg, #0f172a, #111827)',
                    border: '1px solid rgba(146, 170, 255, 0.18)'
                }}
            >
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, rgba(2,6,23,0.62) 100%)' }} />
                <div style={{ position: 'absolute', inset: '12px 12px auto 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 2 }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ background: 'rgba(239,68,68,0.85)', color: '#fff', borderRadius: '999px', padding: '5px 8px', fontSize: '10px', letterSpacing: '0.08em', fontWeight: 700 }}>LIVE</span>
                        <span style={{ color: '#dbeafe', fontSize: '11px', fontWeight: 600 }}>Auto-play loop</span>
                    </div>
                    <button style={{ border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(15,23,42,0.38)', color: '#fff', borderRadius: '999px', padding: '6px 10px', fontSize: '11px', cursor: 'pointer' }}>
                        Surprise Me
                    </button>
                </div>

                <div style={{ position: 'absolute', left: '14px', bottom: '58px', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ background: 'rgba(15, 23, 42, 0.72)', border: '1px solid rgba(148,163,184,0.26)', borderRadius: '12px', padding: '8px 10px', color: '#fff', width: 'max-content', maxWidth: '220px' }}>
                        <div style={{ fontSize: '10px', opacity: 0.75 }}>Now playing</div>
                        <div style={{ fontWeight: 700 }}>Midnight Echo</div>
                        <div style={{ fontSize: '11px', opacity: 0.8 }}>by Nocturne Jane</div>
                    </div>
                    <div style={{ background: 'rgba(15, 23, 42, 0.62)', border: '1px solid rgba(125,211,252,0.28)', borderRadius: '999px', padding: '6px 10px', color: '#dbeafe', fontSize: '11px', width: 'max-content' }}>
                        Original audio • 1.2M plays
                    </div>
                </div>

                <div style={{ position: 'absolute', right: '14px', bottom: '52px', zIndex: 2, display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                    <div style={{ background: 'rgba(15,23,42,0.6)', padding: '8px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '12px' }}>🔥 18 day streak</div>
                    <div style={{ background: 'rgba(15,23,42,0.6)', padding: '8px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '12px' }}>👀 3.9k watching</div>
                </div>

                {hearts.map((heart) => (
                    <div key={heart.id} style={{ position: 'absolute', left: heart.left, top: heart.top, fontSize: '28px', transform: 'translate(-50%, -50%)', animation: 'heart-pop 0.7s ease-out forwards', zIndex: 4 }}>
                        ❤️
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '12px' }}>
                <div style={{ background: 'rgba(15,23,42,0.56)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '12px', padding: '10px' }}>
                    <div style={{ color: '#cbd5e1', fontSize: '11px', marginBottom: '8px' }}>Reaction meter</div>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={slider}
                        onChange={(event) => setSlider(Number(event.target.value))}
                        style={{ width: '100%' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#dbeafe', marginTop: '8px' }}>
                        <span>Low</span>
                        <span>{slider}% match</span>
                        <span>High</span>
                    </div>
                </div>

                <div style={{ background: 'rgba(15,23,42,0.56)', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '12px', padding: '10px' }}>
                    <div style={{ color: '#cbd5e1', fontSize: '11px', marginBottom: '8px' }}>Poll</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {['Love it', 'Need more', 'Replay'].map((option) => (
                            <button
                                key={option}
                                onClick={() => setVote(option)}
                                style={{
                                    border: vote === option ? '1px solid #8b5cf6' : '1px solid rgba(148,163,184,0.24)',
                                    background: vote === option ? 'rgba(139,92,246,0.16)' : 'rgba(15,23,42,0.26)',
                                    color: '#fff',
                                    borderRadius: '999px',
                                    padding: '6px 10px',
                                    fontSize: '11px',
                                    cursor: 'pointer'
                                }}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {reactions.map((reaction) => (
                        <button key={reaction.value} style={{ border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.42)', color: '#fff', borderRadius: '999px', padding: '6px 8px', fontSize: '11px' }}>
                            {reaction.label} {reaction.value}
                        </button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {shareFriends.map((friend, index) => (
                        <div
                            key={friend}
                            style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '50%',
                                display: 'grid',
                                placeItems: 'center',
                                fontSize: '10px',
                                fontWeight: 700,
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: ['#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899'][index],
                                marginLeft: index === 0 ? 0 : '-6px'
                            }}
                        >
                            {friend}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const ImmersiveExperienceDock = () => {
    return (
        <section
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '18px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 18px 30px rgba(15, 23, 42, 0.18)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
                <div>
                    <div style={{ color: '#dbeafe', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>Immersive Social Layer</div>
                    <h3 style={{ margin: '6px 0 0', fontSize: '24px' }}>Viral motion, faster loops, more retention</h3>
                </div>
                <button style={{ background: 'linear-gradient(135deg, #0ea5e9, #8b5cf6)', color: '#fff', border: 'none', borderRadius: '999px', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                    Launch watch party
                </button>
            </div>

            <DemoMediaPlayer />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {featureGroups.map((group) => (
                    <div key={group.title} style={{ border: '1px solid rgba(148,163,184,0.2)', borderRadius: '14px', padding: '12px', background: 'rgba(15,23,42,0.34)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: group.accent, display: 'inline-block' }} />
                            <strong style={{ fontSize: '13px' }}>{group.title}</strong>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {group.items.map((item) => (
                                <span key={item} style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.12)', borderRadius: '999px', padding: '6px 9px', fontSize: '11px', color: '#e2e8f0' }}>
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default ImmersiveExperienceDock;
