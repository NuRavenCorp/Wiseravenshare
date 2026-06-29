import React, { useMemo, useState } from 'react';
import { truthEngine } from '../../Services/TruthDetectionEngine';

const PostCard = ({ post, onLike, onRepost, currentUser, isFollowing, onFollow, onBookmark, bookmarkLabel = 'Bookmark' }) => {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState(post.comments || []);

    const truthBadge = useMemo(() => {
        const score = post.truthScore ?? truthEngine.getTruthScore(post.content || '');
        return truthEngine.getTruthBadge(score);
    }, [post.truthScore, post.content]);

    const predictionSummary = useMemo(() => {
        const predicted = Number(post.predictedEngagementScore);
        const confidence = Number(post.confidence);
        if (!Number.isFinite(predicted)) {
            return null;
        }

        const safeConfidence = Number.isFinite(confidence) ? Math.max(0, Math.min(100, Math.round(confidence))) : null;
        return {
            predicted: Math.max(0, Math.round(predicted)),
            confidence: safeConfidence
        };
    }, [post.predictedEngagementScore, post.confidence]);

    const addComment = () => {
        if (!commentText.trim()) {
            return;
        }

        const comment = {
            id: Date.now(),
            user: currentUser,
            content: commentText,
            createdAt: new Date()
        };

        setComments((prev) => [...prev, comment]);
        setCommentText('');
    };

    return (
        <article
            style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '16px'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <strong>{post.user?.name || 'Unknown'}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{post.user?.handle || ''}</div>
                </div>
                {onFollow && post.userId && post.userId !== currentUser?.id && (
                    <button
                        onClick={() => onFollow?.(post.userId)}
                        style={{
                            border: `1px solid ${isFollowing ? 'var(--highlight-color)' : 'transparent'}`,
                            background: isFollowing
                                ? 'transparent'
                                : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: 'var(--text-color)',
                            borderRadius: '16px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontWeight: 700,
                            minWidth: '96px'
                        }}
                    >
                        {isFollowing ? 'Following' : 'Follow +'}
                    </button>
                )}
            </div>

            <p style={{ marginTop: '12px', whiteSpace: 'pre-wrap' }}>{post.content}</p>

            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{truthBadge.text}</div>
                {predictionSummary && (
                    <div
                        title="Predicted engagement score for near-term ranking"
                        style={{
                            fontSize: '11px',
                            color: 'var(--text-color)',
                            background: 'rgba(125, 211, 252, 0.14)',
                            border: '1px solid rgba(125, 211, 252, 0.45)',
                            borderRadius: '999px',
                            padding: '3px 9px',
                            fontWeight: 600
                        }}
                    >
                        Predicted: {predictionSummary.predicted}
                        {predictionSummary.confidence !== null ? ` (${predictionSummary.confidence}% conf)` : ''}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button onClick={() => onLike?.(post.id)}>Like ({post.likes ?? 0})</button>
                <button onClick={() => onRepost?.(post.id)}>Repost ({post.reposts ?? 0})</button>
                <button onClick={() => onBookmark?.(post)}>{bookmarkLabel}</button>
                <button onClick={() => setShowComments((prev) => !prev)}>
                    Comments ({comments.length})
                </button>
            </div>

            {showComments && (
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Write a comment"
                            style={{
                                flex: 1,
                                padding: '8px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <button onClick={addComment}>Send</button>
                    </div>
                    {comments.map((comment) => (
                        <div key={comment.id} style={{ fontSize: '13px', marginBottom: '6px' }}>
                            <strong>{comment.user?.name || 'User'}:</strong> {comment.content}
                        </div>
                    ))}
                </div>
            )}
        </article>
    );
};

export default PostCard;
