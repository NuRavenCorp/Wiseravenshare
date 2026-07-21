import React, { useState, useEffect } from 'react';
import { FaChartLine, FaChartBar, FaChartPie, FaDownload, FaCalendar } from 'react-icons/fa';
import { newsAPI } from '../../services/newsAPI';

const NewsAnalytics = ({ news, sentimentAnalysis }) => {
    const [analytics, setAnalytics] = useState(null);
    const [timeRange, setTimeRange] = useState('week');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadAnalytics();
    }, [timeRange]);

    const loadAnalytics = async () => {
        setLoading(true);
        try {
            const response = await newsAPI.getNewsAnalytics({
                timeRange,
                articles: news
            });
            setAnalytics(response);
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const getSentimentDistribution = () => {
        if (!sentimentAnalysis) return { positive: 0, neutral: 0, negative: 0 };

        const distribution = { positive: 0, neutral: 0, negative: 0 };
        Object.values(sentimentAnalysis).forEach(sentiment => {
            if (sentiment.score > 0.3) distribution.positive++;
            else if (sentiment.score < -0.3) distribution.negative++;
            else distribution.neutral++;
        });

        const total = distribution.positive + distribution.neutral + distribution.negative;
        if (total > 0) {
            distribution.positive = (distribution.positive / total * 100).toFixed(1);
            distribution.neutral = (distribution.neutral / total * 100).toFixed(1);
            distribution.negative = (distribution.negative / total * 100).toFixed(1);
        }

        return distribution;
    };

    const sentimentDist = getSentimentDistribution();

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
                                padding: '8px 15px',
                                borderRadius: '20px',
                                border: `1px solid ${timeRange === range ? '#667eea' : 'var(--border-color)'}`,
                                background: timeRange === range ? '#667eea20' : 'transparent',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            {range.charAt(0).toUpperCase() + range.slice(1)}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => newsAPI.downloadAnalyticsReport(analytics)}
                    style={{
                        padding: '8px 15px',
                        borderRadius: '20px',
                        border: '1px solid var(--border-color)',
                        background: 'transparent',
                        color: 'var(--text-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px'
                    }}
                >
                    <FaDownload /> Download Report
                </button>
            </div>

            {/* Stats Grid */}
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
                    <div style={{ fontSize: '28px', marginBottom: '5px' }}>📰</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{analytics?.totalArticles || 0}</div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Total Articles</div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', marginBottom: '5px' }}