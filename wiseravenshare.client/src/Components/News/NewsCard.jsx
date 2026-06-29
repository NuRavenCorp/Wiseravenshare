import React, { useState } from 'react';
import { FaShare, FaBookmark, FaThumbsUp, FaComment, FaChartLine, FaShieldAlt, FaRobot } from 'react-icons/fa';
import { newsAPI } from '../../services/newsAPI';
import { useAuth } from '../../Contexts/AuthContext';

const NewsCard = ({ article, sentiment, factCheck, personalized = false }) => {
    const [isSaved, setIsSaved] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [showFullText, setShowFullText] = useState(false);
    const { user } = useAuth();

    const handleSave = async () => {
        try {
            await newsAPI.saveArticle(article.id);
            setIsSaved(true);
        } catch (error) {
            console.error('Error saving article:', error);
        }
    };

    const handleLike = async () => {
        try {
            await newsAPI.likeArticle(article.id);
            setIsLiked(true);
        } catch (error) {
            console.error('Error liking article:', error);
        }
    };

    const getSentimentColor = (sentiment) => {
        if (!sentiment) return 'var(--highlight-color)';
        if (sentiment.score > 0.3) return '#4caf50';
        if (sentiment.score < -0.3) return '#f44336';
        return '#ff9800';
    };

    const getSentimentIcon = (sentiment) => {
        if (!sentiment) return '😐';
        if (sentiment.score > 0.3) return '😊';
        if (sentiment.score < -0.3) return '😠';
        return '😐';
    };

    const getTruthBadge = (factCheck) => {
        if (!factCheck || factCheck.length === 0) return null;
        const falseClaims = factCheck.filter(f => f.isTrue === false);
        if (falseClaims.length > 0) {
            return {
                color: '#f44336',
                text: '⚠️ Contains unverified claims',
                icon: '⚠️'
            };
        }
        return {
            color: '#4caf50',
            text: '✓ Fact-checked',
            icon: '✅'
        };
    };

    const truthBadge = getTruthBadge(factCheck);

    return (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            marginBottom: '20px',
            overflow: 'hidden',
            border: `1px solid ${personalized ? '#667eea40' : 'var(--border-color)'}`,
            transition: 'transform 0.3s, box-shadow 0.3s',
            cursor: 'pointer'
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
            }}>

            {/* Personalized Badge */}
            {personalized && (
                <div style={{
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    padding: '4px 12px',
                    fontSize: '11px',
                    display: 'inline-block',
                    borderRadius: '0 0 8px 0'
                }}>
                    <FaRobot style={{ marginRight: '4px' }} /> AI Recommended for You
                </div>
            )}

            <div style={{ padding: '20px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                    <div>
                        <span style={{
                            background: 'rgba(102, 126, 234, 0.2)',
                            padding: '3px 10px',
                            borderRadius: '15px',
                            fontSize: '11px',
                            color: '#667eea'
                        }}>
                            {article.category}
                        </span>
                        <span style={{
                            marginLeft: '10px',
                            fontSize: '12px',
                            color: 'var(--highlight-color)'
                        }}>
                            {article.source} • {new Date(article.publishedAt).toLocaleDateString()}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={handleSave} style={{
                            background: 'none',
                            border: 'none',
                            color: isSaved ? '#667eea' : 'var(--highlight-color)',
                            cursor: 'pointer'
                        }}>
                            <FaBookmark />
                        </button>
                        <button onClick={handleLike} style={{
                            background: 'none',
                            border: 'none',
                            color: isLiked ? '#f44336' : 'var(--highlight-color)',
                            cursor: 'pointer'
                        }}>
                            <FaThumbsUp />
                        </button>
                    </div>
                </div>

                {/* Title */}
                <h3 style={{
                    fontSize: '20px',
                    marginBottom: '10px',
                    lineHeight: '1.3'
                }}>
                    {article.title}
                </h3>

                {/* Image */}
                {article.imageUrl && (
                    <img
                        src={article.imageUrl}
                        alt={article.title}
                        style={{
                            width: '100%',
                            maxHeight: '400px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            marginBottom: '15px'
                        }}
                    />
                )}

                {/* Content */}
                <p style={{
                    color: 'var(--text-color)',
                    lineHeight: '1.6',
                    marginBottom: '15px'
                }}>
                    {showFullText ? article.content : `${article.content.substring(0, 300)}...`}
                    {article.content.length > 300 && (
                        <button
                            onClick={() => setShowFullText(!showFullText)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#667eea',
                                cursor: 'pointer',
                                marginLeft: '5px'
                            }}
                        >
                            {showFullText ? 'Show less' : 'Read more'}
                        </button>
                    )}
                </p>

                {/* AI Analysis Badges */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    flexWrap: 'wrap',
                    marginBottom: '15px'
                }}>
                    {sentiment && (
                        <div style={{
                            background: `${getSentimentColor(sentiment)}20`,
                            padding: '4px 10px',
                            borderRadius: '15px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}>
                            {getSentimentIcon(sentiment)} Sentiment: {sentiment.label}
                        </div>
                    )}

                    {truthBadge && (
                        <div style={{
                            background: `${truthBadge.color}20`,
                            padding: '4px 10px',
                            borderRadius: '15px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            color: truthBadge.color
                        }}>
                            {truthBadge.icon} {truthBadge.text}
                        </div>
                    )}

                    {article.aiSummary && (
                        <div style={{
                            background: '#667eea20',
                            padding: '4px 10px',
                            borderRadius: '15px',
                            fontSize: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}>
                            <FaRobot /> AI Generated Summary Available
                        </div>
                    )}
                </div>

                {/* Fact Check Details */}
                {factCheck && factCheck.length > 0 && factCheck.some(f => f.isTrue === false) && (
                    <div style={{
                        background: '#f4433620',
                        padding: '12px',
                        borderRadius: '8px',
                        marginBottom: '15px',
                        borderLeft: '3px solid #f44336'
                    }}>
                        <strong style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FaShieldAlt /> Fact Check Alert
                        </strong>
                        {factCheck.filter(f => f.isTrue === false).map((claim, idx) => (
                            <div key={idx} style={{ marginTop: '8px', fontSize: '14px' }}>
                                <span style={{ color: '#f44336' }}>⚠️</span> {claim.claim}
                                {claim.correction && (
                                    <div style={{ marginTop: '4px', marginLeft: '20px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                        Correction: {claim.correction}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '20px',
                    paddingTop: '15px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <button style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--highlight-color)',
                        cursor: 'pointer'
                    }}>
                        <FaComment /> {article.comments || 0}
                    </button>
                    <button style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--highlight-color)',
                        cursor: 'pointer'
                    }}>
                        <FaShare /> Share
                    </button>
                    <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            color: '#667eea',
                            textDecoration: 'none',
                            marginLeft: 'auto'
                        }}
                    >
                        Read Original <FaChartLine />
                    </a>
                </div>
            </div>
        </div>
    );
};

export default NewsCard;