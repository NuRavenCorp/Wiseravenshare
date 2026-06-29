import React, { useState, useRef } from 'react';
import { FaUpload, FaYoutube, FaFileVideo, FaTrash, FaCheck, FaSpinner } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';

const VideoUploader = ({ onNotification, canDirectUpload = true, subscriptionPriceMonthly = 9.99 }) => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [videoDetails, setVideoDetails] = useState({
        title: '',
        description: '',
        tags: [],
        category: '22',
        privacyStatus: 'unlisted',
        publishToYouTube: true,
        publishToTikTok: false,
        youTubeChannelOrEmail: '',
        tikTokUsername: '',
        youTubePermissionGranted: false,
        tikTokPermissionGranted: false,
        scheduledPublish: null
    });
    const [tagInput, setTagInput] = useState('');
    const [uploadedVideos, setUploadedVideos] = useState([]);
    const fileInputRef = useRef(null);
    const { user } = useAuth();

    const persistLocalVideo = (video) => {
        try {
            const current = JSON.parse(localStorage.getItem('wiseRavensightVideos') || '[]');
            const next = [video, ...current].slice(0, 50);
            localStorage.setItem('wiseRavensightVideos', JSON.stringify(next));
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
        } catch {
            // No-op: local fallback storage should never block upload UX.
        }
    };

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

    const handleUpload = async () => {
        if (!canDirectUpload) {
            onNotification(`Direct video upload requires Creator Pro ($${Number(subscriptionPriceMonthly).toFixed(2)}/month).`, 'warning');
            return;
        }

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
        formData.append('title', videoDetails.title);
        formData.append('description', videoDetails.description);
        formData.append('tags', JSON.stringify(videoDetails.tags));
        formData.append('category', videoDetails.category);
        formData.append('privacyStatus', videoDetails.privacyStatus);
        formData.append('publishToYouTube', String(videoDetails.publishToYouTube));
        formData.append('publishToTikTok', String(videoDetails.publishToTikTok));
        formData.append('youTubeChannelOrEmail', videoDetails.youTubeChannelOrEmail || '');
        formData.append('tikTokUsername', videoDetails.tikTokUsername || '');
        formData.append('youTubePermissionGranted', String(videoDetails.youTubePermissionGranted));
        formData.append('tikTokPermissionGranted', String(videoDetails.tikTokPermissionGranted));
        if (videoDetails.scheduledPublish) {
            formData.append('scheduledPublish', videoDetails.scheduledPublish);
        }

        try {
            const response = await ravensightAPI.uploadVideo(formData, (progress) => {
                setUploadProgress(progress);
            });

            setUploadedVideos(prev => [response.video, ...prev]);
            if (response?.video) {
                persistLocalVideo({
                    ...response.video,
                    userId: user?.id,
                    channelName: response.video.channelName || user?.name || 'WiseRaven Creator',
                    channelAvatar: response.video.channelAvatar || user?.avatar
                });
            }
            onNotification('Video uploaded successfully!', 'success');
            resetForm();
        } catch (error) {
            console.error('Upload error:', error);
            onNotification(error.message || 'Failed to upload video', 'error');
        } finally {
            setIsUploading(false);
        }
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
            youTubeChannelOrEmail: '',
            tikTokUsername: '',
            youTubePermissionGranted: false,
            tikTokPermissionGranted: false,
            scheduledPublish: null
        });
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
                    {!canDirectUpload && (
                        <div style={{
                            marginBottom: '12px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255, 152, 0, 0.12)',
                            padding: '12px'
                        }}>
                            <strong>Subscription required for direct upload.</strong>
                            <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--light-color)' }}>
                                Activate Creator Pro to upload directly to YouTube and TikTok for ${Number(subscriptionPriceMonthly).toFixed(2)}/month.
                            </div>
                        </div>
                    )}

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
                                    disabled={!canDirectUpload}
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
                                    disabled={!canDirectUpload}
                                    onChange={(e) => setVideoDetails(prev => ({ ...prev, publishToTikTok: e.target.checked }))}
                                />
                                Publish directly to TikTok
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

                        <button
                            onClick={handleUpload}
                            disabled={!selectedFile || isUploading || !canDirectUpload}
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '30px',
                                border: 'none',
                                background: !selectedFile || isUploading || !canDirectUpload ? 'var(--accent-color)' : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                color: 'white',
                                fontWeight: 'bold',
                                cursor: !selectedFile || isUploading || !canDirectUpload ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                        >
                            {isUploading ? <FaSpinner className="spinning" /> : <FaUpload />}
                            {isUploading ? 'Uploading...' : (!canDirectUpload ? 'Subscribe to Unlock Direct Upload' : 'Upload to YouTube/TikTok')}
                        </button>
                    </div>
                </div>
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
                                onClick={() => window.open(video.youtubeUrl || video.tiktokUrl || video.videoUrl, '_blank')}
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