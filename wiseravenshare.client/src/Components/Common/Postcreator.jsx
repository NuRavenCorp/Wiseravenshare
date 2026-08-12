import React, { useState } from 'react';
import { truthEngine } from '../../Services/TruthDetectionEngine';
import { apiService } from '../../Services/api';
import { appendStoredFeedPost, normalizeFeedPost } from '../../Services/postFeedPayload';
import {
    getRavensightLocalSaveRootPreference,
    saveFileToRavensightFolder,
    setRavensightLocalSaveRootPreference
} from '../../utils/ravensightLocalSave';

const RAVENSIGHT_DESTINATION_BY_MEDIA_TYPE = {
    video: '/wiseravenshare/ravensight/video',
    photo: '/wiseravenshare/ravensight/photo',
    audio: '/wiseravenshare/ravensight/music'
};

const resolveRavensightDestination = (type) => RAVENSIGHT_DESTINATION_BY_MEDIA_TYPE[type] || '/wiseravenshare/ravensight/video';

const PostCreator = ({ onPostCreate, addTruthAlert, currentUser }) => {
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
    const [destinationFolder, setDestinationFolder] = useState(resolveRavensightDestination('video'));
    const [localSaveRoot, setLocalSaveRoot] = useState(getRavensightLocalSaveRootPreference());
    const canPublishVideo = mediaType === 'video' || Boolean(mediaFile?.type?.startsWith('video/'));

    const user = currentUser || { name: 'Alex Raven', avatar: 'AR', handle: '@alexraven' };

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
            const selected = e.target.files?.[0];
            if (!selected) return;

            setMediaFile(selected);

            // Trust the browser-reported MIME first so upload toggles are accurate.
            if (selected.type?.startsWith('video/')) {
                setMediaType('video');
                setDestinationFolder(resolveRavensightDestination('video'));
                try {
                    const pickedDestination = window.prompt(
                        'Choose destination folder for this video upload:',
                        resolveRavensightDestination('video')
                    );

                    if (typeof pickedDestination === 'string' && pickedDestination.trim().length > 0) {
                        setDestinationFolder(pickedDestination.trim());
                    }
                } catch {
                    // Ignore prompt failures in restricted runtimes.
                }
            } else if (selected.type?.startsWith('image/')) {
                setMediaType('photo');
                setDestinationFolder(resolveRavensightDestination('photo'));
            } else if (selected.type?.startsWith('audio/')) {
                setMediaType('audio');
                setDestinationFolder(resolveRavensightDestination('audio'));
            } else {
                setMediaType(type);
                setDestinationFolder(resolveRavensightDestination(type));
            }
        };
        input.click();
    };

    const normalizeUploadedMedia = (uploadResponse) => {
        const payload = uploadResponse?.data || uploadResponse || {};
        const resolvedMediaUrl = payload?.mediaUrl
            || payload?.filePath
            || payload?.file?.mediaUrl
            || payload?.file?.MediaUrl
            || payload?.video?.mediaUrl
            || payload?.video?.MediaUrl
            || payload?.video?.videoUrl
            || payload?.video?.VideoUrl
            || payload?.video?.video_url
            || null;

        const fileName = payload?.fileName
            || payload?.file?.fileName
            || payload?.file?.FileName
            || payload?.file?.file_name
            || null;

        const normalizedMediaUrl = resolvedMediaUrl || (fileName
            ? `${window.location.origin}/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`
            : null);

        return {
            mediaUrl: normalizedMediaUrl,
            youtubeUrl: payload?.youtubeUrl || payload?.file?.youtubeUrl || payload?.video?.youtubeUrl || null,
            tiktokUrl: payload?.tiktokUrl || payload?.file?.tiktokUrl || payload?.video?.tiktokUrl || null,
            facebookUrl: payload?.facebookUrl || payload?.file?.facebookUrl || payload?.video?.facebookUrl || null
        };
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            addTruthAlert('warning', 'Please add text content to publish your post.', null);
            return;
        }

        try {
            const moderationResponse = await apiService.checkModeration(content || '');
            const moderation = moderationResponse?.data;

            if (moderation && moderation.allowed === false) {
                const reason = Array.isArray(moderation.reasons) && moderation.reasons.length > 0
                    ? ` ${moderation.reasons[0]}`
                    : '';
                addTruthAlert('warning', `Post blocked by anti-spam checks.${reason}`, null);
                return;
            }

            if (moderation && moderation.flagged) {
                addTruthAlert('info', 'This post may look spammy. Consider editing before publishing.', null);
            }
        } catch {
            // Keep posting flow available if moderation endpoint is unavailable.
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
                    destinationFolder,
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

                const normalizedMedia = normalizeUploadedMedia(uploadResponse);

                if (normalizedMedia.mediaUrl) {
                    uploadedMediaUrl = normalizedMedia.mediaUrl;
                }

                if (normalizedMedia.youtubeUrl) {
                    uploadedYoutubeUrl = normalizedMedia.youtubeUrl;
                }

                if (normalizedMedia.tiktokUrl) {
                    uploadedTikTokUrl = normalizedMedia.tiktokUrl;
                }

                if (normalizedMedia.facebookUrl) {
                    uploadedFacebookUrl = normalizedMedia.facebookUrl;
                }
            } catch (error) {
                const status = error?.response?.status;
                const serverMessage = error?.response?.data?.message || error?.response?.data;
                const normalizedServerMessage = typeof serverMessage === 'string' ? serverMessage.trim() : '';

                let uploadMessage = 'Media upload endpoint unreachable, using local preview instead.';

                if (status === 401 || status === 403) {
                    uploadMessage = 'Media upload requires an active login. Using local preview instead.';
                } else if (status === 400 && normalizedServerMessage) {
                    uploadMessage = `${normalizedServerMessage} Using local preview instead.`;
                } else if (normalizedServerMessage) {
                    uploadMessage = `${normalizedServerMessage} Using local preview instead.`;
                }

                addTruthAlert('warning', uploadMessage, null);
            }
        }

        const payload = {
            content: content,
            type: mediaType === 'video' ? 'Video' : mediaType === 'photo' ? 'Image' : mediaType === 'audio' ? 'Audio' : 'Text',
            mediaUrl: uploadedMediaUrl || null,
            mediaUrls: uploadedMediaUrl ? [uploadedMediaUrl] : null,
            youtubeUrl: uploadedYoutubeUrl,
            tiktokUrl: uploadedTikTokUrl,
            facebookUrl: uploadedFacebookUrl,
            isSensitive: false
        };

        setTimeout(async () => {
            try {
                const createResponse = await apiService.createPost(payload);
                const createdPost = {
                    ...(createResponse?.data || createResponse || {}),
                    id: createResponse?.data?.id || createResponse?.id,
                    mediaUrl: createResponse?.data?.mediaUrl || createResponse?.mediaUrl || uploadedMediaUrl,
                    mediaUrls: createResponse?.data?.mediaUrls || createResponse?.mediaUrls || (uploadedMediaUrl ? [uploadedMediaUrl] : []),
                    youtubeUrl: createResponse?.data?.youtubeUrl || createResponse?.youtubeUrl || uploadedYoutubeUrl,
                    tiktokUrl: createResponse?.data?.tiktokUrl || createResponse?.tiktokUrl || uploadedTikTokUrl,
                    facebookUrl: createResponse?.data?.facebookUrl || createResponse?.facebookUrl || uploadedFacebookUrl
                };
                if (!createdPost?.id) {
                    throw new Error('Post API did not return a created post.');
                }

                apiService.trackGrowthEvent('first_post_created').catch(() => null);
                onPostCreate(createdPost);
            } catch (error) {
                const status = error?.response?.status;
                const serverMessage = error?.response?.data?.message || error?.message;
                let saveMessage = 'Failed to save post to server. Please try again.';

                if (status === 401 || status === 403) {
                    saveMessage = 'Your session expired. Please sign in again and retry posting.';
                } else if (status === 400 && serverMessage) {
                    saveMessage = `Unable to publish post: ${serverMessage}`;
                } else if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
                    saveMessage = serverMessage.trim();
                }

                const fallbackPost = normalizeFeedPost({
                    id: `local-post-${Date.now()}`,
                    content,
                    type: payload.type,
                    mediaUrl: uploadedMediaUrl || null,
                    mediaUrls: uploadedMediaUrl ? [uploadedMediaUrl] : [],
                    youtubeUrl: uploadedYoutubeUrl,
                    tiktokUrl: uploadedTikTokUrl,
                    facebookUrl: uploadedFacebookUrl,
                    createdAt: new Date().toISOString(),
                    user: { id: currentUser?.id || 'local-user', name: currentUser?.name || 'You', username: currentUser?.username || 'you', handle: currentUser?.handle || '@you', avatar: currentUser?.avatar || 'Y' },
                    likesCount: 0,
                    repostsCount: 0,
                    commentsCount: 0,
                    sharesCount: 0,
                    bookmarksCount: 0,
                    viewsCount: 0,
                    truthScore: truthScore ?? 70
                }, currentUser);

                appendStoredFeedPost(fallbackPost, currentUser);
                onPostCreate(fallbackPost);
                addTruthAlert('warning', 'Your post is still visible in the feed while the service is temporarily unavailable.', null);
                setIsUploading(false);
                return;
            }

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
            setDestinationFolder(resolveRavensightDestination('video'));
            setUploadProgress(0);
            setIsUploading(false);

            if (truthScore < 70) {
                addTruthAlert('warning', `Your post has a truth score of ${truthScore}%. Consider verifying your claims.`, null);
            } else {
                addTruthAlert('success', `Post published! Truth score: ${truthScore}%`, null);
            }
        }, 1000);
    };

    const handleSaveMediaToComputer = async () => {
        if (!mediaFile) {
            addTruthAlert('warning', 'No media selected to save.', null);
            return;
        }

        const resolvedType = mediaType || (mediaFile.type?.startsWith('video/')
            ? 'video'
            : mediaFile.type?.startsWith('image/')
                ? 'photo'
                : mediaFile.type?.startsWith('audio/')
                    ? 'audio'
                    : 'photo');

        const result = await saveFileToRavensightFolder(mediaFile, mediaFile.name || `ravensight_${Date.now()}`, resolvedType, localSaveRoot);
        if (!result.ok) {
            addTruthAlert('warning', 'Could not save this file to your computer.', null);
            return;
        }

        if (result.mode === 'directory') {
            const rootLabel = result.startIn === 'videos' ? 'Videos' : 'Pictures';
            addTruthAlert('success', `Saved to ${rootLabel}/Ravensight`, null);
            return;
        }

        addTruthAlert('success', 'Saved to computer', null);
    };

    const handleLocalSaveRootChange = (value) => {
        setLocalSaveRoot(value);
        setRavensightLocalSaveRootPreference(value);
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
                    disabled={!canPublishVideo}
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
                    disabled={!canPublishVideo}
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
                    disabled={!canPublishVideo}
                    onChange={(e) => setPublishToFacebook(e.target.checked)}
                />
                <label htmlFor="facebook" style={{ cursor: 'pointer' }}>
                    📘 Publish video to Facebook via Ravensight
                </label>
            </div>
            {publishToYouTube && canPublishVideo && (
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
            {publishToTikTok && canPublishVideo && (
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
            {publishToFacebook && canPublishVideo && (
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
            {!canPublishVideo && (
                <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginTop: '-6px' }}>
                    Select a video file to enable YouTube, TikTok, or Facebook publishing.
                </div>
            )}

            <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                    Local Save Folder
                </label>
                <select
                    value={localSaveRoot}
                    onChange={(e) => handleLocalSaveRootChange(e.target.value)}
                    style={{
                        width: '100%',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-color)'
                    }}
                >
                    <option value="auto">Auto (Video to Videos, Photo/Music to Pictures)</option>
                    <option value="videos">Always Videos</option>
                    <option value="pictures">Always Pictures</option>
                </select>
            </div>

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={handleSaveMediaToComputer}
                            type="button"
                            style={{
                                background: 'none',
                                border: '1px solid var(--border-color)',
                                borderRadius: '999px',
                                color: 'var(--light-color)',
                                padding: '4px 12px',
                                cursor: 'pointer'
                            }}
                        >
                            Save to Computer
                        </button>
                        <button onClick={() => {
                            setMediaFile(null);
                            setMediaType(null);
                            setPublishToYouTube(false);
                            setPublishToTikTok(false);
                            setPublishToFacebook(false);
                            setYouTubePermissionGranted(false);
                            setTikTokPermissionGranted(false);
                            setFacebookPermissionGranted(false);
                        }} style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--error-color)',
                            cursor: 'pointer'
                        }}>Remove</button>
                    </div>
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