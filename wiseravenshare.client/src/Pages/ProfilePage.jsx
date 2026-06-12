import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../Contexts/AuthContext';
import { apiService } from '../Services/api';
import PostCard from '../Components/Feed/PostCard.jsx';
import { useNotification } from '../Contexts/NotificationContext';
import { socialGraphService } from '../Services/SocialGraph';
import WiseRavenLogo from '../Components/Common/WiseRavenLogo';

const ProfilePage = () => {
    const { user, updateProfile } = useAuth();
    const { addToast } = useNotification();
    const [posts, setPosts] = useState([]);
    const [likedPosts, setLikedPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: '',
        bio: '',
        location: '',
        website: '',
        avatar: ''
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
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    useEffect(() => {
        if (user) {
            socialGraphService.registerUserProfile(user);
            loadUserData();
            setEditForm({
                name: user.name || '',
                bio: user.bio || '',
                location: user.location || '',
                website: user.website || '',
                avatar: user.avatar || ''
            });
        }
    }, [user]);

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
            await updateProfile(editForm);
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
            const dataUrl = await readFileAsDataUrl(file);
            setEditForm((prev) => ({ ...prev, avatar: dataUrl }));
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

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) {
            return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setEditForm((prev) => ({ ...prev, avatar: dataUrl }));
        stopCamera();
    };

    const repliesPosts = posts.filter((p) => {
        const comments = Array.isArray(p.comments) ? p.comments : [];
        return comments.some((c) => c?.user?.id === user?.id || c?.userId === user?.id);
    });

    const mediaPosts = posts.filter((p) => p.mediaUrl || p.youtubeUrl || p.tiktokUrl || p.podcastUrl);

    const tabCounts = {
        posts: posts.length,
        replies: repliesPosts.length,
        media: mediaPosts.length,
        likes: likedPosts.length
    };

    const tabs = [
        { id: 'posts', label: `Posts (${tabCounts.posts})`, icon: 'fas fa-file-alt' },
        { id: 'replies', label: `Replies (${tabCounts.replies})`, icon: 'fas fa-reply' },
        { id: 'media', label: `Media (${tabCounts.media})`, icon: 'fas fa-image' },
        { id: 'likes', label: `Likes (${tabCounts.likes})`, icon: 'fas fa-heart' }
    ];

    const isImageAvatar = typeof user?.avatar === 'string' && (user.avatar.startsWith('data:image/') || user.avatar.startsWith('http'));

    if (!user) return null;

    return (
        <div>
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
                            />
                        ) : (
                            user.avatar || user.name?.charAt(0) || 'U'
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
                                    {editForm.avatar && typeof editForm.avatar === 'string' && (editForm.avatar.startsWith('data:image/') || editForm.avatar.startsWith('http')) && (
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
                    display: 'flex',
                    gap: '30px',
                    marginTop: '20px',
                    paddingTop: '20px',
                    borderTop: '1px solid var(--border-color)'
                }}>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{stats.posts}</div>
                        <div style={{ fontSize: '14px', color: 'var(--highlight-color)' }}>Posts</div>
                    </div>
                    <button
                        onClick={() => setAssociationView('followers')}
                        style={{
                            background: associationView === 'followers' ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                    >
                        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{stats.followers}</div>
                        <div style={{ fontSize: '14px', color: 'var(--highlight-color)' }}>Followers</div>
                    </button>
                    <button
                        onClick={() => setAssociationView('following')}
                        style={{
                            background: associationView === 'following' ? 'rgba(255,255,255,0.08)' : 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            padding: '10px 14px',
                            color: 'var(--text-color)',
                            cursor: 'pointer',
                            textAlign: 'left'
                        }}
                    >
                        <div style={{ fontWeight: 'bold', fontSize: '18px' }}>{stats.following}</div>
                        <div style={{ fontSize: '14px', color: 'var(--highlight-color)' }}>Following</div>
                    </button>
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