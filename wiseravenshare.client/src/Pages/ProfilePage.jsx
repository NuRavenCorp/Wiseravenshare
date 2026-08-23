import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import PostCard from '../Components/Feed/PostCard.jsx';
import SocialFeedsTimeline from '../Components/Feed/SocialFeedsTimeline.jsx';
import { useNotification } from '../Contexts/NotificationContext';
import { socialGraphService } from '../Services/SocialGraph';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';
import { compressAvatarImage, isImageAvatar as checkIsImageAvatar } from '../utils/avatarUtils';

const getConnection = (feeds, ...keys) => {
    const source = feeds || {};
    for (const key of keys) {
        if (source[key]) {
            return source[key];
        }
    }
    return {};
};

const normalizeConnection = (connection) => ({
    enabled: Boolean(connection?.enabled),
    username: String(connection?.username || '').trim(),
    profileUrl: String(connection?.profileUrl || '').trim(),
    feedUrl: String(connection?.feedUrl || '').trim()
});

const normalizeSocialFeeds = (socialFeeds) => {
    const feeds = socialFeeds || {};
    return {
        tikTok: normalizeConnection(getConnection(feeds, 'tikTok', 'tiktok', 'TikTok')),
        facebook: normalizeConnection(getConnection(feeds, 'facebook', 'Facebook')),
        instagram: normalizeConnection(getConnection(feeds, 'instagram', 'Instagram')),
        youtube: normalizeConnection(getConnection(feeds, 'youtube', 'YouTube')),
        twitter: normalizeConnection(getConnection(feeds, 'twitter', 'Twitter')),
        linkedin: normalizeConnection(getConnection(feeds, 'linkedin', 'LinkedIn'))
    };
};

const getProfileDraftKey = (userId) => `wiseProfileEditDraft:${userId}`;

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    const defaults = ['admin@wise-ravens.com'];
    return new Set([...defaults, ...fromEnv]);
};

const isImageSource = (value) => checkIsImageAvatar(value);

const resizeImageToAvatarDataUrl = (fileOrDataUrl, maxWidth = 400, maxHeight = 400, quality = 0.85) => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Failed to load image for resizing.'));

        if (typeof fileOrDataUrl === 'string') {
            img.src = fileOrDataUrl;
        } else {
            const reader = new FileReader();
            reader.onload = () => { img.src = reader.result; };
            reader.onerror = () => reject(new Error('Failed to read image file.'));
            reader.readAsDataURL(fileOrDataUrl);
        }
    });
};

const ProfilePage = ({ openEditMode = false, onEditModeHandled = null }) => {
    const { user, updateProfile } = useAuth();
    const { addToast } = useNotification();
    const emptySocialFeeds = {
        tikTok: { enabled: false, username: '', profileUrl: '', feedUrl: '' },
        facebook: { enabled: false, username: '', profileUrl: '', feedUrl: '' },
        instagram: { enabled: false, username: '', profileUrl: '', feedUrl: '' },
        youtube: { enabled: false, username: '', profileUrl: '', feedUrl: '' },
        twitter: { enabled: false, username: '', profileUrl: '', feedUrl: '' },
        linkedin: { enabled: false, username: '', profileUrl: '', feedUrl: '' }
    };
    const [posts, setPosts] = useState([]);
    const [likedPosts, setLikedPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        bio: '',
        location: '',
        website: '',
        avatar: '',
        socialFeeds: emptySocialFeeds
    });
    const [stats, setStats] = useState({
        posts: 0,
        followers: 0,
        following: 0
    });
    const [activeTab, setActiveTab] = useState('posts');
    const [followerProfiles, setFollowerProfiles] = useState([]);
    const [followingProfiles, setFollowingProfiles] = useState([]);
    const [associationView, setAssociationView] = useState('followers');
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState('');
    const [cameraStream, setCameraStream] = useState(null);
    const [focusedProfile, setFocusedProfile] = useState(null);
    const [persistenceStatus, setPersistenceStatus] = useState(null);
    const [persistenceLoading, setPersistenceLoading] = useState(false);
    const [persistenceError, setPersistenceError] = useState('');
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

    useEffect(() => {
        if (user) {
            socialGraphService.registerUserProfile(user);
            loadUserData();
            const normalizedFeeds = normalizeSocialFeeds(user.socialFeeds);
            let draft = null;

            try {
                const rawDraft = localStorage.getItem(getProfileDraftKey(user.id));
                draft = rawDraft ? JSON.parse(rawDraft) : null;
            } catch {
                draft = null;
            }

            setEditForm({
                name: draft?.name ?? user.name ?? user.displayName ?? '',
                bio: draft?.bio ?? user.bio ?? '',
                location: draft?.location ?? user.location ?? '',
                website: draft?.website ?? user.website ?? '',
                avatar: draft?.avatar ?? user.avatar ?? user.avatarUrl ?? '',
                socialFeeds: normalizeSocialFeeds(draft?.socialFeeds || normalizedFeeds)
            });
        }
    }, [user]);

    useEffect(() => {
        if (!openEditMode || !user?.id) {
            return;
        }

        setEditing(true);
        if (typeof onEditModeHandled === 'function') {
            onEditModeHandled();
        }
    }, [openEditMode, onEditModeHandled, user?.id]);

    useEffect(() => {
        if (!user?.id) {
            setFocusedProfile(null);
            return;
        }

        try {
            const raw = localStorage.getItem('wiseProfileFocus');
            const parsed = raw ? JSON.parse(raw) : null;
            if (!parsed?.id || parsed.id === user.id) {
                setFocusedProfile(null);
                return;
            }

            setFocusedProfile({
                id: parsed.id,
                name: parsed.name || 'User',
                handle: parsed.handle || `@${parsed.id}`,
                avatar: parsed.avatar || 'U',
                followers: Number(parsed.followers) || 0,
                following: Number(parsed.following) || 0
            });
        } catch {
            setFocusedProfile(null);
        }
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id || !editing) return;

        try {
            localStorage.setItem(getProfileDraftKey(user.id), JSON.stringify(editForm));
        } catch {
            /* ignore storage errors */
        }
    }, [editing, editForm, user?.id]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const handleSocialUpdate = () => {
            refreshConnections();
        };

        window.addEventListener('wiseraven:social-updated', handleSocialUpdate);
        return () => {
            window.removeEventListener('wiseraven:social-updated', handleSocialUpdate);
        };
    }, [user?.id]);

    const loadPersistenceStatus = async (refresh = false) => {
        if (!isAdminUser) {
            return;
        }

        setPersistenceLoading(true);
        setPersistenceError('');
        try {
            const response = await apiService.getPersistenceStatus(refresh);
            setPersistenceStatus(response?.data || null);
        } catch (error) {
            const statusCode = error?.response?.status;
            const message = error?.response?.data?.message
                || error?.message
                || 'Unable to load persistence diagnostics.';
            setPersistenceError(statusCode ? `${message} (HTTP ${statusCode})` : message);
            setPersistenceStatus(null);
        } finally {
            setPersistenceLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdminUser) {
            setPersistenceStatus(null);
            setPersistenceError('');
            return;
        }

        loadPersistenceStatus();
    }, [isAdminUser]);

    useEffect(() => {
        if (!user?.id) return undefined;

        const handlePostsUpdated = () => {
            refreshPostsFromStorage(user.id);
        };

        window.addEventListener('wiseraven:posts-updated', handlePostsUpdated);
        window.addEventListener('wiseraven:likes-updated', handlePostsUpdated);
        return () => {
            window.removeEventListener('wiseraven:posts-updated', handlePostsUpdated);
            window.removeEventListener('wiseraven:likes-updated', handlePostsUpdated);
        };
    }, [user?.id]);

    useEffect(() => {
        if (cameraOpen && videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraOpen, cameraStream]);

    useEffect(() => () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
        }
    }, [cameraStream]);

    const refreshConnections = () => {
        if (!user?.id) return;
        const counts = socialGraphService.getCounts(user.id);
        const followerIds = socialGraphService.getFollowerIds(user.id);
        const followingIds = socialGraphService.getFollowingIds(user.id);

        setStats((prev) => ({
            ...prev,
            followers: counts.followers,
            following: counts.following
        }));
        setFollowerProfiles(socialGraphService.getProfiles(followerIds));
        setFollowingProfiles(socialGraphService.getProfiles(followingIds));
    };

    const refreshPostsFromStorage = (userId) => {
        if (!userId) return;
        try {
            const feed = JSON.parse(localStorage.getItem('wiseRecentPosts') || '[]');
            const discover = JSON.parse(localStorage.getItem('wiseDiscoverPosts') || '[]');
            const all = [...feed, ...discover];
            const mine = all.filter((p) => p?.userId === userId || p?.user?.id === userId);
            const unique = mine.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
            setPosts(unique);
            setStats((prev) => ({ ...prev, posts: unique.length }));

            const liked = JSON.parse(localStorage.getItem('wiseLikedPosts') || '[]');
            setLikedPosts(Array.isArray(liked) ? liked : []);
        } catch {
            /* ignore storage errors */
        }
    };

    const loadUserData = async () => {
        setLoading(true);
        refreshPostsFromStorage(user?.id);
        try {
            const [postsRes, statsRes] = await Promise.all([
                apiService.getPosts({ userId: user.id }),
                apiService.getUser(user.id)
            ]);
            if (Array.isArray(postsRes.data) && postsRes.data.length > 0) {
                setPosts(postsRes.data);
                setStats((s) => ({ ...s, posts: postsRes.total || postsRes.data.length }));
            }
            if (statsRes.data?.followersCount !== undefined) {
                setStats((s) => ({
                    ...s,
                    followers: statsRes.data.followersCount,
                    following: statsRes.data.followingCount || 0
                }));
            }
        } catch {
            /* API unavailable — localStorage data already set above */
        } finally {
            refreshConnections();
            setLoading(false);
        }
    };

    const handleEditSubmit = async () => {
        try {
            let nextForm = { ...editForm };
            if (nextForm.avatar && typeof nextForm.avatar === 'string' && nextForm.avatar.startsWith('data:image/')) {
                try {
                    nextForm.avatar = await compressAvatarImage(nextForm.avatar, 180, 60000);
                } catch {
                    /* fallback if compression fails */
                }
            }
            await updateProfile(nextForm);
            if (user?.id) {
                localStorage.removeItem(getProfileDraftKey(user.id));
            }
            setEditing(false);
            if (cameraStream) {
                cameraStream.getTracks().forEach((track) => track.stop());
                setCameraStream(null);
            }
            setCameraOpen(false);
            addToast('Profile updated successfully!', 'success');
        } catch (error) {
            addToast('Failed to update profile', 'error');
        }
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
    });

    const handleAvatarFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setCameraError('Profile photo must be an image file.');
            return;
        }

        try {
            const resizedDataUrl = await compressAvatarImage(file, 180, 60000);
            setEditForm((prev) => ({ ...prev, avatar: resizedDataUrl }));
            setCameraError('');
        } catch (err) {
            setCameraError(err.message || 'Unable to load photo.');
        }
    };

    const startCamera = async () => {
        setCameraError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            setCameraStream(stream);
            setCameraOpen(true);
        } catch (err) {
            setCameraError('Camera access was denied or is unavailable on this device.');
        }
    };

    const stopCamera = () => {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
        }
        setCameraStream(null);
        setCameraOpen(false);
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const rawDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        try {
            const resizedDataUrl = await compressAvatarImage(rawDataUrl, 180, 60000);
            setEditForm((prev) => ({ ...prev, avatar: resizedDataUrl }));
        } catch {
            setEditForm((prev) => ({ ...prev, avatar: rawDataUrl }));
        }
        stopCamera();
    };

    const derivedStats = useMemo(() => {
        const handle = String(user?.handle || user?.username || '').replace(/^@/, '').toLowerCase();
        const mentionPatterns = handle
            ? [
                new RegExp(`@${handle}\b`, 'i'),
                new RegExp(`\b${handle}\b`, 'i')
            ]
            : [];

        const allPosts = Array.isArray(posts) ? posts : [];
        const receivedLikes = allPosts.reduce((sum, post) => {
            const authoredByUser = post?.userId === user?.id || post?.user?.id === user?.id;
            return authoredByUser ? sum + (Number(post?.likes) || 0) : sum;
        }, 0);

        const mentions = allPosts.reduce((sum, post) => {
            const postText = `${post?.content || ''} ${Array.isArray(post?.comments) ? post.comments.map((comment) => comment?.content || '').join(' ') : ''}`;
            const matched = mentionPatterns.some((pattern) => pattern.test(postText));
            const mentionedInMetadata = post?.mentions?.some?.((mention) => {
                const mentionHandle = String(mention?.handle || mention?.username || mention || '').replace(/^@/, '').toLowerCase();
                return mentionHandle === handle;
            });
            return sum + (matched || mentionedInMetadata ? 1 : 0);
        }, 0);

        return {
            posts: allPosts.length,
            followers: stats.followers,
            following: stats.following,
            mentions,
            likes: receivedLikes
        };
    }, [posts, stats.followers, stats.following, user?.handle, user?.id, user?.username]);

    const repliesPosts = posts.filter((p) => {
        const comments = Array.isArray(p.comments) ? p.comments : [];
        return comments.some((c) => c?.user?.id === user?.id || c?.userId === user?.id);
    });

    const mediaPosts = posts.filter((p) => p.mediaUrl || p.youtubeUrl || p.tiktokUrl || p.facebookUrl || p.podcastUrl);

    const tabCounts = {
        posts: derivedStats.posts,
        replies: repliesPosts.length,
        media: mediaPosts.length,
        likes: likedPosts.length,
        mentions: derivedStats.mentions
    };

    const tabs = [
        { id: 'posts', label: `Posts (${tabCounts.posts})`, icon: 'fas fa-file-alt' },
        { id: 'replies', label: `Replies (${tabCounts.replies})`, icon: 'fas fa-reply' },
        { id: 'media', label: `Media (${tabCounts.media})`, icon: 'fas fa-image' },
        { id: 'likes', label: `Likes (${tabCounts.likes})`, icon: 'fas fa-heart' }
    ];

    const isImageAvatar = isImageSource(user?.avatar);
    const focusedIsImageAvatar = isImageSource(focusedProfile?.avatar);
    const isFollowingFocusedProfile = focusedProfile?.id
        ? socialGraphService.isFollowing(user?.id, focusedProfile.id)
        : false;

    if (!user) return null;

    return (
        <div>
            {focusedProfile && (
                <div style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '16px',
                    border: '1px solid var(--border-color)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '54px',
                                height: '54px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold'
                            }}>
                                {focusedIsImageAvatar ? (
                                    <img
                                        src={focusedProfile.avatar}
                                        alt="Focused profile avatar"
                                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            if (e.currentTarget.parentElement) {
                                                e.currentTarget.parentElement.textContent = (focusedProfile.name || 'U').charAt(0).toUpperCase();
                                            }
                                        }}
                                    />
                                ) : (
                                    (focusedProfile.name || 'U').charAt(0).toUpperCase()
                                )}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700 }}>{focusedProfile.name}</div>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>
                                    {String(focusedProfile.handle).startsWith('@') ? focusedProfile.handle : `@${focusedProfile.handle}`}
                                </div>
                                <div style={{ color: 'var(--highlight-color)', fontSize: '12px' }}>
                                    {focusedProfile.followers.toLocaleString()} followers • {focusedProfile.following.toLocaleString()} following
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!focusedProfile?.id || !user?.id) return;
                                    if (socialGraphService.isFollowing(user.id, focusedProfile.id)) {
                                        socialGraphService.unfollowUser(user.id, focusedProfile.id);
                                    } else {
                                        socialGraphService.followUser(user.id, focusedProfile.id);
                                    }
                                    window.dispatchEvent(new Event('wiseraven:social-updated'));
                                    setFocusedProfile((prev) => (prev ? { ...prev } : prev));
                                }}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    background: isFollowingFocusedProfile ? 'rgba(255,255,255,0.06)' : 'var(--highlight-color)',
                                    color: 'var(--text-color)',
                                    borderRadius: '999px',
                                    padding: '7px 12px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                {isFollowingFocusedProfile ? 'Following' : 'Follow'}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    localStorage.removeItem('wiseProfileFocus');
                                    setFocusedProfile(null);
                                }}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    borderRadius: '999px',
                                    padding: '7px 12px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                }}
                            >
                                Return to my profile
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Header */}
            <div style={{
                background: 'var(--card-bg)',
                borderRadius: '12px',
                padding: '30px',
                marginBottom: '20px',
                border: '1px solid var(--border-color)'
            }}>
                <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}>
                        <WiseRavenLogo />
                    </div>
                    <div style={{
                        width: '120px',
                        height: '120px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '48px',
                        fontWeight: 'bold'
                    }}>
                        {isImageAvatar ? (
                            <img
                                src={user.avatar}
                                alt="Profile avatar"
                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                                onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    if (e.currentTarget.parentElement) {
                                        e.currentTarget.parentElement.textContent = (user.name || 'U').charAt(0).toUpperCase();
                                    }
                                }}
                            />
                        ) : (
                            (user.name || 'U').charAt(0).toUpperCase()
                        )}
                    </div>

                    <div style={{ flex: 1 }}>
                        {!editing ? (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                                    <h2>{user.name}</h2>
                                    <button
                                        onClick={() => setEditing(true)}
                                        style={{
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <i className="fas fa-edit"></i> Edit Profile
                                    </button>
                                </div>
                                <div style={{ color: 'var(--highlight-color)', marginBottom: '10px' }}>
                                    @{user.handle || user.username}
                                </div>
                                {user.bio && <p style={{ marginBottom: '10px' }}>{user.bio}</p>}
                                <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: 'var(--highlight-color)' }}>
                                    {user.location && <span><i className="fas fa-map-marker-alt"></i> {user.location}</span>}
                                    {user.website && <span><i className="fas fa-link"></i> <a href={user.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--highlight-color)' }}>{user.website}</a></span>}
                                    <span><i className="fas fa-calendar"></i> Joined {new Date(user.createdAt || Date.now()).toLocaleDateString()}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                                    {user.socialFeeds?.tikTok?.enabled && (
                                        <a
                                            href={user.socialFeeds?.tikTok?.profileUrl || user.socialFeeds?.tikTok?.feedUrl || `https://www.tiktok.com/@${user.socialFeeds?.tikTok?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#93c5fd', fontSize: '13px' }}
                                        >
                                            TikTok Feed
                                        </a>
                                    )}
                                    {user.socialFeeds?.facebook?.enabled && (
                                        <a
                                            href={user.socialFeeds?.facebook?.profileUrl || user.socialFeeds?.facebook?.feedUrl || `https://www.facebook.com/${user.socialFeeds?.facebook?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#93c5fd', fontSize: '13px' }}
                                        >
                                            Facebook Feed
                                        </a>
                                    )}
                                    {user.socialFeeds?.instagram?.enabled && (
                                        <a
                                            href={user.socialFeeds?.instagram?.profileUrl || user.socialFeeds?.instagram?.feedUrl || `https://www.instagram.com/${user.socialFeeds?.instagram?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#f9a8d4', fontSize: '13px' }}
                                        >
                                            Instagram Feed
                                        </a>
                                    )}
                                    {user.socialFeeds?.youtube?.enabled && (
                                        <a
                                            href={user.socialFeeds?.youtube?.profileUrl || user.socialFeeds?.youtube?.feedUrl || `https://www.youtube.com/@${user.socialFeeds?.youtube?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#f87171', fontSize: '13px' }}
                                        >
                                            YouTube Feed
                                        </a>
                                    )}
                                    {user.socialFeeds?.twitter?.enabled && (
                                        <a
                                            href={user.socialFeeds?.twitter?.profileUrl || user.socialFeeds?.twitter?.feedUrl || `https://twitter.com/${user.socialFeeds?.twitter?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#38bdf8', fontSize: '13px' }}
                                        >
                                            Twitter / X Feed
                                        </a>
                                    )}
                                    {user.socialFeeds?.linkedin?.enabled && (
                                        <a
                                            href={user.socialFeeds?.linkedin?.profileUrl || user.socialFeeds?.linkedin?.feedUrl || `https://www.linkedin.com/in/${user.socialFeeds?.linkedin?.username || ''}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ color: '#60a5fa', fontSize: '13px' }}
                                        >
                                            LinkedIn Feed
                                        </a>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div>
                                <div style={{ marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        placeholder="Name"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            marginBottom: '10px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-color)'
                                        }}
                                    />
                                    <textarea
                                        placeholder="Bio"
                                        value={editForm.bio}
                                        onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                                        rows="3"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            marginBottom: '10px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-color)',
                                            resize: 'vertical'
                                        }}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Location"
                                        value={editForm.location}
                                        onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            marginBottom: '10px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-color)'
                                        }}
                                    />
                                    <input
                                        type="url"
                                        placeholder="Website"
                                        value={editForm.website}
                                        onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-color)'
                                        }}
                                    />
                                    <div style={{ marginTop: '10px', marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>TikTok feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.tikTok?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        tikTok: { ...prev.socialFeeds.tikTok, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable TikTok feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="TikTok username"
                                            value={editForm.socialFeeds?.tikTok?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    tikTok: { ...prev.socialFeeds.tikTok, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="TikTok profile URL"
                                            value={editForm.socialFeeds?.tikTok?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    tikTok: { ...prev.socialFeeds.tikTok, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="TikTok feed URL (optional override)"
                                            value={editForm.socialFeeds?.tikTok?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    tikTok: { ...prev.socialFeeds.tikTok, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            For embed rendering, use a direct TikTok video URL (example: https://www.tiktok.com/@user/video/1234567890).
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>Facebook feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.facebook?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        facebook: { ...prev.socialFeeds.facebook, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable Facebook feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Facebook page/profile"
                                            value={editForm.socialFeeds?.facebook?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    facebook: { ...prev.socialFeeds.facebook, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Facebook profile/page URL"
                                            value={editForm.socialFeeds?.facebook?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    facebook: { ...prev.socialFeeds.facebook, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Facebook feed URL (optional override)"
                                            value={editForm.socialFeeds?.facebook?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    facebook: { ...prev.socialFeeds.facebook, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            For embed rendering, use a direct Facebook post URL (example: https://www.facebook.com/page/posts/postId).
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>Instagram feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.instagram?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        instagram: { ...prev.socialFeeds.instagram, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable Instagram feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Instagram username"
                                            value={editForm.socialFeeds?.instagram?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    instagram: { ...prev.socialFeeds.instagram, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Instagram profile URL"
                                            value={editForm.socialFeeds?.instagram?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    instagram: { ...prev.socialFeeds.instagram, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Instagram feed URL (optional override)"
                                            value={editForm.socialFeeds?.instagram?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    instagram: { ...prev.socialFeeds.instagram, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            For embed rendering, use an Instagram post/reel URL (example: https://www.instagram.com/p/ABC123xyz/).
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>YouTube feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.youtube?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        youtube: { ...prev.socialFeeds.youtube, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable YouTube feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="YouTube channel handle"
                                            value={editForm.socialFeeds?.youtube?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    youtube: { ...prev.socialFeeds.youtube, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="YouTube channel URL"
                                            value={editForm.socialFeeds?.youtube?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    youtube: { ...prev.socialFeeds.youtube, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="YouTube feed URL (optional override)"
                                            value={editForm.socialFeeds?.youtube?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    youtube: { ...prev.socialFeeds.youtube, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Use your channel handle (example: MyChannel) or a channel URL (example: https://www.youtube.com/@MyChannel).
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>Twitter / X feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.twitter?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        twitter: { ...prev.socialFeeds.twitter, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable Twitter / X feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Twitter / X handle"
                                            value={editForm.socialFeeds?.twitter?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    twitter: { ...prev.socialFeeds.twitter, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Twitter / X profile URL"
                                            value={editForm.socialFeeds?.twitter?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    twitter: { ...prev.socialFeeds.twitter, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="Twitter / X feed URL (optional override)"
                                            value={editForm.socialFeeds?.twitter?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    twitter: { ...prev.socialFeeds.twitter, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Use your handle without the @ (example: twitterhandle) or a profile URL (example: https://twitter.com/handle).
                                        </div>
                                    </div>
                                    <div style={{ marginBottom: '10px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '8px' }}>LinkedIn feed connection</div>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={Boolean(editForm.socialFeeds?.linkedin?.enabled)}
                                                onChange={(e) => setEditForm((prev) => ({
                                                    ...prev,
                                                    socialFeeds: {
                                                        ...prev.socialFeeds,
                                                        linkedin: { ...prev.socialFeeds.linkedin, enabled: e.target.checked }
                                                    }
                                                }))}
                                            />
                                            Enable LinkedIn feed
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="LinkedIn profile/company ID"
                                            value={editForm.socialFeeds?.linkedin?.username || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    linkedin: { ...prev.socialFeeds.linkedin, username: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="LinkedIn profile/company URL"
                                            value={editForm.socialFeeds?.linkedin?.profileUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    linkedin: { ...prev.socialFeeds.linkedin, profileUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                marginBottom: '8px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <input
                                            type="url"
                                            placeholder="LinkedIn feed URL (optional override)"
                                            value={editForm.socialFeeds?.linkedin?.feedUrl || ''}
                                            onChange={(e) => setEditForm((prev) => ({
                                                ...prev,
                                                socialFeeds: {
                                                    ...prev.socialFeeds,
                                                    linkedin: { ...prev.socialFeeds.linkedin, feedUrl: e.target.value }
                                                }
                                            }))}
                                            style={{
                                                width: '100%',
                                                padding: '10px',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                color: 'var(--text-color)'
                                            }}
                                        />
                                        <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--highlight-color)' }}>
                                            Use your profile/company ID (example: company-name) or a URL (example: https://www.linkedin.com/company-name/).
                                        </div>
                                    </div>
                                    <label style={{ display: 'block', margin: '10px 0 8px', color: 'var(--highlight-color)' }}>
                                        Profile photo
                                    </label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleAvatarFileChange}
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            marginBottom: '10px',
                                            background: 'rgba(255, 255, 255, 0.05)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            color: 'var(--text-color)'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        {!cameraOpen ? (
                                            <button
                                                type="button"
                                                onClick={startCamera}
                                                style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border-color)',
                                                    background: 'transparent',
                                                    color: 'var(--text-color)',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Take Photo
                                            </button>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={capturePhoto}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        border: 'none',
                                                        background: 'var(--highlight-color)',
                                                        color: 'var(--text-color)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Capture
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={stopCamera}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'transparent',
                                                        color: 'var(--text-color)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancel Camera
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {cameraError && <div style={{ color: '#f87171', marginBottom: '10px' }}>{cameraError}</div>}
                                    {cameraOpen && (
                                        <div style={{ marginBottom: '10px' }}>
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                                            />
                                            <canvas ref={canvasRef} style={{ display: 'none' }} />
                                        </div>
                                    )}
                                    {editForm.avatar && typeof editForm.avatar === 'string' && isImageSource(editForm.avatar) && (
                                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                                            <img
                                                src={editForm.avatar}
                                                alt="Profile preview"
                                                style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                                            />
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        onClick={handleEditSubmit}
                                        style={{
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            background: 'var(--highlight-color)',
                                            border: 'none',
                                            color: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => {
                                            stopCamera();
                                            setEditing(false);
                                        }}
                                        style={{
                                            padding: '8px 20px',
                                            borderRadius: '20px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '12px',
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    {[
                        { label: 'Posts', value: derivedStats.posts, interactive: false },
                        { label: 'Followers', value: derivedStats.followers, interactive: true, view: 'followers' },
                        { label: 'Following', value: derivedStats.following, interactive: true, view: 'following' },
                        { label: 'Mentions', value: derivedStats.mentions, interactive: false },
                        { label: 'Likes', value: derivedStats.likes, interactive: false }
                    ].map((metric) => {
                        const metricCard = (
                            <>
                                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{metric.value}</div>
                                <div style={{ fontSize: '14px', color: 'var(--highlight-color)' }}>{metric.label}</div>
                            </>
                        );

                        if (metric.interactive) {
                            return (
                                <button
                                    key={metric.label}
                                    onClick={() => setAssociationView(metric.view)}
                                    style={{
                                        background: associationView === metric.view ? 'rgba(255,255,255,0.08)' : 'transparent',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        color: 'var(--text-color)',
                                        cursor: 'pointer',
                                        textAlign: 'left'
                                    }}
                                >
                                    {metricCard}
                                </button>
                            );
                        }

                        return (
                            <div
                                key={metric.label}
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '10px',
                                    padding: '10px 14px'
                                }}
                            >
                                {metricCard}
                            </div>
                        );
                    })}
                </div>

                <div style={{ marginTop: '14px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 'bold' }}>
                            {associationView === 'followers' ? 'Followers list' : 'Following list'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                            {associationView === 'followers' ? followerProfiles.length : followingProfiles.length} total
                        </div>
                    </div>

                    {(associationView === 'followers' ? followerProfiles : followingProfiles).length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--highlight-color)' }}>
                            {associationView === 'followers' ? 'No followers yet.' : 'You are not following anyone yet.'}
                        </div>
                    ) : (
                        (associationView === 'followers' ? followerProfiles : followingProfiles).map((profile) => (
                            <div
                                key={profile.id}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    fontSize: '13px',
                                    marginBottom: '6px',
                                    paddingBottom: '6px',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                <span>{profile.name}</span>
                                <span style={{ color: 'var(--highlight-color)' }}>
                                    {String(profile.handle || '').startsWith('@') ? profile.handle : `@${profile.handle}`}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', border: '1px solid var(--border-color)' }}>
                        <div
                            onClick={() => setAssociationView('followers')}
                            style={{ fontWeight: 'bold', marginBottom: '6px', cursor: 'pointer' }}
                        >
                            Followers
                        </div>
                        {followerProfiles.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--highlight-color)' }}>No followers yet.</div>
                        ) : (
                            followerProfiles.slice(0, 6).map((profile) => (
                                <div key={profile.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                                    {profile.name} <span style={{ color: 'var(--highlight-color)' }}>{String(profile.handle || '').startsWith('@') ? profile.handle : `@${profile.handle}`}</span>
                                </div>
                            ))
                        )}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px', border: '1px solid var(--border-color)' }}>
                        <div
                            onClick={() => setAssociationView('following')}
                            style={{ fontWeight: 'bold', marginBottom: '6px', cursor: 'pointer' }}
                        >
                            Following
                        </div>
                        {followingProfiles.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--highlight-color)' }}>You are not following anyone yet.</div>
                        ) : (
                            followingProfiles.slice(0, 6).map((profile) => (
                                <div key={profile.id} style={{ fontSize: '13px', marginBottom: '4px' }}>
                                    {profile.name} <span style={{ color: 'var(--highlight-color)' }}>{String(profile.handle || '').startsWith('@') ? profile.handle : `@${profile.handle}`}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            <SocialFeedsTimeline user={user} compact />

            {isAdminUser && (
                <div style={{
                    background: 'var(--card-bg)',
                    borderRadius: '12px',
                    padding: '16px',
                    marginBottom: '20px',
                    border: '1px solid var(--border-color)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                        <div>
                            <div style={{ fontWeight: 'bold' }}>Admin Persistence Status</div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                Database consistency status for profiles and social feeds
                            </div>
                        </div>
                        <button
                            onClick={() => loadPersistenceStatus(true)}
                            disabled={persistenceLoading}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '999px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-color)',
                                cursor: persistenceLoading ? 'default' : 'pointer',
                                opacity: persistenceLoading ? 0.7 : 1
                            }}
                        >
                            {persistenceLoading ? 'Checking...' : 'Refresh'}
                        </button>
                    </div>

                    {persistenceError && (
                        <div style={{ color: 'var(--error-color)', fontSize: '13px', marginBottom: '10px' }}>
                            {persistenceError}
                        </div>
                    )}

                    {persistenceStatus && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>User DB Configured</div>
                                <div style={{ fontWeight: 'bold' }}>{String(Boolean(persistenceStatus?.users?.databaseConfigured))}</div>
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>User DB Available</div>
                                <div style={{ fontWeight: 'bold' }}>{String(Boolean(persistenceStatus?.users?.databaseAvailable))}</div>
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Active User Table</div>
                                <div style={{ fontWeight: 'bold', wordBreak: 'normal', overflowWrap: 'anywhere' }}>{persistenceStatus?.users?.activeTable || 'n/a'}</div>
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Video DB Available</div>
                                <div style={{ fontWeight: 'bold' }}>{String(Boolean(persistenceStatus?.videos?.databaseAvailable))}</div>
                            </div>
                        </div>
                    )}

                    {persistenceStatus?.users?.lastError && (
                        <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--error-color)' }}>
                            Last DB error: {persistenceStatus.users.lastError}
                        </div>
                    )}
                </div>
            )}

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '10px'
            }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '20px',
                            border: 'none',
                            background: activeTab === tab.id ? 'var(--highlight-color)' : 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            transition: 'all 0.3s'
                        }}
                    >
                        <i className={tab.icon} style={{ marginRight: '8px' }}></i>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '50px' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto' }}></div>
                </div>
            ) : (() => {
                const tabData = {
                    posts,
                    replies: repliesPosts,
                    media: mediaPosts,
                    likes: likedPosts
                };
                const visible = tabData[activeTab] || [];

                if (visible.length === 0) {
                    const emptyMessages = {
                        posts: { icon: 'fas fa-file-alt', text: 'No posts yet. Share your first post!' },
                        replies: { icon: 'fas fa-reply', text: 'No replies yet.' },
                        media: { icon: 'fas fa-image', text: 'No media posts yet.' },
                        likes: { icon: 'fas fa-heart', text: 'No liked posts yet.' }
                    };
                    const msg = emptyMessages[activeTab] || emptyMessages.posts;
                    return (
                        <div style={{ textAlign: 'center', padding: '50px', color: 'var(--highlight-color)' }}>
                            <i className={msg.icon} style={{ fontSize: '50px', marginBottom: '15px' }}></i>
                            <p>{msg.text}</p>
                        </div>
                    );
                }

                return visible.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        currentUser={user}
                    />
                ));
            })()}
        </div>
    );
};

export default ProfilePage;