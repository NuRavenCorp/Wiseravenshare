import React, { useState } from 'react';
import { truthEngine } from '../../Services/TruthDetectionEngine';
import { apiService } from '../../Services/api';

const PostCreator = ({ onPostCreate, addTruthAlert }) => {
    const [content, setContent] = useState('');
    const [mediaFile, setMediaFile] = useState(null);
    const [mediaType, setMediaType] = useState(null);
    const [publishToYouTube, setPublishToYouTube] = useState(false);
    const [publishToTikTok, setPublishToTikTok] = useState(false);
    const [publishToFacebook, setPublishToFacebook] = useState(false);
    const [youTubeChannelOrEmail, setYouTubeChannelOrEmail] = useState('');
    const [tikTokUsername, setTikTokUsername] = useState('');
    const [facebookPageOrProfile, setFacebookPageOrProfile] = useState('');
    const [youTubePermissionGranted, setYouTubePermissionGranted] = useState(false);
    const [tikTokPermissionGranted, setTikTokPermissionGranted] = useState(false);
    const [facebookPermissionGranted, setFacebookPermissionGranted] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);

    const user = { name: 'Alex Raven', avatar: 'AR', handle: '@alexraven' };

    const handleFileUpload = (type) => {
        const input = document.createElement('input');
        input.type = 'file';
        setPublishToYouTube(false);
        setPublishToTikTok(false);
        setPublishToFacebook(false);
        setYouTubePermissionGranted(false);
        setTikTokPermissionGranted(false);
        setFacebookPermissionGranted(false);

        switch (type) {
            case 'photo':
                input.accept = 'image/*';
                break;
            case 'video':
                input.accept = 'video/*';
                break;
            case 'audio':
                input.accept = 'audio/*';
                break;
        }

        input.onchange = (e) => {
            if (e.target.files[0]) {
                setMediaFile(e.target.files[0]);
                setMediaType(type);
            }
        };
        input.click();
    };

    const handleSubmit = async () => {
        if (!content.trim() && !mediaFile) {
            addTruthAlert('warning', 'Please add some content or media to your post.', null);
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        // Simulate upload progress
        const interval = setInterval(() => {
            setUploadProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 10;
            });
        }, 200);

        // Analyze content for truth
        const analysis = truthEngine.analyzeContent(content);
        const truthScore = truthEngine.getTruthScore(content);
        let correction = null;

        if (analysis.length > 0 && analysis[0].isTrue === false && analysis[0].confidence > 0.9) {
            correction = analysis[0].correction;
            addTruthAlert('correction', `Truth correction applied to your post.`, correction);
        }

        let uploadedMediaUrl = mediaFile ? URL.createObjectURL(mediaFile) : null;
        let uploadedYoutubeUrl = null;
        let uploadedTikTokUrl = null;
        let uploadedFacebookUrl = null;

        if (mediaFile) {
            try {
                const uploadResponse = await apiService.uploadMedia(mediaFile, mediaType, {
                    title: content.slice(0, 60) || mediaFile.name,
                    description: content,
                    publishToYouTube,
                    publishToTikTok,
                    publishToFacebook,
                    youTubeChannelOrEmail,
                    tikTokUsername,
                    facebookPageOrProfile,
                    youTubePermissionGranted,
                    tikTokPermissionGranted,
                    facebookPermissionGranted
                });

                if (uploadResponse?.data?.filePath) {
                    uploadedMediaUrl = uploadResponse.data.filePath;
                }

                if (uploadResponse?.data?.youtubeUrl) {
                    uploadedYoutubeUrl = uploadResponse.data.youtubeUrl;
                }

                if (uploadResponse?.data?.tiktokUrl) {
                    uploadedTikTokUrl = uploadResponse.data.tiktokUrl;
                }

                if (uploadResponse?.data?.facebookUrl) {
                    uploadedFacebookUrl = uploadResponse.data.facebookUrl;
                }
            } catch (error) {
                addTruthAlert('warning', 'Media upload service unavailable, using local preview instead.', null);
            }
        }

        const newPost = {
            id: Date.now().toString(),
            user: user,
            content: content,
            mediaUrl: uploadedMediaUrl,
            mediaType: mediaType,
            podcastUrl: mediaType === 'audio' ? URL.createObjectURL(mediaFile) : null,
            youtubeUrl: uploadedYoutubeUrl,
            tiktokUrl: uploadedTikTokUrl,
            facebookUrl: uploadedFacebookUrl,
            likes: 0,
            reposts: 0,
            comments: 0,
            createdAt: new Date(),
            correction: correction,
            truthScore: truthScore,
            isLiked: false
        };

        setTimeout(() => {
            onPostCreate(newPost);
            setContent('');
            setMediaFile(null);
            setMediaType(null);
            setPublishToYouTube(false);
            setPublishToTikTok(false);
            setPublishToFacebook(false);
            setYouTubeChannelOrEmail('');
            setTikTokUsername('');
            setFacebookPageOrProfile('');
            setYouTubePermissionGranted(false);
            setTikTokPermissionGranted(false);
            setFacebookPermissionGranted(false);
            setUploadProgress(0);
            setIsUploading(false);

            if (truthScore < 70) {
                addTruthAlert('warning', `Your post has a truth score of ${truthScore}%. Consider verifying your claims.`, null);
            } else {
                addTruthAlert('success', `Post published! Truth score: ${truthScore}%`, null);
            }
        }, 1000);
    };

    return (
        <div style={{
            background: 'var(--card-bg)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '20px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border-color)'
        }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                }}>{user.avatar}</div>
                <textarea
                    placeholder="What wisdom do you share today? (Truth detection active)"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    style={{
                        flex: 1,
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '12px 15px',
                        resize: 'none',
                        minHeight: '60px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-color)',
                        fontFamily: 'inherit'
                    }}
                    rows="3"
                />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', margin: '15px 0' }}>
                {['photo', 'video', 'audio'].map(type => (
                    <button
                        key={type}
                        onClick={() => handleFileUpload(type)}
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '70px',
                            height: '70px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-color)'
                        }}
                    >
                        <i className={`fas fa-${type === 'photo' ? 'image' : type === 'video' ? 'video' : 'music'}`} style={{ fontSize: '24px', marginBottom: '8px' }}></i>
                        <span style={{ fontSize: '0.8rem' }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0' }}>
                <input
                    type="checkbox"
                    id="youtube"
                    checked={publishToYouTube}
                    disabled={mediaType !== 'video'}
                    onChange={(e) => setPublishToYouTube(e.target.checked)}
                />
                <label htmlFor="youtube" style={{ cursor: 'pointer' }}>
                    🎬 Publish video to YouTube via Ravensight
                </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0' }}>
                <input
                    type="checkbox"
                    id="tiktok"
                    checked={publishToTikTok}
                    disabled={mediaType !== 'video'}
                    onChange={(e) => setPublishToTikTok(e.target.checked)}
                />
                <label htmlFor="tiktok" style={{ cursor: 'pointer' }}>
                    🎵 Publish video to TikTok via Ravensight
                </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0' }}>
                <input
                    type="checkbox"
                    id="facebook"
                    checked={publishToFacebook}
                    disabled={mediaType !== 'video'}
                    onChange={(e) => setPublishToFacebook(e.target.checked)}
                />
                <label htmlFor="facebook" style={{ cursor: 'pointer' }}>
                    📘 Publish video to Facebook via Ravensight
                </label>
            </div>
            {publishToYouTube && mediaType === 'video' && (
                <div style={{ marginTop: '8px' }}>
                    <input
                        type="text"
                        value={youTubeChannelOrEmail}
                        onChange={(e) => setYouTubeChannelOrEmail(e.target.value)}
                        placeholder="YouTube channel or Google account email"
                        style={{
                            width: '100%',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={youTubePermissionGranted}
                            onChange={(e) => setYouTubePermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my YouTube account.
                    </label>
                </div>
            )}
            {publishToTikTok && mediaType === 'video' && (
                <div style={{ marginTop: '8px' }}>
                    <input
                        type="text"
                        value={tikTokUsername}
                        onChange={(e) => setTikTokUsername(e.target.value)}
                        placeholder="TikTok username (without @)"
                        style={{
                            width: '100%',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={tikTokPermissionGranted}
                            onChange={(e) => setTikTokPermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my TikTok account.
                    </label>
                </div>
            )}
            {publishToFacebook && mediaType === 'video' && (
                <div style={{ marginTop: '8px' }}>
                    <input
                        type="text"
                        value={facebookPageOrProfile}
                        onChange={(e) => setFacebookPageOrProfile(e.target.value)}
                        placeholder="Facebook page or profile"
                        style={{
                            width: '100%',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-color)'
                        }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12px' }}>
                        <input
                            type="checkbox"
                            checked={facebookPermissionGranted}
                            onChange={(e) => setFacebookPermissionGranted(e.target.checked)}
                        />
                        I authorize Ravensight to upload this video to my Facebook account.
                    </label>
                </div>
            )}
            {mediaType !== 'video' && (
                <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginTop: '-6px' }}>
                    Select a video file to enable YouTube, TikTok, or Facebook publishing.
                </div>
            )}

            {mediaFile && (
                <div style={{
                    marginTop: '15px',
                    padding: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <span>{mediaFile.name}</span>
                    <button onClick={() => setMediaFile(null)} style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--error-color)',
                        cursor: 'pointer'
                    }}>Remove</button>
                </div>
            )}

            {isUploading && (
                <div style={{ margin: '10px 0' }}>
                    <div style={{
                        height: '4px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${uploadProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--highlight-color), var(--light-color))',
                            transition: 'width 0.3s'
                        }}></div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Uploading... {uploadProgress}%</span>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button onClick={handleSubmit} disabled={isUploading} style={{
                    background: 'linear-gradient(135deg, var(--secondary-color), var(--accent-color))',
                    color: 'white',
                    border: 'none',
                    padding: '10px 24px',
                    borderRadius: '20px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease',
                    opacity: isUploading ? 0.7 : 1
                }}>
                    <i className="fas fa-feather-alt"></i> Post
                </button>
            </div>
        </div>
    );
};

export default PostCreator;