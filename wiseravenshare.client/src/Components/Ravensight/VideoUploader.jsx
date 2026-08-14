import React, { useState, useRef } from 'react';
import { FaUpload, FaYoutube, FaFileVideo, FaTrash, FaCheck, FaSpinner } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';
import { upsertLocalVideo, buildLocalFallbackVideo } from '../../Services/ravensightVideoStore';

const CHANNEL_CHOICES = [
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'facebook', label: 'Facebook' }
];

const QUEUE_STATUS_LABELS = {
    scheduled: 'Scheduled',
    ready: 'Ready to publish',
    publishing: 'Publishing',
    published: 'Published',
    failed: 'Failed'
};

const QUEUE_STATUS_STYLES = {
    scheduled: { background: 'rgba(79, 116, 214, 0.18)', color: '#c5d7ff' },
    ready: { background: 'rgba(255, 193, 7, 0.16)', color: '#ffe38d' },
    publishing: { background: 'rgba(33, 150, 243, 0.16)', color: '#9dd0ff' },
    published: { background: 'rgba(76, 175, 80, 0.16)', color: '#a9e7a6' },
    failed: { background: 'rgba(244, 67, 54, 0.16)', color: '#ffb0aa' }
};

const VideoUploader = ({ onNotification, canDirectUpload = true, subscriptionPriceMonthly = 9.99 }) => {
    const defaultDestinationFolder = '/wiseravenshare/ravensight/video';
    const queueStorageKey = 'wiseRavensightPublishingQueue';
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [publishingQueue, setPublishingQueue] = useState([]);
    const [videoDetails, setVideoDetails] = useState({
        title: '',
        description: '',
        tags: [],
        category: '22',
        privacyStatus: 'unlisted',
        publishToYouTube: true,
        publishToTikTok: false,
        publishToFacebook: false,
        youTubeChannelOrEmail: '',
        tikTokUsername: '',
        facebookPageOrProfile: '',
        youTubePermissionGranted: false,
        tikTokPermissionGranted: false,
        facebookPermissionGranted: false,
        scheduledPublish: null
    });
    const [tagInput, setTagInput] = useState('');
    const [savePermanently, setSavePermanently] = useState(false);
    const [uploadedVideos, setUploadedVideos] = useState([]);
    const fileInputRef = useRef(null);
    const { user } = useAuth();

    const getSelectedChannels = () => {
        const channels = [];

        if (videoDetails.publishToYouTube) channels.push('youtube');
        if (videoDetails.publishToTikTok) channels.push('tiktok');
        if (videoDetails.publishToFacebook) channels.push('facebook');

        return channels.length > 0 ? channels : ['youtube'];
    };

    const deriveQueueStatus = (item) => {
        if (item.status && item.status !== 'scheduled') {
            return item.status;
        }

        const scheduledTime = item.scheduledFor ? new Date(item.scheduledFor).getTime() : 0;
        if (!scheduledTime || Number.isNaN(scheduledTime)) {
            return 'scheduled';
        }

        const minutesUntilPublish = Math.round((scheduledTime - Date.now()) / 60000);
        if (minutesUntilPublish <= 0) {
            return 'ready';
        }

        if (minutesUntilPublish <= 10) {
            return 'publishing';
        }

        return 'scheduled';
    };

    const enrichQueueItems = (items) => items.map((item) => ({
        ...item,
        channels: Array.isArray(item.channels) && item.channels.length > 0 ? item.channels : ['youtube'],
        status: deriveQueueStatus(item)
    }));

    const readPublishingQueue = () => {
        try {
            const raw = localStorage.getItem(queueStorageKey);
            return enrichQueueItems(raw ? JSON.parse(raw) : []);
        } catch {
            return [];
        }
    };

    const persistPublishingQueue = (nextQueue) => {
        const enrichedQueue = enrichQueueItems(nextQueue);
        setPublishingQueue(enrichedQueue);
        localStorage.setItem(queueStorageKey, JSON.stringify(enrichedQueue));
    };

    React.useEffect(() => {
        setPublishingQueue(readPublishingQueue());
    }, []);

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('video/')) {
            setSelectedFile(file);
            setVideoDetails(prev => ({
                ...prev,
                title: file.name.replace(/\.[^/.]+$/, '')
            }));
        } else {
            onNotification('Please select a valid video file', 'error');
        }
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !videoDetails.tags.includes(tagInput.trim())) {
            setVideoDetails(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag) => {
        setVideoDetails(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    const uploadVideo = async ({ libraryOnly = false, destinationFolder = '' } = {}) => {
        if (!selectedFile) {
            onNotification('Please select a video file first', 'error');
            return;
        }

        if (!videoDetails.title.trim()) {
            onNotification('Please enter a video title', 'error');
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('video', selectedFile);
        formData.append('file', selectedFile);
        formData.append('title', videoDetails.title);
        formData.append('description', videoDetails.description);
        formData.append('tags', JSON.stringify(videoDetails.tags));
        formData.append('category', videoDetails.category);
        formData.append('privacyStatus', videoDetails.privacyStatus);
        formData.append('publishToYouTube', String(!libraryOnly && videoDetails.publishToYouTube));
        formData.append('publishToTikTok', String(!libraryOnly && videoDetails.publishToTikTok));
        formData.append('publishToFacebook', String(!libraryOnly && videoDetails.publishToFacebook));
        formData.append('youTubeChannelOrEmail', libraryOnly ? '' : (videoDetails.youTubeChannelOrEmail || ''));
        formData.append('tikTokUsername', libraryOnly ? '' : (videoDetails.tikTokUsername || ''));
        formData.append('facebookPageOrProfile', libraryOnly ? '' : (videoDetails.facebookPageOrProfile || ''));
        formData.append('youTubePermissionGranted', String(!libraryOnly && videoDetails.youTubePermissionGranted));
        formData.append('tikTokPermissionGranted', String(!libraryOnly && videoDetails.tikTokPermissionGranted));
        formData.append('facebookPermissionGranted', String(!libraryOnly && videoDetails.facebookPermissionGranted));
        const wantsPermanentStorage = libraryOnly || Boolean(savePermanently);
        formData.append('destinationFolder', String(destinationFolder || defaultDestinationFolder));
        formData.append('storageMode', wantsPermanentStorage ? 'permanent' : 'temporary');
        formData.append('isPermanent', String(wantsPermanentStorage));
        if (videoDetails.scheduledPublish) {
            formData.append('scheduledPublish', videoDetails.scheduledPublish);
        }

        try {
            const response = await ravensightAPI.uploadVideo(formData, (progress) => {
                setUploadProgress(progress);
            });

            setUploadedVideos(prev => [response.video, ...prev]);
            if (response?.video) {
                upsertLocalVideo({
                    ...response.video,
                    userId: user?.id,
                    channelName: response.video.channelName || user?.name || 'WiseRaven Creator',
                    channelAvatar: response.video.channelAvatar || user?.avatar
                });
            }
            onNotification(libraryOnly ? 'Video saved to library!' : 'Video uploaded successfully!', 'success');
            resetForm();
        } catch (error) {
            console.error('Upload error:', error);
            const fallbackVideo = buildLocalFallbackVideo({
                file: selectedFile,
                user,
                title: videoDetails.title,
                description: videoDetails.description,
                privacyStatus: videoDetails.privacyStatus,
                storageMode: (libraryOnly || savePermanently) ? 'permanent' : 'temporary'
            });

            upsertLocalVideo(fallbackVideo);
            setUploadedVideos(prev => [fallbackVideo, ...prev]);
            onNotification(libraryOnly ? 'Your video is still visible in your current session while the service is temporarily unavailable.' : 'Your video is still visible in your current session while the service is temporarily unavailable.', 'warning');
            resetForm();
        } finally {
            setIsUploading(false);
        }
    };

    const handleUpload = () => uploadVideo({ libraryOnly: false });
    const handleSaveToLibrary = () => {
        uploadVideo({ libraryOnly: true, destinationFolder: defaultDestinationFolder });
    };

    const handleQueueForPublishing = () => {
        if (!selectedFile || !videoDetails.title.trim()) {
            onNotification('Please select a video and add a title first.', 'error');
            return;
        }

        if (!videoDetails.scheduledPublish) {
            onNotification('Choose a scheduled time for this publishing queue item.', 'error');
            return;
        }

        const scheduledItem = {
            id: `scheduled-${Date.now()}`,
            title: videoDetails.title.trim(),
            description: videoDetails.description.trim(),
            channel: videoDetails.publishToYouTube ? 'YouTube' : (videoDetails.publishToTikTok ? 'TikTok' : 'Ravensight'),
            channels: getSelectedChannels(),
            scheduledFor: videoDetails.scheduledPublish,
            createdAt: new Date().toISOString(),
            status: 'scheduled'
        };

        const nextQueue = [scheduledItem, ...readPublishingQueue()].slice(0, 12);
        persistPublishingQueue(nextQueue);
        resetForm();
        onNotification('Video queued for scheduled publishing.', 'success');
    };

    const removeQueueItem = (queueId) => {
        const nextQueue = readPublishingQueue().filter(item => item.id !== queueId);
        persistPublishingQueue(nextQueue);
    };

    const updateQueueItemStatus = (queueId, status) => {
        const nextQueue = readPublishingQueue().map((item) => (
            item.id === queueId ? { ...item, status, updatedAt: new Date().toISOString() } : item
        ));

        persistPublishingQueue(nextQueue);
    };

    const summarizeQueue = () => {
        const queue = readPublishingQueue();
        return queue.reduce((summary, item) => {
            summary[item.status] = (summary[item.status] || 0) + 1;
            return summary;
        }, { scheduled: 0, ready: 0, publishing: 0, published: 0, failed: 0 });
    };

    const resetForm = () => {
        setSelectedFile(null);
        setVideoDetails({
            title: '',
            description: '',
            tags: [],
            category: '22',
            privacyStatus: 'unlisted',
            publishToYouTube: true,
            publishToTikTok: false,
            publishToFacebook: false,
            youTubeChannelOrEmail: '',
            tikTokUsername: '',
            facebookPageOrProfile: '',
            youTubePermissionGranted: false,
            tikTokPermissionGranted: false,
            facebookPermissionGranted: false,
            scheduledPublish: null
        });
        setSavePermanently(false);
        setUploadProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const categories = [
        { id: '1', name: 'Film & Animation' },
        { id: '2', name: 'Autos & Vehicles' },
        { id: '10', name: 'Music' },
        { id: '15', name: 'Pets & Animals' },
        { id: '17', name: 'Sports' },
        { id: '18', name: 'Short Movies' },
        { id: '19', name: 'Travel & Events' },
        { id: '20', name: 'Gaming' },
        { id: '21', name: 'Videoblogging' },
        { id: '22', name: 'People & Blogs' },
        { id: '23', name: 'Comedy' },
        { id: '24', name: 'Entertainment' },
        { id: '25', name: 'News & Politics' },
        { id: '26', name: 'Howto & Style' },
        { id: '27', name: 'Education' },
        { id: '28', name: 'Science & Technology' }
    ];

    return (
        <div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px'
            }}>
                {/* Upload Area */}
                <div>
                    <div style={{
                        border: `2px dashed ${selectedFile ? 'var(--success-color)' : 'var(--border-color)'}`,
                        borderRadius: '12px',
                        padding: '40px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'rgba(255, 255, 255, 0.02)',
                        transition: 'all 0.3s'
                    }}
                        onClick={() => fileInputRef.current?.click()}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />

                        {selectedFile ? (
                            <>
                                <FaFileVideo style={{ fontSize: '48px', color: 'var(--success-color)', marginBottom: '15px' }} />
                                <h4>{selectedFile.name}</h4>
                                <p style={{ color: 'var(--highlight-color)' }}>
                                    {formatFileSize(selectedFile.size)}
                                </p>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        resetForm();
                                    }}
                                    style={{
                                        marginTop: '10px',
                                        padding: '5px 15px',
                                        borderRadius: '20px',
                                        border: 'none',
                                        background: '#f44336',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FaTrash /> Remove
                                </button>
                            </>
                        ) : (
                            <>
                                <FaUpload style={{ fontSize: '48px', color: 'var(--highlight-color)', marginBottom: '15px' }} />
                                <h3>Select Video File</h3>
                                <p style={{ color: 'var(--highlight-color)' }}>
                                    Click to browse or drag and drop
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--highlight-color)', marginTop: '10px' }}>
                                    Supported formats: MP4, MOV, AVI, WEBM
                                </p>
                            </>
                        )}
                    </div>

                    {isUploading && (
                        <div style={{ marginTop: '20px' }}>
                            <div style={{
                                height: '6px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '3px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${uploadProgress}%`,
                                    height: '100%',
                                    background: 'linear-gradient(90deg, var(--highlight-color), var(--accent-color))',
                                    transition: 'width 0.3s'
                                }}></div>
                            </div>
                            <div style={{ textAlign: 'center', marginTop: '10px' }}>
                                Uploading... {uploadProgress}%
                            </div>
                        </div>
                    )}
                </div>

                {/* Video Details Form */}
                <div>
                    <div style={{
                        background: 'var(--secondary-color)',
                        borderRadius: '12px',
                        padding: '20px'
                    }}>
                        <h3 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FaYoutube /> Video Details
                        </h3>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                Title *
                            </label>
                            <input
                                type="text"
                                value={videoDetails.title}
                                onChange={(e) => setVideoDetails(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Enter video title"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg)',
                                    color: 'var(--text-color)'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                Description
                            </label>
                            <textarea
                                value={videoDetails.description}
                                onChange={(e) => setVideoDetails(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Enter video description"
                                rows="4"
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg)',
                                    color: 'var(--text-color)',
                                    resize: 'vertical'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                Tags
                            </label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddTag();
                                        }
                                    }}
                                    placeholder="Add tags (press Enter)"
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <button
                                    onClick={handleAddTag}
                                    style={{
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--highlight-color)',
                                        color: 'white',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Add
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                {videoDetails.tags.map(tag => (
                                    <span
                                        key={tag}
                                        style={{
                                            background: 'rgba(79, 116, 214, 0.2)',
                                            padding: '4px 10px',
                                            borderRadius: '15px',
                                            fontSize: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        #{tag}
                                        <button
                                            onClick={() => handleRemoveTag(tag)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'var(--text-color)'
                                            }}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                Category
                            </label>
                            <select
                                value={videoDetails.category}
                                onChange={(e) => setVideoDetails(prev => ({ ...prev, category: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg)',
                                    color: 'var(--text-color)'
                                }}
                            >
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={savePermanently}
                                    onChange={(e) => setSavePermanently(e.target.checked)}
                                />
                                Keep this video in permanent storage
                            </label>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                Privacy Status
                            </label>
                            <select
                                value={videoDetails.privacyStatus}
                                onChange={(e) => setVideoDetails(prev => ({ ...prev, privacyStatus: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--card-bg)',
                                    color: 'var(--text-color)'
                                }}
                            >
                                <option value="public">Public - Everyone can view</option>
                                <option value="unlisted">Unlisted - Only people with link</option>
                                <option value="private">Private - Only you</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={videoDetails.publishToYouTube}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, publishToYouTube: e.target.checked }))}
                                />
                                Publish directly to YouTube
                            </label>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={videoDetails.publishToTikTok}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, publishToTikTok: e.target.checked }))}
                                />
                                Publish directly to TikTok
                            </label>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={videoDetails.publishToFacebook}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, publishToFacebook: e.target.checked }))}
                                />
                                Publish directly to Facebook
                            </label>
                        </div>

                        {videoDetails.publishToYouTube && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                    YouTube Channel or Account Email
                                </label>
                                <input
                                    type="text"
                                    value={videoDetails.youTubeChannelOrEmail}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, youTubeChannelOrEmail: e.target.value }))}
                                    placeholder="Channel name or Google account email"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={videoDetails.youTubePermissionGranted}
                                        onChange={(e) => setVideoDetails(prev => ({ ...prev, youTubePermissionGranted: e.target.checked }))}
                                    />
                                    I authorize Ravensight to upload this video to my YouTube account.
                                </label>
                            </div>
                        )}

                        {videoDetails.publishToTikTok && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                    TikTok Username
                                </label>
                                <input
                                    type="text"
                                    value={videoDetails.tikTokUsername}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, tikTokUsername: e.target.value }))}
                                    placeholder="Username without @"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={videoDetails.tikTokPermissionGranted}
                                        onChange={(e) => setVideoDetails(prev => ({ ...prev, tikTokPermissionGranted: e.target.checked }))}
                                    />
                                    I authorize Ravensight to upload this video to my TikTok account.
                                </label>
                            </div>
                        )}

                        {videoDetails.publishToFacebook && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                    Facebook Page or Profile
                                </label>
                                <input
                                    type="text"
                                    value={videoDetails.facebookPageOrProfile}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, facebookPageOrProfile: e.target.value }))}
                                    placeholder="Page name or profile handle"
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '8px' }}>
                                    <input
                                        type="checkbox"
                                        checked={videoDetails.facebookPermissionGranted}
                                        onChange={(e) => setVideoDetails(prev => ({ ...prev, facebookPermissionGranted: e.target.checked }))}
                                    />
                                    I authorize Ravensight to upload this video to my Facebook account.
                                </label>
                            </div>
                        )}

                        {videoDetails.publishToYouTube && (
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                    Schedule Publish (Optional)
                                </label>
                                <input
                                    type="datetime-local"
                                    value={videoDetails.scheduledPublish || ''}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, scheduledPublish: e.target.value }))}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button
                                onClick={handleSaveToLibrary}
                                disabled={!selectedFile || isUploading}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '30px',
                                    border: '1px solid var(--border-color)',
                                    background: !selectedFile || isUploading ? 'var(--accent-color)' : 'var(--secondary-color)',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: !selectedFile || isUploading ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isUploading ? <FaSpinner className="spinning" /> : <FaCheck />}
                                {isUploading ? 'Saving...' : 'Save to Library'}
                            </button>

                            <button
                                onClick={handleUpload}
                                disabled={!selectedFile || isUploading}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '30px',
                                    border: 'none',
                                    background: !selectedFile || isUploading ? 'var(--accent-color)' : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                    color: 'white',
                                    fontWeight: 'bold',
                                    cursor: !selectedFile || isUploading ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px'
                                }}
                            >
                                {isUploading ? <FaSpinner className="spinning" /> : <FaUpload />}
                                {isUploading ? 'Uploading...' : 'Upload to Socials'}
                            </button>
                        </div>

                        <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleQueueForPublishing}
                                disabled={!selectedFile || !videoDetails.scheduledPublish || isUploading}
                                style={{
                                    flex: 1,
                                    padding: '12px',
                                    borderRadius: '30px',
                                    border: '1px solid var(--border-color)',
                                    background: !selectedFile || !videoDetails.scheduledPublish || isUploading ? 'rgba(255,255,255,0.04)' : 'rgba(79, 116, 214, 0.18)',
                                    color: 'var(--text-color)',
                                    fontWeight: 'bold',
                                    cursor: !selectedFile || !videoDetails.scheduledPublish || isUploading ? 'not-allowed' : 'pointer'
                                }}
                            >
                                Queue for Publishing
                            </button>
                        </div>

                        <div style={{ marginTop: '16px', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)' }}>
                            <div style={{ fontWeight: 700, marginBottom: '10px' }}>Publishing targets</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {CHANNEL_CHOICES.map((channel) => {
                                    const selected = getSelectedChannels().includes(channel.id);
                                    return (
                                        <span
                                            key={channel.id}
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: '999px',
                                                border: '1px solid var(--border-color)',
                                                background: selected ? 'rgba(79, 116, 214, 0.18)' : 'rgba(255,255,255,0.03)',
                                                color: selected ? '#dfe9ff' : 'var(--light-color)',
                                                fontSize: '12px'
                                            }}
                                        >
                                            {channel.label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '26px', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '18px', background: 'var(--secondary-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0 }}>Publishing Queue</h3>
                    {publishingQueue.length > 0 && (
                        <button
                            onClick={() => persistPublishingQueue([])}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-color)',
                                borderRadius: '999px',
                                padding: '6px 10px',
                                cursor: 'pointer'
                            }}
                        >
                            Clear queue
                        </button>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                    {Object.entries(summarizeQueue()).map(([status, count]) => (
                        <div key={status} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>{QUEUE_STATUS_LABELS[status]}</div>
                            <div style={{ fontSize: '24px', fontWeight: 800 }}>{count}</div>
                        </div>
                    ))}
                </div>

                {publishingQueue.length === 0 ? (
                    <div style={{ color: 'var(--light-color)' }}>
                        No scheduled posts yet. Add a planned publish time to queue a video for later delivery.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {publishingQueue.map((item) => (
                            <div key={item.id} style={{
                                background: 'var(--card-bg)',
                                borderRadius: '10px',
                                padding: '12px 14px',
                                border: '1px solid var(--border-color)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 700, marginBottom: '4px' }}>{item.title}</div>
                                    <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>
                                        {item.channels.join(', ')} • {new Date(item.scheduledFor).toLocaleString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        borderRadius: '999px',
                                        padding: '5px 9px',
                                        ...QUEUE_STATUS_STYLES[item.status],
                                        fontSize: '11px',
                                        fontWeight: 700
                                    }}>
                                        {QUEUE_STATUS_LABELS[item.status] || item.status}
                                    </span>
                                    {item.status === 'scheduled' && (
                                        <button
                                            onClick={() => updateQueueItemStatus(item.id, 'ready')}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '5px 8px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Mark ready
                                        </button>
                                    )}
                                    {item.status === 'ready' && (
                                        <button
                                            onClick={() => updateQueueItemStatus(item.id, 'published')}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '5px 8px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Complete
                                        </button>
                                    )}
                                    {item.status === 'failed' && (
                                        <button
                                            onClick={() => updateQueueItemStatus(item.id, 'scheduled')}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '5px 8px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Retry
                                        </button>
                                    )}
                                    <button
                                        onClick={() => removeQueueItem(item.id)}
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '5px 8px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Recently Uploaded */}
            {uploadedVideos.length > 0 && (
                <div style={{ marginTop: '30px' }}>
                    <h3 style={{ marginBottom: '15px' }}>Recently Uploaded</h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '15px'
                    }}>
                        {uploadedVideos.slice(0, 4).map(video => (
                            <div
                                key={video.id}
                                style={{
                                    background: 'var(--secondary-color)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    cursor: 'pointer'
                                }}
                                onClick={() => window.open(video.youtubeUrl || video.tiktokUrl || video.facebookUrl || video.videoUrl, '_blank')}
                            >
                                <img
                                    src={video.thumbnailUrl}
                                    alt={video.title}
                                    style={{
                                        width: '100%',
                                        height: '120px',
                                        objectFit: 'cover'
                                    }}
                                />
                                <div style={{ padding: '10px' }}>
                                    <div style={{
                                        fontSize: '14px',
                                        fontWeight: 'bold',
                                        marginBottom: '5px',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden'
                                    }}>
                                        {video.title}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>
                                        {new Date(video.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spinning {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default VideoUploader;