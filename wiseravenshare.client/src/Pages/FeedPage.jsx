import React, { useState, useEffect } from 'react';
import PostCreator from '../Components/Common/Postcreator';
import PostCard from '../Components/Feed/PostCard.jsx';
import VideoFeedMini from '../Components/Feed/VideoFeedMini.jsx';
import { useAuth } from '../Contexts/AuthContext';
import { socialGraphService } from '../Services/SocialGraph';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';

const MAX_STORED_POSTS = 120;

const FeedPage = ({ addTruthAlert }) => {
    const [posts, setPosts] = useState([]);
    const [following, setFollowing] = useState([]);
    const { user } = useAuth();
    const currentUser = user || { id: 'user1', name: 'Alex Raven', handle: '@alexraven', avatar: 'AR' };

    useEffect(() => {
        // Load sample posts
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
        setPosts(samplePosts);

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
        localStorage.setItem('wiseRecentPosts', JSON.stringify(posts.slice(0, MAX_STORED_POSTS)));
        window.dispatchEvent(new Event('wiseraven:posts-updated'));
    }, [posts]);

    const handlePostCreate = (newPost) => {
        setPosts(prev => [newPost, ...prev]);
    };

    const handleLike = (postId) => {
        setPosts((prev) => {
            const next = prev.map((post) =>
                post.id === postId
                    ? { ...post, likes: post.isLiked ? post.likes - 1 : post.likes + 1, isLiked: !post.isLiked }
                    : post
            );

            try {
                const liked = next.filter((p) => p.isLiked);
                localStorage.setItem('wiseLikedPosts', JSON.stringify(liked));
                window.dispatchEvent(new Event('wiseraven:likes-updated'));
            } catch { /* ignore */ }

            return next;
        });
    };

    const handleRepost = (postId) => {
        setPosts(prev => prev.map(post =>
            post.id === postId
                ? { ...post, reposts: post.reposts + 1 }
                : post
        ));
        addTruthAlert('success', 'Repost added to your feed!', null);
    };

    const handleFollow = (userId) => {
        const currentlyFollowing = socialGraphService.isFollowing(currentUser.id, userId);
        if (currentlyFollowing) {
            socialGraphService.unfollowUser(currentUser.id, userId);
            addTruthAlert('info', 'Unfollowed user.', null);
        } else {
            socialGraphService.followUser(currentUser.id, userId);
            addTruthAlert('success', 'Started following user.', null);
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

    const filteredPosts = posts.filter(post =>
        post.userId === currentUser.id || following.includes(post.userId)
    );

    return (
        <div>
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
            <PostCreator onPostCreate={handlePostCreate} addTruthAlert={addTruthAlert} />
            <VideoFeedMini posts={filteredPosts} />
            <div style={{ marginTop: '20px' }}>
                {filteredPosts.map(post => (
                    <PostCard
                        key={post.id}
                        post={post}
                        onLike={handleLike}
                        onRepost={handleRepost}
                        onDispute={() => { }}
                        currentUser={currentUser}
                        isFollowing={following.includes(post.userId)}
                        onFollow={handleFollow}
                        onBookmark={handleBookmark}
                    />
                ))}
            </div>
        </div>
    );
};

export default FeedPage;
