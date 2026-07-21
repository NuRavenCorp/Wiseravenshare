import React, { useState, useEffect } from 'react';
import { FaTrophy, FaMedal, FaUserCheck, FaChartLine, FaFilter, FaSearch } from 'react-icons/fa';
import { truthEngine } from '../../services/truthEngine';

const TruthLeaderboard = () => {
    const [leaderboard, setLeaderboard] = useState([]);
    const [timeframe, setTimeframe] = useState('all');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadLeaderboard();
    }, [timeframe]);

    const loadLeaderboard = async () => {
        setLoading(true);
        try {
            const data = await truthEngine.getTruthLeaderboard(timeframe);
            setLeaderboard(data);
        } catch (error) {
            console.error('Error loading leaderboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const getMedalColor = (index) => {
        if (index === 0) return '#ffd700';
        if (index === 1) return '#c0c0c0';
        if (index === 2) return '#cd7f32';
        return 'var(--highlight-color)';
    };

    const getMedalIcon = (index) => {
        if (index === 0) return '🥇';
        if (index === 1) return '🥈';
        if (index === 2) return '🥉';
        return `${index + 1}`;
    };

    const filteredLeaderboard = leaderboard.filter(user =>
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.handle.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '15px'
            }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {['day', 'week', 'month', 'all'].map(tf => (
                        <button
                            key={tf}
                            onClick={() => setTimeframe(tf)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '20px',
                                border: 'none',
                                background: timeframe === tf ? 'var(--highlight-color)' : 'var(--secondary-color)',
                                color: 'white',
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {tf === 'all' ? 'All Time' : `${tf}ly`}
                        </button>
                    ))}
                </div>
                <div style={{ position: 'relative' }}>
                    <FaSearch style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--highlight-color)'
                    }} />
                    <input
                        type="text"
                        placeholder="Search users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: '8px 12px 8px 35px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            width: '250px'
                        }}
                    />
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            ) : (
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{
                                borderBottom: '1px solid var(--border-color)',
                                background: 'var(--card-bg)'
                            }}>
                                <th style={{ padding: '15px', textAlign: 'left', width: '80px' }}>Rank</th>
                                <th style={{ padding: '15px', textAlign: 'left' }}>User</th>
                                <th style={{ padding: '15px', textAlign: 'center' }}>Truth Score</th>
                                <th style={{ padding: '15px', textAlign: 'center' }}>Claims Verified</th>
                                <th style={{ padding: '15px', textAlign: 'center' }}>Accuracy</th>
                                <th style={{ padding: '15px', textAlign: 'center' }}>Reputation</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLeaderboard.map((user, index) => (
                                <tr
                                    key={user.id}
                                    style={{
                                        borderBottom: '1px solid var(--border-color)',
                                        transition: 'background 0.3s',
                                        cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                    <td style={{ padding: '15px' }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '50%',
                                            background: `${getMedalColor(index)}20`,
                                            color: getMedalColor(index),
                                            fontWeight: 'bold'
                                        }}>
                                            {getMedalIcon(index)}
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <img
                                                src={user.avatar}
                                                alt={user.name}
                                                style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '50%',
                                                    objectFit: 'cover'
                                                }}
                                            />
                                            <div>
                                                <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                                    @{user.handle}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: '20px',
                                            fontWeight: 'bold',
                                            color: user.truthScore >= 80 ? '#4caf50' :
                                                user.truthScore >= 60 ? '#ff9800' : '#f44336'
                                        }}>
                                            {user.truthScore}%
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'center' }}>
                                        {user.claimsVerified.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'center' }}>
                                        <div style={{
                                            display: 'inline-block',
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            background: `${getMedalColor(index)}20`,
                                            color: getMedalColor(index)
                                        }}>
                                            {user.accuracy}%
                                        </div>
                                    </td>
                                    <td style={{ padding: '15px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                                            <FaTrophy style={{ color: '#ffd700' }} />
                                            {user.reputation.toLocaleString()}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {filteredLeaderboard.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--highlight-color)' }}>
                            No users found
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TruthLeaderboard;