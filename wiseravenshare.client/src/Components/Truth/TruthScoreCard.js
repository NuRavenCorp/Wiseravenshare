import React from 'react';
import { FaShieldAlt, FaStar, FaMedal, FaChartLine } from 'react-icons/fa';

const TruthScoreCard = ({ score, rank }) => {
    const getRankIcon = () => {
        if (score >= 90) return '🏆';
        if (score >= 75) return '⭐';
        if (score >= 60) return '📈';
        if (score >= 40) return '⚠️';
        return '🔍';
    };

    const getRankColor = () => {
        if (score >= 90) return '#ffd700';
        if (score >= 75) return '#c0c0c0';
        if (score >= 60) return '#cd7f32';
        if (score >= 40) return '#ff9800';
        return '#f44336';
    };

    const getNextRank = () => {
        if (score < 40) return { name: 'Truth Learner', target: 40 };
        if (score < 60) return { name: 'Truth Seeker', target: 60 };
        if (score < 75) return { name: 'Truth Guardian', target: 75 };
        if (score < 90) return { name: 'Truth Master', target: 90 };
        return { name: 'Truth Legend', target: 100 };
    };

    const nextRank = getNextRank();
    const progressToNext = ((score - (nextRank.target - 15)) / 15) * 100;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '15px',
            minWidth: '200px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                <div style={{
                    fontSize: '36px',
                    fontWeight: 'bold',
                    color: getRankColor()
                }}>
                    {score}%
                </div>
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        {getRankIcon()} {rank}
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                        Truth Score
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '10px' }}>
                <div style={{
                    fontSize: '11px',
                    marginBottom: '4px',
                    display: 'flex',
                    justifyContent: 'space-between'
                }}>
                    <span>Next: {nextRank.name}</span>
                    <span>{score}/{nextRank.target}</span>
                </div>
                <div style={{
                    height: '4px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '2px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${Math.min(100, progressToNext)}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${getRankColor()}, ${getRankColor()}80)`,
                        transition: 'width 0.3s'
                    }} />
                </div>
            </div>
        </div>
    );
};

export default TruthScoreCard;