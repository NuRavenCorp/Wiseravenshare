import React, { useState, useEffect } from 'react';
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

const FeedPage = ({ addTruthAlert, onNavigate }) => {
    const [posts, setPosts] = useState([]);
    const [following, setFollowing] = useState([]);
    const [integrityReports, setIntegrityReports] = useState({});
    const { user } = useAuth();
    const currentUser = user || { id: 'user1', name: 'Alex Raven', handle: '@alexraven', avatar: 'AR' };

    const normalizePost = (post) => normalizeFeedPost(post, currentUser);

    const buildIntegrityReport = (post, mode = 'manual') => {
        const content = String(post?.content || '').trim();
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

    const filteredPosts = posts.filter(post =>
        post.userId === currentUser.id || following.includes(post.userId)
    );

    const rankedFeedPosts = rankPostsByPredictedEngagement(filteredPosts, { horizonHours: 18 });

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
                    justifyContent: 'flex-end',
                    marginBottom: '12px',
                    pointerEvents: 'none'
                }}
            >
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
                <SocialFeedsTimeline user={currentUser} />
            </div>
        </div>
    );
};

export default FeedPage;
