import React, { useEffect, useMemo, useState } from 'react';
import Compartment from '../Common/Compartment';
import { truthEngine } from '../../Services/truthEngine';
import { apiService } from '../../Services/api';
import { resolveMediaUrl } from '../../utils/mediaUtils';
import { classifyPostMedia } from './postMediaClassifier';
import '@flaticon/flaticon-uicons/css/all/all.css';

const PostCard = ({
    post,
    onLike,
    onRepost,
    onDispute,
    onVerify,
    integrityReport,
    currentUser,
    isFollowing,
    onFollow,
    onBookmark,
    bookmarkLabel = 'Bookmark',
    onCommentCountChange
}) => {
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState(Array.isArray(post.comments) ? post.comments : []);
    const [isCommentsLoading, setIsCommentsLoading] = useState(false);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    const commentsCount = useMemo(() => {
        if (Number.isFinite(Number(post.commentsCount))) {
            return Number(post.commentsCount);
        }

        if (Array.isArray(comments)) {
            return comments.length;
        }

        return 0;
    }, [comments, post.commentsCount]);

    const likesCount = Number(post.likes ?? post.likesCount ?? 0);
    const repostsCount = Number(post.reposts ?? post.repostsCount ?? 0);

    useEffect(() => {
        setComments(Array.isArray(post.comments) ? post.comments : []);
    }, [post.id, post.comments]);

    useEffect(() => {
        if (!showComments || !post?.id) {
            return;
        }

        let cancelled = false;
        const loadComments = async () => {
            setIsCommentsLoading(true);
            try {
                const response = await apiService.getComments(post.id);
                const nextComments = Array.isArray(response?.data) ? response.data : [];
                if (!cancelled) {
                    setComments(nextComments);
                    onCommentCountChange?.(post.id, nextComments.length);
                }
            } catch {
                // Keep local comments as fallback.
            } finally {
                if (!cancelled) {
                    setIsCommentsLoading(false);
                }
            }
        };

        void loadComments();
        return () => {
            cancelled = true;
        };
    }, [showComments, post?.id, onCommentCountChange]);

    const displayUser = useMemo(() => {
        const postUser = post.user || {};
        if (!post.userId || post.userId !== currentUser?.id) {
            return postUser;
        }

        // Keep feed identity in sync with the latest profile for the signed-in user.
        return {
            ...postUser,
            id: currentUser.id,
            name: currentUser.name || currentUser.displayName || postUser.name,
            handle: currentUser.handle || currentUser.username || postUser.handle,
            avatar: currentUser.avatar || currentUser.avatarUrl || postUser.avatar || postUser.avatarUrl
        };
    }, [post.user, post.userId, currentUser]);

    const truthBadge = useMemo(() => {
        const content = String(post.content || '').trim();

        // Questions are open inquiries — show the inquiry badge, never a truth score.
        if (content && truthEngine.isQuestion(content)) {
            return truthEngine.getTruthBadge(0, { isQuestion: true });
        }

        const score = post.truthScore ?? truthEngine.getTruthScore(content);
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

    const platformLinks = [
        post.youtubeUrl && { href: post.youtubeUrl, label: 'YouTube', color: '#ff0000' },
        post.tiktokUrl && { href: post.tiktokUrl, label: 'TikTok', color: '#ffffff' },
        post.facebookUrl && { href: post.facebookUrl, label: 'Facebook', color: '#1877f2' }
    ].filter(Boolean);

    const addComment = async () => {
        const nextContent = commentText.trim();
        if (!nextContent || isSubmittingComment) {
            return;
        }

        setIsSubmittingComment(true);
        try {
            const response = await apiService.addComment(post.id, nextContent);
            const payload = response?.data;
            const nextComment = payload && typeof payload === 'object'
                ? payload
                : {
                    id: `local-comment-${Date.now()}`,
                    user: currentUser,
                    content: nextContent,
                    createdAt: new Date().toISOString()
                };

            setComments((prev) => {
                const merged = [nextComment, ...prev];
                onCommentCountChange?.(post.id, merged.length);
                return merged;
            });
            setCommentText('');
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const actionButtonStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        borderRadius: '999px',
        border: '1px solid var(--border-color)',
        background: 'rgba(255,255,255,0.03)',
        color: 'var(--text-color)',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600
    };

    const iconStyle = {
        fontSize: '16px',
        lineHeight: 1,
        width: '16px',
        textAlign: 'center'
    };

    return (
        <Compartment badge="Feed Post" title="Post Detail">
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
                    <strong>{displayUser?.name || 'Unknown'}</strong>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{displayUser?.handle || ''}</div>
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

            {/* Media block renders first so photos are never buried under text */}
            {(() => {
                const rawMediaUrl = post.mediaUrl || post.url || post.videoUrl || post.imageUrl || '';
                const resolvedMedia = resolveMediaUrl(rawMediaUrl);
                if (!resolvedMedia) return null;
                const { isVideoPost, isImagePost, isAudioPost } = classifyPostMedia(post, resolvedMedia);

                return (
                    <div style={{ marginTop: '12px', borderRadius: '12px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative', zIndex: 1 }}>
                        {isVideoPost ? (
                            <video
                                src={resolvedMedia}
                                controls
                                playsInline
                                preload="metadata"
                                style={{ width: '100%', maxHeight: '420px', display: 'block', borderRadius: '12px', background: '#000' }}
                            />
                        ) : isImagePost ? (
                            <img
                                src={resolvedMedia}
                                alt="Story media"
                                style={{ width: '100%', maxHeight: '560px', objectFit: 'contain', display: 'block', borderRadius: '12px', background: '#000' }}
                            />
                        ) : isAudioPost ? (
                            <div style={{ padding: '14px', background: 'rgba(255,255,255,0.04)' }}>
                                <audio
                                    src={resolvedMedia}
                                    controls
                                    preload="metadata"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ) : (
                            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '13px', color: 'var(--light-color)' }}>📄 Attached Story File</span>
                                <a href={resolvedMedia} target="_blank" rel="noreferrer" style={{ color: 'var(--highlight-color)', fontWeight: 'bold', fontSize: '13px' }}>
                                    View / Download File
                                </a>
                            </div>
                        )}
                    </div>
                );
            })()}

            <p
                style={{
                    marginTop: '12px',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word'
                }}
            >
                {post.content}
            </p>

            {platformLinks.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {platformLinks.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 10px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.04)',
                                color: link.color,
                                fontSize: '12px',
                                fontWeight: 700,
                                textDecoration: 'none'
                            }}
                        >
                            Open on {link.label}
                        </a>
                    ))}
                </div>
            )}

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

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button style={actionButtonStyle} onClick={() => onLike?.(post.id)} aria-label="Heart this post">
                    <i className="fi fi-br-heart" aria-hidden="true" style={iconStyle} />
                    Like ({likesCount})
                </button>
                <button style={actionButtonStyle} onClick={() => onRepost?.(post.id)} aria-label="Repost this post">
                    <i className="fi fi-br-stamp" aria-hidden="true" style={iconStyle} />
                    Repost ({repostsCount})
                </button>
                <button style={actionButtonStyle} onClick={() => onBookmark?.(post)} aria-label="Bookmark this post">
                    <i className="fi fi-br-bookmark" aria-hidden="true" style={iconStyle} />
                    {bookmarkLabel || 'Bookmark'}
                </button>
                <button style={actionButtonStyle} onClick={() => onVerify?.(post)} aria-label="Verify this post">
                    <i className="fi fi-br-shield-check" aria-hidden="true" style={iconStyle} />
                    Verify
                </button>
                <button style={actionButtonStyle} onClick={() => onDispute?.(post)} aria-label="Dispute this post">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fi fi-br-handshake" aria-hidden="true" style={iconStyle} />
                        <i className="fi fi-br-scale" aria-hidden="true" style={iconStyle} />
                    </span>
                    Dispute
                </button>
                <button style={actionButtonStyle} onClick={() => setShowComments((prev) => !prev)} aria-label="Toggle comments">
                    <i className="fi fi-br-comment-dots" aria-hidden="true" style={iconStyle} />
                    Comments ({commentsCount})
                </button>
            </div>

            {integrityReport && (
                <div
                    style={{
                        marginTop: '12px',
                        padding: '10px',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.03)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '13px' }}>
                            Integrity Check {integrityReport.mode === 'auto' ? '(Auto)' : '(Manual)'}
                        </strong>
                        <span style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                            {new Date(integrityReport.checkedAt).toLocaleString()}
                        </span>
                    </div>

                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                        {integrityReport.badge?.text || `Truth Score: ${integrityReport.score || 0}%`}
                    </div>

                    {Array.isArray(integrityReport.findings) && integrityReport.findings.length > 0 && (
                        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '18px', fontSize: '12px' }}>
                            {integrityReport.findings.slice(0, 3).map((finding, index) => (
                                <li key={`${finding.claim}-${index}`} style={{ marginBottom: '4px' }}>
                                    {finding.claim}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {showComments && (
                <div style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void addComment();
                                }
                            }}
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
                        <button onClick={() => void addComment()} disabled={isSubmittingComment || !commentText.trim()}>
                            {isSubmittingComment ? 'Sending...' : 'Send'}
                        </button>
                    </div>
                    {isCommentsLoading && (
                        <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>
                            Loading comments...
                        </div>
                    )}
                    {comments.map((comment) => (
                        <div
                            key={comment.id}
                            style={{
                                fontSize: '13px',
                                marginBottom: '6px',
                                overflowWrap: 'anywhere',
                                wordBreak: 'break-word'
                            }}
                        >
                            <strong>{comment.user?.name || 'User'}:</strong> {comment.content}
                        </div>
                    ))}
                </div>
            )}
        </article>
        </Compartment>
    );
};

export default PostCard;
