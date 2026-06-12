import React, { useState } from 'react';
import { truthEngine } from '../../Services/TruthDetectionEngine';

const PostCard = ({ post, onLike, onRepost, currentUser, isFollowing, onFollow, onBookmark, bookmarkLabel = 'Bookmark' }) => {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState(post.comments || []);

    const truthBadge = truthEngine.getTruthBadge(post.truthScore || truthEngine.getTruthScore(post.content));

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

            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)' }}>{truthBadge.text}</div>

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
