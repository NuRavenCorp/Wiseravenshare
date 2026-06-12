import React, { useState, useEffect } from 'react';
import { FaChartLine, FaChartBar, FaChartPie, FaCalendar, FaDownload, FaGlobe, FaHashtag } from 'react-icons/fa';
import { truthEngine } from '../../services/truthEngine';

const TruthAnalytics = () => {
    const [analytics, setAnalytics] = useState(null);
    const [timeRange, setTimeRange] = useState('week');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAnalytics();
    }, [timeRange]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const data = await truthEngine.getTruthAnalytics(timeRange);
            setAnalytics(data);
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '40px' }}>
                <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
            </div>
        );
    }

    return (
        <div>
            {/* Time Range Selector */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
                flexWrap: 'wrap',
                gap: '15px'
            }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {['day', 'week', 'month', 'year'].map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '20px',
                                border: 'none',
                                background: timeRange === range ? 'var(--highlight-color)' : 'var(--secondary-color)',
                                color: 'white',
                                cursor: 'pointer',
                                textTransform: 'capitalize'
                            }}
                        >
                            {range}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => truthEngine.downloadAnalyticsReport(analytics)}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FaDownload /> Download Report
                </button>
            </div>

            {/* Key Metrics */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '15px',
                marginBottom: '20px'
            }}>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--highlight-color)' }}>
                        {analytics.totalClaims.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Total Claims Checked</div>
                    <div style={{ fontSize: '11px', marginTop: '5px', color: '#4caf50' }}>
                        ↑ {analytics.growth}% from last period
                    </div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                        {analytics.truePercentage}%
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>True Claims</div>
                    <div style={{ fontSize: '11px', marginTop: '5px', color: 'var(--highlight-color)' }}>
                        {analytics.trueCount.toLocaleString()} claims
                    </div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f44336' }}>
                        {analytics.falsePercentage}%
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>False Claims</div>
                    <div style={{ fontSize: '11px', marginTop: '5px', color: 'var(--highlight-color)' }}>
                        {analytics.falseCount.toLocaleString()} claims
                    </div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>
                        {analytics.avgResponseTime}s
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Avg Response Time</div>
                    <div style={{ fontSize: '11px', marginTop: '5px', color: '#4caf50' }}>
                        ↓ {analytics.responseImprovement}% faster
                    </div>
                </div>
            </div>

            {/* Categories Breakdown */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px'
            }}>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px'
                }}>
                    <h3 style={{ marginBottom: '15px' }}>Claims by Category</h3>
                    {analytics.categories.map(cat => (
                        <div key={cat.name} style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span>{cat.name}</span>
                                <span>{cat.percentage}%</span>
                            </div>
                            <div style={{
                                height: '6px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '3px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${cat.percentage}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, ${cat.color}, ${cat.color}80)`
                                }} />
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px'
                }}>
                    <h3 style={{ marginBottom: '15px' }}>Source Reliability</h3>
                    {analytics.sourceReliability.map(source => (
                        <div key={source.name} style={{ marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <span>{source.name}</span>
                                <span>{source.reliability}%</span>
                            </div>
                            <div style={{
                                height: '6px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '3px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${source.reliability}%`,
                                    height: '100%',
                                    background: source.reliability >= 80 ? '#4caf50' :
                                        source.reliability >= 60 ? '#ff9800' : '#f44336'
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Trending Topics */}
            <div style={{
                background: 'var(--secondary-color)',
                borderRadius: '12px',
                padding: '20px'
            }}>
                <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaHashtag /> Trending Misinformation Topics
                </h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                    {analytics.trendingTopics.map(topic => (
                        <div
                            key={topic.name}
                            style={{
                                padding: '10px 15px',
                                background: 'rgba(244, 67, 54, 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(244, 67, 54, 0.3)',
                                flex: '1 1 auto',
                                minWidth: '150px'
                            }}
                        >
                            <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{topic.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                {topic.mentions} mentions • {topic.growth}% growth
                            </div>
                            <div style={{
                                marginTop: '8px',
                                height: '4px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '2px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${topic.velocity}%`,
                                    height: '100%',
                                    background: '#f44336'
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* User Engagement */}
            <div style={{
                marginTop: '20px',
                background: 'var(--secondary-color)',
                borderRadius: '12px',
                padding: '20px'
            }}>
                <h3 style={{ marginBottom: '15px' }}>User Engagement</h3>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '15px'
                }}>
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Active Verifiers</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{analytics.activeVerifiers.toLocaleString()}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Avg Verifications/User</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{analytics.avgVerificationsPerUser}</div>
                    </div>
                    <div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Community Accuracy</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4caf50' }}>{analytics.communityAccuracy}%</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TruthAnalytics;