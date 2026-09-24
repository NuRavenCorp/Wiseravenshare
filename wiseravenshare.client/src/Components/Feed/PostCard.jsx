import React, { useEffect, useMemo, useRef, useState } from 'react';
import Compartment from '../Common/Compartment';
import { truthEngine } from '../../Services/truthEngine';
import { apiService } from '../../Services/api';
import { resolveMediaUrl } from '../../utils/mediaUtils';
import { classifyPostMedia } from './postMediaClassifier';
import SendToStreamButton from './SendToStreamButton.jsx';

const PostCard = ({
    post,
    onLike,
    onRepost,
    onShare,
    onLoadComments,
    onAddComment,
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
    const [comments, setComments] = useState(post.comments || []);
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSavingComment, setIsSavingComment] = useState(false);
    const [viewsCount, setViewsCount] = useState(Number(post.viewsCount ?? post.ViewsCount ?? 0));
    const [sharesCount, setSharesCount] = useState(Number(post.sharesCount ?? post.SharesCount ?? 0));
    const articleRef = useRef(null);
    const viewTrackedRef = useRef(false);

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

    const displayHandle = useMemo(() => {
        const raw = String(
            displayUser?.handle
            || displayUser?.username
            || displayUser?.name
            || ''
        ).trim();

        if (raw) {
            return raw.startsWith('@') ? raw : `@${raw.replace(/^@+/, '')}`;
        }

        const email = String(displayUser?.email || '').trim();
        if (email.includes('@')) {
            const prefix = email.split('@')[0].trim();
            if (prefix) {
                return `@${prefix}`;
            }
        }

        return '@user';
    }, [displayUser]);

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

    const provenance = useMemo(() => {
        const raw = post.provenance && typeof post.provenance === 'object' ? post.provenance : null;
        if (!raw) {
            return null;
        }

        const sourceUrl = typeof raw.sourceUrl === 'string' ? raw.sourceUrl.trim() : '';
        const evidenceSummary = typeof raw.evidenceSummary === 'string' ? raw.evidenceSummary.trim() : '';
        const verificationStatus = typeof raw.verificationStatus === 'string' ? raw.verificationStatus.trim().toLowerCase() : '';
        const correctionReferenceUrl = typeof raw.correctionReferenceUrl === 'string' ? raw.correctionReferenceUrl.trim() : '';

        if (!sourceUrl && !evidenceSummary && !verificationStatus && !correctionReferenceUrl) {
            return null;
        }

        const labelByStatus = {
            unverified: 'Unverified',
            'community-reviewed': 'Community Reviewed',
            verified: 'Verified',
            contested: 'Contested'
        };

        const statusLabel = labelByStatus[verificationStatus] || (verificationStatus ? verificationStatus : 'Unverified');
        const statusStyleByStatus = {
            unverified: { border: '1px solid rgba(250, 204, 21, 0.6)', background: 'rgba(250, 204, 21, 0.12)', color: '#fde68a' },
            'community-reviewed': { border: '1px solid rgba(56, 189, 248, 0.6)', background: 'rgba(56, 189, 248, 0.12)', color: '#bae6fd' },
            verified: { border: '1px solid rgba(74, 222, 128, 0.6)', background: 'rgba(74, 222, 128, 0.12)', color: '#bbf7d0' },
            contested: { border: '1px solid rgba(248, 113, 113, 0.6)', background: 'rgba(248, 113, 113, 0.12)', color: '#fecaca' }
        };

        return {
            sourceUrl,
            evidenceSummary,
            verificationStatus,
            correctionReferenceUrl,
            statusLabel,
            statusStyle: statusStyleByStatus[verificationStatus] || statusStyleByStatus.unverified
        };
    }, [post.provenance]);

    const platformLinks = [
        post.youtubeUrl && { href: post.youtubeUrl, label: 'YouTube', color: '#ff0000' },
        post.tiktokUrl && { href: post.tiktokUrl, label: 'TikTok', color: '#ffffff' },
        post.facebookUrl && { href: post.facebookUrl, label: 'Facebook', color: '#1877f2' }
    ].filter(Boolean);

    const mediaItems = useMemo(() => {
        const items = [];
        const pushIfValid = (candidate) => {
            const resolved = resolveMediaUrl(String(candidate || '').trim());
            if (!resolved) {
                return;
            }
            if (!items.includes(resolved)) {
                items.push(resolved);
            }
        };

        pushIfValid(post.mediaUrl || post.url || post.videoUrl || post.imageUrl || '');

        if (Array.isArray(post.mediaUrls)) {
            post.mediaUrls.forEach((candidate) => pushIfValid(candidate));
        } else if (typeof post.mediaUrls === 'string') {
            const trimmed = post.mediaUrls.trim();
            if (trimmed) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((candidate) => pushIfValid(candidate));
                    } else {
                        pushIfValid(trimmed);
                    }
                } catch {
                    trimmed
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean)
                        .forEach((candidate) => pushIfValid(candidate));
                }
            }
        }

        return items;
    }, [post.mediaUrl, post.url, post.videoUrl, post.imageUrl, post.mediaUrls]);

    const likesCount = Number(post.likesCount ?? post.likes ?? 0);
    const repostsCount = Number(post.repostsCount ?? post.reposts ?? 0);
    const commentCount = Math.max(Number(post.commentsCount ?? 0), comments.length);

    const handleToggleComments = async () => {
        const shouldOpen = !showComments;
        setShowComments(shouldOpen);

        if (!shouldOpen || typeof onLoadComments !== 'function') {
            return;
        }

        setIsLoadingComments(true);
        try {
            const loaded = await onLoadComments(post.id);
            setComments(Array.isArray(loaded) ? loaded : []);
        } catch {
            // Keep existing comments on transient load failures.
        } finally {
            setIsLoadingComments(false);
        }
    };

    const addComment = async () => {
        if (!commentText.trim()) {
            return;
        }

        const content = commentText.trim();

        if (typeof onAddComment === 'function') {
            setIsSavingComment(true);
            try {
                const saved = await onAddComment(post.id, content);
                if (saved?.id) {
                    setComments((prev) => {
                        const exists = prev.some((item) => item?.id === saved.id);
                        return exists ? prev : [saved, ...prev];
                    });
                }
                setCommentText('');
            } catch {
                // Preserve text when save fails so user can retry.
            } finally {
                setIsSavingComment(false);
            }
            return;
        }

        const comment = {
            id: Date.now(),
            user: currentUser,
            content,
            createdAt: new Date()
        };

        setComments((prev) => [comment, ...prev]);
        setCommentText('');
    };

    // ── View tracking via IntersectionObserver ──
    useEffect(() => {
        if (!post.id || viewTrackedRef.current) return;
        const el = articleRef.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && !viewTrackedRef.current) {
                    viewTrackedRef.current = true;
                    setViewsCount((prev) => prev + 1);
                    apiService.trackPostView(post.id);
                    observer.disconnect();
                }
            },
            { threshold: 0.6 }  // 60% visible = counted as viewed
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [post.id]);

    const handleShare = async () => {
        try {
            // Copy post URL to clipboard
            const url = `${window.location.origin}/post/${post.id}`;
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(url);
            }
        } catch { /* clipboard not available */ }

        setSharesCount((prev) => prev + 1);
        if (typeof onShare === 'function') {
            onShare(post.id);
        } else {
            apiService.sharePost(post.id).catch(() => null);
        }
    };

    return (
        <Compartment badge="Feed Post" title="Post Detail">
        <article className="post-card glass-reveal" ref={articleRef}>

            {/* ── Header ─────────────────────────────────────── */}
            <div className="post-header">
                <div className={`post-avatar${displayUser?.online ? ' post-avatar--online' : ''}`}>
                    {displayUser?.avatar
                        ? <img
                            src={displayUser.avatar}
                            alt={displayUser.name || 'avatar'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        : (displayUser?.name || 'U').charAt(0).toUpperCase()
                    }
                </div>

                <div className="post-meta">
                    <div className="post-meta__name">{displayUser?.name || 'Unknown'}</div>
                    <div className="post-meta__handle">{displayHandle}</div>
                    {post.createdAt && (
                        <div className="post-meta__time">
                            {new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </div>
                    )}
                </div>

                {/* Truth badge */}
                <span className="truth-badge" title={`Truth Score: ${post.truthScore ?? '?'}%`}>
                    {truthBadge.icon || '🛡️'} {truthBadge.text}
                </span>

                {onFollow && post.userId && post.userId !== currentUser?.id && (
                    <button
                        className={`follow-btn${isFollowing ? ' follow-btn--following' : ''}`}
                        onClick={() => onFollow?.(post.userId)}
                    >
                        {isFollowing ? '✓ Following' : '+ Follow'}
                    </button>
                )}
            </div>

            {/* ── Media block ─────────────────────────────────── */}
            {mediaItems.length > 0 && (
                <div
                    className={mediaItems.length > 1 ? `post-media-grid post-media-grid--${Math.min(mediaItems.length, 4)}` : 'post-media-grid'}
                    style={mediaItems.length === 1 ? { borderRadius: 'var(--radius-md)', overflow: 'hidden', marginBottom: '14px' } : {}}
                >
                    {mediaItems.map((resolvedMedia, index) => {
                        const mediaClass = classifyPostMedia({ type: 'Text', mediaType: '' }, resolvedMedia);

                        if (mediaClass.isVideoPost) {
                            return (
                                <div key={`${post.id || 'post'}-media-${index}`}
                                     className={mediaItems.length > 1 ? 'post-media-grid__item' : ''}>
                                    <video
                                        src={resolvedMedia}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        style={{
                                            width: '100%',
                                            maxHeight: mediaItems.length === 1 ? '420px' : '240px',
                                            display: 'block',
                                            background: '#000'
                                        }}
                                    />
                                </div>
                            );
                        }

                        if (mediaClass.isImagePost) {
                            return (
                                <div key={`${post.id || 'post'}-media-${index}`}
                                     className={mediaItems.length > 1 ? 'post-media-grid__item' : ''}>
                                    <img
                                        src={resolvedMedia}
                                        alt={`Post media ${index + 1}`}
                                        style={{
                                            width: '100%',
                                            maxHeight: mediaItems.length === 1 ? '500px' : '260px',
                                            objectFit: 'cover',
                                            display: 'block'
                                        }}
                                    />
                                </div>
                            );
                        }

                        if (mediaClass.isAudioPost) {
                            return (
                                <div key={`${post.id || 'post'}-media-${index}`}
                                     style={{ padding: '14px', background: 'rgba(99,102,241,0.07)', borderRadius: 'var(--radius-md)', marginBottom: '14px', border: '1px solid rgba(99,102,241,0.18)' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>🎵 Audio Attachment</div>
                                    <audio src={resolvedMedia} controls preload="metadata" style={{ width: '100%' }} />
                                </div>
                            );
                        }

                        return (
                            <div key={`${post.id || 'post'}-media-${index}`}
                                 style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', border: '1px solid var(--glass-border)' }}>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>📄 Attached File</span>
                                <a href={resolvedMedia} target="_blank" rel="noreferrer"
                                   style={{ color: 'var(--neon-blue)', fontWeight: 700, fontSize: '12px', textDecoration: 'none' }}>
                                    View / Download
                                </a>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Content ─────────────────────────────────────── */}
            <p className="post-content">{post.content}</p>

            {/* ── Provenance block ────────────────────────────── */}
            {provenance && (
                <div style={{
                    marginBottom: '14px',
                    border: '1px solid rgba(148,163,184,0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'grid',
                    gap: '6px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Provenance</strong>
                        <span style={{ ...provenance.statusStyle, borderRadius: '999px', padding: '3px 9px', fontSize: '11px', fontWeight: 700 }}>
                            {provenance.statusLabel}
                        </span>
                    </div>
                    {provenance.evidenceSummary && (
                        <div style={{ fontSize: '12px', color: 'var(--text-color)', whiteSpace: 'pre-wrap' }}>
                            {provenance.evidenceSummary}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {provenance.sourceUrl && (
                            <a href={provenance.sourceUrl} target="_blank" rel="noreferrer"
                               style={{ fontSize: '12px', color: 'var(--neon-blue)', textDecoration: 'none' }}>
                                Source ↗
                            </a>
                        )}
                        {provenance.correctionReferenceUrl && (
                            <a href={provenance.correctionReferenceUrl} target="_blank" rel="noreferrer"
                               style={{ fontSize: '12px', color: 'var(--neon-blue)', textDecoration: 'none' }}>
                                Correction ↗
                            </a>
                        )}
                    </div>
                </div>
            )}

            {/* ── Platform links ───────────────────────────────── */}
            {platformLinks.length > 0 && (
                <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {platformLinks.map((link) => (
                        <a
                            key={link.label}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '5px 12px', borderRadius: '999px',
                                border: '1px solid var(--glass-border)',
                                background: 'rgba(255,255,255,0.04)',
                                color: link.color, fontSize: '11px', fontWeight: 700,
                                textDecoration: 'none', transition: 'all 0.18s'
                            }}
                        >
                            ↗ {link.label}
                        </a>
                    ))}
                </div>
            )}
            {/* ── Prediction badge ────────────────────────────── */}
            {predictionSummary && (
                <div style={{ marginBottom: '10px' }}>
                    <span className="neon-pill neon-pill--indigo">
                        📊 Predicted: {predictionSummary.predicted}
                        {predictionSummary.confidence !== null ? ` (${predictionSummary.confidence}%)` : ''}
                    </span>
                </div>
            )}

            {/* ── Action bar ──────────────────────────────────── */}
            <div className="post-actions">
                <button
                    className={`action-btn action-btn--like${post.isLiked ? ' is-active' : ''}`}
                    onClick={() => onLike?.(post.id)}
                    title={post.isLiked ? 'Unlike' : 'Like'}
                >
                    <span className="action-btn__icon">{post.isLiked ? '❤️' : '🤍'}</span>
                    <span className="action-btn__count">{likesCount > 0 ? likesCount : ''}</span>
                </button>

                <button
                    className={`action-btn action-btn--repost${post.isReposted ? ' is-active' : ''}`}
                    onClick={() => onRepost?.(post.id)}
                    title={post.isReposted ? 'Unrepost' : 'Repost'}
                >
                    <span className="action-btn__icon">🔁</span>
                    <span className="action-btn__count">{repostsCount > 0 ? repostsCount : ''}</span>
                </button>

                <button
                    className="action-btn"
                    onClick={handleToggleComments}
                    title="Comments"
                >
                    <span className="action-btn__icon">💬</span>
                    {commentCount > 0 && <span className="action-btn__count">{commentCount}</span>}
                </button>

                <button
                    className="action-btn action-btn--share"
                    onClick={handleShare}
                    title="Share"
                >
                    <span className="action-btn__icon">↗</span>
                    {sharesCount > 0 && <span className="action-btn__count">{sharesCount}</span>}
                </button>

                <div className="action-btn--spacer" />

                {/* Views — read-only metric display */}
                {viewsCount > 0 && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', color: 'var(--text-subtle)', padding: '6px 8px' }}
                         title="Views">
                        <span>👁</span>
                        <span>{viewsCount >= 1000 ? `${(viewsCount / 1000).toFixed(1)}k` : viewsCount}</span>
                    </div>
                )}

                <button
                    className={`action-btn action-btn--bookmark${post.isBookmarked ? ' is-active' : ''}`}
                    onClick={() => onBookmark?.(post)}
                    title={bookmarkLabel}
                >
                    <span className="action-btn__icon">{post.isBookmarked ? '🔖' : '🗂️'}</span>
                </button>

                <button
                    className="action-btn action-btn--verify"
                    onClick={() => onVerify?.(post)}
                    title="Verify"
                >
                    <span className="action-btn__icon">🛡️</span>
                </button>

                <button
                    className="action-btn"
                    onClick={() => onDispute?.(post)}
                    title="Dispute"
                    style={{ color: 'var(--text-subtle)' }}
                >
                    <span className="action-btn__icon">⚠️</span>
                </button>
            </div>

            {/* ── Integrity report ────────────────────────────── */}
            {integrityReport && (
                <div style={{
                    marginTop: '12px',
                    padding: '10px 14px',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.04)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <strong style={{ fontSize: '12px', color: 'var(--text-color)' }}>
                            🛡️ Integrity {integrityReport.mode === 'auto' ? '(Auto)' : '(Manual)'}
                        </strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>
                            {new Date(integrityReport.checkedAt).toLocaleString()}
                        </span>
                    </div>
                    <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--neon-blue)' }}>
                        {integrityReport.badge?.text || `Score: ${integrityReport.score || 0}%`}
                    </div>
                    {Array.isArray(integrityReport.findings) && integrityReport.findings.length > 0 && (
                        <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            {integrityReport.findings.slice(0, 3).map((finding, index) => (
                                <li key={`${finding.claim}-${index}`} style={{ marginBottom: '4px' }}>
                                    {finding.claim}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* ── Comments ────────────────────────────────────── */}
            {showComments && (
                <div className="comments-section">
                    <div className="comment-input-row">
                        <input
                            className="comment-input"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void addComment();
                                }
                            }}
                            placeholder="Write a comment…"
                        />
                        <button
                            className="comment-send-btn"
                            onClick={() => void addComment()}
                            disabled={isSavingComment || !commentText.trim()}
                        >
                            {isSavingComment ? '…' : 'Send'}
                        </button>
                    </div>

                    {isLoadingComments && (
                        <div style={{ fontSize: '12px', color: 'var(--text-subtle)', marginBottom: '8px' }}>
                            Loading comments…
                        </div>
                    )}

                    {comments.map((comment) => (
                        <div key={comment.id} className="comment-item">
                            <div className="comment-item__avatar">
                                {(comment.user?.name || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className="comment-item__body">
                                <span className="comment-item__name">{comment.user?.name || 'User'}</span>
                                <span className="comment-item__text">{comment.content}</span>
                            </div>
                        </div>
                    ))}

                    {isSavingComment && (
                        <div style={{ fontSize: '12px', color: 'var(--text-subtle)', marginTop: '6px' }}>
                            Saving…
                        </div>
                    )}
                </div>
            )}
        </article>
        </Compartment>
    );
};

export default PostCard;

