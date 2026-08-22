import React, { useState, useEffect, useMemo } from 'react';
import PostCreator from '../Components/Common/Postcreator';
import PostCard from '../Components/Feed/PostCard.jsx';
import VideoFeedMini from '../Components/Feed/VideoFeedMini.jsx';
import SocialFeedsTimeline from '../Components/Feed/SocialFeedsTimeline.jsx';
import { useAuth } from '../Contexts/AuthContext';
import { socialGraphService } from '../Services/SocialGraph';
import { rankPostsByPredictedEngagement } from '../Services/EngagementAlgorithms';
import { truthEngine } from '../Services/truthEngine';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';
import OnboardingCard from '../Components/Common/OnboardingCard';
import ShortFormFeed from '../Components/Feed/ShortFormFeed';
import { apiService } from '../Services/api';
import { mergeFeedPosts, normalizeFeedPost, normalizePostsPayload, readStoredFeedPosts, writeStoredFeedPosts } from '../Services/postFeedPayload';

const FeedPage = ({ addTruthAlert, onNavigate, initialPlatform = 'all' }) => {
    const [posts, setPosts] = useState([]);
    const [following, setFollowing] = useState([]);
    const [integrityReports, setIntegrityReports] = useState({});
    const [feedScope, setFeedScope] = useState('local');
    const { user } = useAuth();
    const currentUser = user || { id: 'user1', name: 'Alex Raven', handle: '@alexraven', avatar: 'AR' };
    const localRegion = String(user?.location || '').trim();

    const normalizePost = (post) => normalizeFeedPost(post, currentUser);
    const normalizeLocation = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    const isLocalPost = (post) => {
        if (!localRegion) {
            return false;
        }

        const postRegion = String(post?.locationName || post?.location || '').trim();
        if (!postRegion) {
            return false;
        }

        const normalizedUserRegion = normalizeLocation(localRegion);
        const normalizedPostRegion = normalizeLocation(postRegion);
        if (!normalizedUserRegion || !normalizedPostRegion) {
            return false;
        }

        return normalizedPostRegion === normalizedUserRegion
            || normalizedPostRegion.includes(normalizedUserRegion)
            || normalizedUserRegion.includes(normalizedPostRegion);
    };

    const isQuestionPost = (post) => {
        const content = String(post?.content || '').trim();
        return Boolean(content) && truthEngine.isQuestion(content);
    };

    const buildIntegrityReport = (post, mode = 'manual') => {
        const content = String(post?.content || '').trim();

        // Questions are open inquiries and do not warrant an integrity/truth check or score.
        if (content && truthEngine.isQuestion(content)) {
            return {
                score: null,
                badge: truthEngine.getTruthBadge(0, { isQuestion: true }),
                findings: [],
                criticalFindings: [],
                mode,
                isQuestion: true,
                checkedAt: new Date().toISOString()
            };
        }

        const findings = content ? truthEngine.analyzeContent(content) : [];
        const score = content ? truthEngine.getTruthScore(content) : 72;
        const badge = truthEngine.getTruthBadge(score);
        const criticalFindings = findings.filter((item) => item.isTrue === false && Number(item.confidence) >= 0.9);

        return {
            score,
            badge,
            findings,
            criticalFindings,
            mode,
            checkedAt: new Date().toISOString()
        };
    };

    useEffect(() => {
        const samplePosts = [
            {
                id: '1',
                userId: 'user2',
                user: { id: 'user2', name: 'Sarah Johnson', handle: '@sarahj', avatar: 'SJ' },
                content: 'Just witnessed a peaceful protest downtown. Sharing live updates. #BreakingNews',
                mediaUrl: null,
                mediaType: null,
                likes: 45,
                reposts: 12,
                comments: [],
                createdAt: new Date(Date.now() - 3600000),
                isLiked: false,
                truthScore: 95
            },
            {
                id: '2',
                userId: 'user3',
                user: { id: 'user3', name: 'Michael Chen', handle: '@mchen', avatar: 'MC' },
                content: 'The future of AI is here! DeepSeek just released a groundbreaking model.',
                mediaUrl: null,
                mediaType: null,
                likes: 234,
                reposts: 67,
                comments: [],
                createdAt: new Date(Date.now() - 7200000),
                isLiked: false,
                truthScore: 88
            }
        ];

        const loadFeed = async () => {
            try {
                const response = await apiService.getPosts({ page: 1, pageSize: 40 });
                const normalizedPayload = normalizePostsPayload(response?.data ?? response);
                const backendPosts = normalizedPayload.map(normalizePost);
                const storedPosts = readStoredFeedPosts().map(normalizePost);
                const mergedPosts = mergeFeedPosts(storedPosts, backendPosts);
                setPosts(mergedPosts.length > 0 ? mergedPosts : samplePosts);
            } catch {
                const storedPosts = readStoredFeedPosts().map(normalizePost);
                setPosts(storedPosts.length > 0 ? storedPosts : samplePosts);
            }
        };

        loadFeed();

        socialGraphService.registerUserProfile(currentUser);
        samplePosts.forEach((post) => socialGraphService.registerUserProfile(post.user));

        const existingFollowing = socialGraphService.getFollowingIds(currentUser.id);
        if (existingFollowing.length === 0) {
            socialGraphService.followUser(currentUser.id, 'user2');
            socialGraphService.followUser(currentUser.id, 'user3');
        }

        setFollowing(socialGraphService.getFollowingIds(currentUser.id));
    }, [currentUser.id]);

    useEffect(() => {
        writeStoredFeedPosts(posts);
        window.dispatchEvent(new Event('wiseraven:posts-updated'));
    }, [posts]);

    const handlePostCreate = (newPost) => {
        setPosts(prev => mergeFeedPosts([normalizePost(newPost)], prev));
    };

    const handleLike = async (postId) => {
        try {
            const updated = await apiService.likePost(postId);
            setPosts((prev) => {
                const next = prev.map((post) =>
                    post.id === postId
                        ? {
                            ...post,
                            likes: Number(updated?.likesCount ?? post.likes ?? 0),
                            likesCount: Number(updated?.likesCount ?? post.likesCount ?? 0),
                            isLiked: Boolean(updated?.isLiked)
                        }
                        : post
                );

                try {
                    const liked = next.filter((p) => p.isLiked);
                    localStorage.setItem('wiseLikedPosts', JSON.stringify(liked));
                    window.dispatchEvent(new Event('wiseraven:likes-updated'));
                } catch {
                    // Ignore local cache sync failures.
                }

                return next;
            });
        } catch (error) {
            const message = typeof error?.message === 'string' && error.message.trim().length > 0
                ? error.message.trim()
                : 'Failed to update like.';
            addTruthAlert('error', message, null);
        }
    };

    const handleRepost = async (postId) => {
        try {
            const updated = await apiService.repostPost(postId);
            setPosts((prev) => prev.map((post) =>
                post.id === postId
                    ? {
                        ...post,
                        reposts: Number(updated?.repostsCount ?? post.reposts ?? 0),
                        repostsCount: Number(updated?.repostsCount ?? post.repostsCount ?? 0),
                        isReposted: Boolean(updated?.isReposted)
                    }
                    : post
            ));
            addTruthAlert('success', 'Repost saved.', null);
        } catch (error) {
            const message = typeof error?.message === 'string' && error.message.trim().length > 0
                ? error.message.trim()
                : 'Failed to update repost.';
            addTruthAlert('error', message, null);
        }
    };

    const handleFollow = (userId) => {
        const currentlyFollowing = socialGraphService.isFollowing(currentUser.id, userId);
        if (currentlyFollowing) {
            socialGraphService.unfollowUser(currentUser.id, userId);
            addTruthAlert('info', 'Unfollowed user.', null);
        } else {
            socialGraphService.followUser(currentUser.id, userId);
            addTruthAlert('success', 'Started following user.', null);
            apiService.trackGrowthEvent('first_follow').catch(() => null);
        }

        setFollowing(socialGraphService.getFollowingIds(currentUser.id));
    };

    const handleBookmark = (post) => {
        const existing = JSON.parse(localStorage.getItem('wiseBookmarks') || '[]');
        const alreadySaved = existing.some((item) => item.id === post.id);

        if (alreadySaved) {
            addTruthAlert('info', 'Post is already in bookmarks.', null);
            return;
        }

        localStorage.setItem('wiseBookmarks', JSON.stringify([post, ...existing]));
        addTruthAlert('success', 'Post saved to bookmarks.', null);
    };

    const handleVerifyPost = (post) => {
        const content = String(post?.content || '').trim();
        if (!content) {
            addTruthAlert('info', 'This post has no text content to verify.', null);
            return;
        }

        // Questions are open inquiries — no integrity check or score applies.
        if (isQuestionPost(post)) {
            setIntegrityReports((prev) => ({
                ...prev,
                [post.id]: buildIntegrityReport(post, 'manual')
            }));
            addTruthAlert('info', 'This post is a question, so no integrity check or score applies.', null);
            return;
        }

        const report = buildIntegrityReport(post, 'manual');

        setIntegrityReports((prev) => ({
            ...prev,
            [post.id]: report
        }));

        if (report.criticalFindings.length > 0) {
            addTruthAlert(
                'warning',
                `Integrity checker flagged ${report.criticalFindings.length} issue(s) in this post.`,
                report.criticalFindings[0].correction || null
            );
            return;
        }

        addTruthAlert('success', `Integrity check complete. ${report.badge.text}`, null);
    };

    const handleDisputePost = async (post) => {
        try {
            const result = await truthEngine.disputePost(post.id, post.content || '', 'Feed integrity review');
            handleVerifyPost(post);

            if (result?.corrections?.length) {
                addTruthAlert('warning', 'Dispute recorded and corrections were suggested.', result.corrections[0]);
                return;
            }

            addTruthAlert('info', 'Dispute submitted for review.', null);
        } catch {
            addTruthAlert('error', 'Failed to run integrity dispute check.', null);
        }
    };

    const rankedFeedPosts = useMemo(() => {
        const ranked = rankPostsByPredictedEngagement(posts, { horizonHours: 18 });

        if (feedScope !== 'local' || !localRegion) {
            return ranked;
        }

        return [...ranked].sort((left, right) => {
            const leftLocal = isLocalPost(left);
            const rightLocal = isLocalPost(right);

            if (leftLocal === rightLocal) {
                return 0;
            }

            return leftLocal ? -1 : 1;
        });
    }, [posts, feedScope, localRegion]);

    useEffect(() => {
        setIntegrityReports((prev) => {
            const next = { ...prev };
            let changed = false;

            for (const post of rankedFeedPosts) {
                if (!post?.id || next[post.id]) {
                    continue;
                }

                next[post.id] = buildIntegrityReport(post, 'auto');
                changed = true;
            }

            return changed ? next : prev;
        });
    }, [rankedFeedPosts]);

    return (
        <div>
            <div
                className="ancient-warning-banner"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '14px',
                    padding: '10px 12px',
                    borderRadius: '14px',
                    border: '1px solid rgba(255, 176, 77, 0.7)',
                    background: 'linear-gradient(135deg, rgba(118, 45, 18, 0.8), rgba(255, 82, 82, 0.12), rgba(76, 35, 18, 0.75))',
                    color: '#fff4d6',
                    boxShadow: '0 8px 24px rgba(255, 160, 74, 0.18), inset 0 0 18px rgba(255, 214, 120, 0.14)'
                }}
            >
                <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                    Liars, beware.
                </div>
                <div style={{ fontSize: '11px', color: '#ffd3d3', textAlign: 'right', lineHeight: 1.5 }}>
                    The gods are watching.
                </div>
            </div>
            <div
                style={{
                    position: 'sticky',
                    top: '88px',
                    zIndex: 15,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px',
                    pointerEvents: 'none'
                }}
            >
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', pointerEvents: 'auto' }}>
                    {[
                        { id: 'local', label: 'Local' },
                        { id: 'national', label: 'National' }
                    ].map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            onClick={() => setFeedScope(option.id)}
                            style={{
                                border: feedScope === option.id ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                background: feedScope === option.id ? 'rgba(255,255,255,0.08)' : 'rgba(17, 24, 39, 0.7)',
                                color: 'var(--text-color)',
                                borderRadius: '999px',
                                padding: '8px 12px',
                                cursor: 'pointer',
                                backdropFilter: 'blur(6px)'
                            }}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div
                    style={{
                        background: 'rgba(17, 24, 39, 0.7)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '8px 10px',
                        backdropFilter: 'blur(6px)',
                        pointerEvents: 'auto'
                    }}
                >
                    <WiseRavenLogo showTagline={false} />
                </div>
            </div>
            <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--light-color)', lineHeight: 1.5 }}>
                {feedScope === 'local'
                    ? (localRegion
                        ? `Local feed prioritized for ${localRegion}.`
                        : 'Local feed is active, but no signup location is available yet.')
                    : 'National feed is active.'}
            </div>
            <PostCreator onPostCreate={handlePostCreate} addTruthAlert={addTruthAlert} currentUser={currentUser} />
            <div style={{ marginTop: '20px' }}>
                {rankedFeedPosts.map(post => (
                    <PostCard
                        key={post.id}
                        post={post}
                        onLike={handleLike}
                        onRepost={handleRepost}
                        onDispute={handleDisputePost}
                        onVerify={handleVerifyPost}
                        integrityReport={integrityReports[post.id]}
                        currentUser={currentUser}
                        isFollowing={following.includes(post.userId)}
                        onFollow={handleFollow}
                        onBookmark={handleBookmark}
                    />
                ))}
            </div>
            <div
                style={{
                    marginTop: '24px',
                    paddingTop: '18px',
                    borderTop: '1px solid var(--border-color)'
                }}
            >
                <div style={{ marginBottom: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--highlight-color)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Explore More
                </div>
                <OnboardingCard onNavigate={onNavigate} />
                <ShortFormFeed posts={rankedFeedPosts} />
                <VideoFeedMini posts={rankedFeedPosts} />
                <SocialFeedsTimeline user={currentUser} initialPlatform={initialPlatform} />
            </div>
        </div>
    );
};

export default FeedPage;
