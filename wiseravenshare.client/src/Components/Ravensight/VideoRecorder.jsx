import React, { useState, useRef, useEffect } from 'react';
import { FaVideo, FaStop, FaRedo, FaUpload, FaCamera, FaMicrophone, FaMicrophoneSlash, FaVideoSlash } from 'react-icons/fa';
import { ravensightAPI } from '../../Services/RavensightAPI';
import { useAuth } from '../../Contexts/AuthContext';

const VideoRecorder = ({ onNotification, canDirectUpload = true, subscriptionPriceMonthly = 9.99 }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordedChunks, setRecordedChunks] = useState([]);
    const [recordingTime, setRecordingTime] = useState(0);
    const [videoURL, setVideoURL] = useState(null);
    const [deviceId, setDeviceId] = useState(null);
    const [devices, setDevices] = useState([]);
    const [isMuted, setIsMuted] = useState(false);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isUploading, setIsUploading] = useState(false);
    const [videoTitle, setVideoTitle] = useState('');
    const [videoDescription, setVideoDescription] = useState('');
    const [publishToYouTube, setPublishToYouTube] = useState(true);
    const [publishToTikTok, setPublishToTikTok] = useState(false);
    const [publishToFacebook, setPublishToFacebook] = useState(false);
    const [youTubeChannelOrEmail, setYouTubeChannelOrEmail] = useState('');
    const [tikTokUsername, setTikTokUsername] = useState('');
    const [facebookPageOrProfile, setFacebookPageOrProfile] = useState('');
    const [youTubePermissionGranted, setYouTubePermissionGranted] = useState(false);
    const [tikTokPermissionGranted, setTikTokPermissionGranted] = useState(false);
    const [facebookPermissionGranted, setFacebookPermissionGranted] = useState(false);
    const [privacyStatus, setPrivacyStatus] = useState('unlisted');

    const videoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const { user } = useAuth();

    const persistLocalVideo = (video) => {
        try {
            const current = JSON.parse(localStorage.getItem('wiseRavensightVideos') || '[]');
            const next = [video, ...current].slice(0, 50);
            localStorage.setItem('wiseRavensightVideos', JSON.stringify(next));
            window.dispatchEvent(new Event('wiseraven:posts-updated'));
        } catch {
            // No-op fallback storage.
        }
    };

    useEffect(() => {
        loadDevices();
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    const loadDevices = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            setDevices(videoDevices);
        } catch (error) {
            console.error('Error loading devices:', error);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: isCameraOn,
                audio: !isMuted
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm'
            });

            mediaRecorderRef.current = mediaRecorder;
            setRecordedChunks([]);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    setRecordedChunks(prev => [...prev, event.data]);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                setVideoURL(url);
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                    videoRef.current.src = url;
                }
            };

            mediaRecorder.start(1000);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            onNotification('Recording started!', 'success');
        } catch (error) {
            console.error('Error starting recording:', error);
            onNotification('Failed to access camera/microphone. Please check permissions.', 'error');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            onNotification('Recording stopped!', 'success');
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && isRecording && !isPaused) {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            clearInterval(timerRef.current);
            onNotification('Recording paused', 'info');
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && isRecording && isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
            onNotification('Recording resumed', 'info');
        }
    };

    const resetRecording = () => {
        stopRecording();
        setVideoURL(null);
        setRecordedChunks([]);
        setRecordingTime(0);
        setVideoTitle('');
        setVideoDescription('');
        setPublishToTikTok(false);
        setPublishToFacebook(false);
        setYouTubeChannelOrEmail('');
        setTikTokUsername('');
        setFacebookPageOrProfile('');
        setYouTubePermissionGranted(false);
        setTikTokPermissionGranted(false);
        setFacebookPermissionGranted(false);
        onNotification('Recording reset', 'info');
    };

    const uploadVideo = async ({ libraryOnly = false } = {}) => {
        if (!libraryOnly && !canDirectUpload) {
            onNotification(`Direct video upload requires Creator Pro ($${Number(subscriptionPriceMonthly).toFixed(2)}/month).`, 'warning');
            return;
        }

        if (recordedChunks.length === 0) {
            onNotification('No video to upload', 'error');
            return;
        }

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'video/webm' });

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const formData = new FormData();
            formData.append('video', file);
            formData.append('title', videoTitle || `Recording ${new Date().toLocaleString()}`);
            formData.append('description', videoDescription);
            formData.append('privacyStatus', privacyStatus);
            formData.append('publishToYouTube', String(!libraryOnly && publishToYouTube));
            formData.append('publishToTikTok', String(!libraryOnly && publishToTikTok));
            formData.append('publishToFacebook', String(!libraryOnly && publishToFacebook));
            formData.append('youTubeChannelOrEmail', libraryOnly ? '' : (youTubeChannelOrEmail || ''));
            formData.append('tikTokUsername', libraryOnly ? '' : (tikTokUsername || ''));
            formData.append('facebookPageOrProfile', libraryOnly ? '' : (facebookPageOrProfile || ''));
            formData.append('youTubePermissionGranted', String(!libraryOnly && youTubePermissionGranted));
            formData.append('tikTokPermissionGranted', String(!libraryOnly && tikTokPermissionGranted));
            formData.append('facebookPermissionGranted', String(!libraryOnly && facebookPermissionGranted));

            const response = await ravensightAPI.uploadVideo(formData, (progress) => {
                setUploadProgress(progress);
            });

            if (response?.video) {
                persistLocalVideo({
                    ...response.video,
                    userId: user?.id,
                    channelName: response.video.channelName || user?.name || 'WiseRaven Creator',
                    channelAvatar: response.video.channelAvatar || user?.avatar,
                    videoUrl: response.video.videoUrl || videoURL
                });
            }

            onNotification(libraryOnly ? 'Video saved to library!' : 'Video uploaded successfully!', 'success');
            resetRecording();
        } catch (error) {
            console.error('Upload error:', error);
            onNotification(libraryOnly ? 'Failed to save to library' : 'Failed to upload video', 'error');
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const handleUploadToSocials = () => uploadVideo({ libraryOnly: false });
    const handleSaveToLibrary = () => uploadVideo({ libraryOnly: true });

    const formatTime = (seconds) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const toggleCamera = async () => {
        setIsCameraOn(!isCameraOn);
        if (streamRef.current) {
            const videoTrack = streamRef.current.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !isCameraOn;
            }
        }
    };

    const toggleMicrophone = () => {
        setIsMuted(!isMuted);
        if (streamRef.current) {
            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = isMuted;
            }
        }
    };

    return (
        <div>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px'
            }}>
                {/* Video Preview */}
                <div style={{
                    background: '#000',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{
                            width: '100%',
                            height: 'auto',
                            background: '#000'
                        }}
                    />

                    {/* Recording Indicator */}
                    {isRecording && (
                        <div style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '5px 10px',
                            borderRadius: '20px'
                        }}>
                            <div style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: '#f44336',
                                animation: 'pulse 1s infinite'
                            }}></div>
                            <span style={{ color: 'white', fontSize: '14px' }}>
                                {formatTime(recordingTime)}
                            </span>
                        </div>
                    )}

                    {/* Controls Overlay */}
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        right: '10px',
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '10px'
                    }}>
                        {!isRecording && !videoURL && (
                            <button
                                onClick={startRecording}
                                style={{
                                    background: '#f44336',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 24px',
                                    borderRadius: '30px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontWeight: 'bold'
                                }}
                            >
                                <FaVideo /> Start Recording
                            </button>
                        )}

                        {isRecording && !isPaused && (
                            <>
                                <button
                                    onClick={pauseRecording}
                                    style={{
                                        background: '#ff9800',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 20px',
                                        borderRadius: '30px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Pause
                                </button>
                                <button
                                    onClick={stopRecording}
                                    style={{
                                        background: '#f44336',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 20px',
                                        borderRadius: '30px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FaStop /> Stop
                                </button>
                            </>
                        )}

                        {isRecording && isPaused && (
                            <button
                                onClick={resumeRecording}
                                style={{
                                    background: '#4caf50',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px 20px',
                                    borderRadius: '30px',
                                    cursor: 'pointer'
                                }}
                            >
                                Resume
                            </button>
                        )}

                        {videoURL && (
                            <>
                                <button
                                    onClick={resetRecording}
                                    style={{
                                        background: '#ff9800',
                                        color: 'white',
                                        border: 'none',
                                        padding: '12px 20px',
                                        borderRadius: '30px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FaRedo /> Record Again
                                </button>
                            </>
                        )}
                    </div>

                    {/* Device Controls */}
                    <div style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        display: 'flex',
                        gap: '8px'
                    }}>
                        <button
                            onClick={toggleCamera}
                            style={{
                                background: 'rgba(0,0,0,0.7)',
                                border: 'none',
                                color: 'white',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {isCameraOn ? <FaCamera /> : <FaVideoSlash />}
                        </button>
                        <button
                            onClick={toggleMicrophone}
                            style={{
                                background: 'rgba(0,0,0,0.7)',
                                border: 'none',
                                color: 'white',
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                        >
                            {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
                        </button>
                    </div>
                </div>

                {/* Upload Form */}
                <div>
                    {videoURL && (
                        <div style={{
                            background: 'var(--secondary-color)',
                            borderRadius: '12px',
                            padding: '20px'
                        }}>
                            <h3 style={{ marginBottom: '15px' }}>Upload to YouTube/TikTok/Facebook</h3>

                            {!canDirectUpload && (
                                <div style={{
                                    marginBottom: '15px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255, 152, 0, 0.12)',
                                    padding: '12px'
                                }}>
                                    <strong>Subscription required for direct upload.</strong>
                                    <div style={{ fontSize: '13px', marginTop: '4px', color: 'var(--light-color)' }}>
                                        Activate Creator Pro to upload recordings for ${Number(subscriptionPriceMonthly).toFixed(2)}/month.
                                    </div>
                                </div>
                            )}

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={videoTitle}
                                    onChange={(e) => setVideoTitle(e.target.value)}
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
                                    value={videoDescription}
                                    onChange={(e) => setVideoDescription(e.target.value)}
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
                                    Privacy Status
                                </label>
                                <select
                                    value={privacyStatus}
                                    onChange={(e) => setPrivacyStatus(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'var(--card-bg)',
                                        color: 'var(--text-color)'
                                    }}
                                >
                                    <option value="public">Public</option>
                                    <option value="unlisted">Unlisted</option>
                                    <option value="private">Private</option>
                                </select>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={publishToYouTube}
                                        onChange={(e) => setPublishToYouTube(e.target.checked)}
                                    />
                                    Publish directly to YouTube
                                </label>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={publishToTikTok}
                                        onChange={(e) => setPublishToTikTok(e.target.checked)}
                                    />
                                    Publish directly to TikTok
                                </label>
                            </div>

                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={publishToFacebook}
                                        onChange={(e) => setPublishToFacebook(e.target.checked)}
                                    />
                                    Publish directly to Facebook
                                </label>
                            </div>

                            {publishToYouTube && (
                                <div style={{ marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        value={youTubeChannelOrEmail}
                                        onChange={(e) => setYouTubeChannelOrEmail(e.target.value)}
                                        placeholder="YouTube channel or account email"
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
                                            checked={youTubePermissionGranted}
                                            onChange={(e) => setYouTubePermissionGranted(e.target.checked)}
                                        />
                                        I authorize Ravensight to upload this video to my YouTube account.
                                    </label>
                                </div>
                            )}

                            {publishToTikTok && (
                                <div style={{ marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        value={tikTokUsername}
                                        onChange={(e) => setTikTokUsername(e.target.value)}
                                        placeholder="TikTok username (without @)"
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
                                            checked={tikTokPermissionGranted}
                                            onChange={(e) => setTikTokPermissionGranted(e.target.checked)}
                                        />
                                        I authorize Ravensight to upload this video to my TikTok account.
                                    </label>
                                </div>
                            )}

                            {publishToFacebook && (
                                <div style={{ marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        value={facebookPageOrProfile}
                                        onChange={(e) => setFacebookPageOrProfile(e.target.value)}
                                        placeholder="Facebook page or profile"
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
                                            checked={facebookPermissionGranted}
                                            onChange={(e) => setFacebookPermissionGranted(e.target.checked)}
                                        />
                                        I authorize Ravensight to upload this video to my Facebook account.
                                    </label>
                                </div>
                            )}

                            {isUploading && (
                                <div style={{ marginBottom: '15px' }}>
                                    <div style={{
                                        height: '4px',
                                        background: 'rgba(255,255,255,0.1)',
                                        borderRadius: '2px',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${uploadProgress}%`,
                                            height: '100%',
                                            background: 'linear-gradient(90deg, var(--highlight-color), var(--accent-color))',
                                            transition: 'width 0.3s'
                                        }}></div>
                                    </div>
                                    <div style={{ textAlign: 'center', marginTop: '5px', fontSize: '14px' }}>
                                        Uploading... {uploadProgress}%
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <button
                                    onClick={handleSaveToLibrary}
                                    disabled={isUploading}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '30px',
                                        border: '1px solid var(--border-color)',
                                        background: isUploading ? 'var(--accent-color)' : 'var(--secondary-color)',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        cursor: isUploading ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <FaUpload /> Save to Library
                                </button>

                                <button
                                    onClick={handleUploadToSocials}
                                    disabled={isUploading || !canDirectUpload}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '30px',
                                        border: 'none',
                                        background: isUploading || !canDirectUpload
                                            ? 'var(--accent-color)'
                                            : 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        cursor: isUploading || !canDirectUpload ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    <FaUpload /> Upload to Socials
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Video Info */}
                    {!videoURL && !isRecording && (
                        <div style={{
                            background: 'var(--secondary-color)',
                            borderRadius: '12px',
                            padding: '40px',
                            textAlign: 'center'
                        }}>
                            <FaVideo style={{ fontSize: '48px', color: 'var(--highlight-color)', marginBottom: '15px' }} />
                            <h3>Ready to Record</h3>
                            <p style={{ color: 'var(--highlight-color)', marginTop: '10px' }}>
                                Click "Start Recording" to begin creating your video
                            </p>
                            <p style={{ fontSize: '12px', color: 'var(--highlight-color)', marginTop: '10px' }}>
                                Videos will be uploaded directly to YouTube, TikTok, or Facebook via Ravensight
                            </p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0% { opacity: 1; }
                    50% { opacity: 0.5; }
                    100% { opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default VideoRecorder;