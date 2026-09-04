// src/components/ravensight/VideoStudio.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { videoService } from '../../Services/videoService';
import { apiService } from '../../Services/api';
import {
    getRavensightLocalSaveRootPreference,
    getRavensightLocalFolderPermission,
    saveFileToRavensightFolder,
    setRavensightLocalFolderPermission,
    setRavensightLocalSaveRootPreference,
    type RavensightLocalFolderPermission,
    type RavensightSaveRoot
} from '../../utils/ravensightLocalSave';
import {
    FiCamera,
    FiMic,
    FiMicOff,
    FiVideo,
    FiVideoOff,
    FiPlay,
    FiPause,
    FiStopCircle,
    FiUpload,
    FiYoutube,
    FiClock,
    FiEye,
    FiDownload
} from 'react-icons/fi';

export const VideoStudio: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isMicOn, setIsMicOn] = useState(true);
    const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
    const [videoURL, setVideoURL] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [publishToYoutube, setPublishToYoutube] = useState(false);
    const [privacy, setPrivacy] = useState('unlisted');
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [hasAutoSaved, setHasAutoSaved] = useState(false);
    const [localSaveRoot, setLocalSaveRoot] = useState<RavensightSaveRoot>(getRavensightLocalSaveRootPreference());
    const [folderPermission, setFolderPermission] = useState<RavensightLocalFolderPermission | null>(null);
    const [isPermissionLoading, setIsPermissionLoading] = useState(false);
    const [isPermissionSaving, setIsPermissionSaving] = useState(false);
    const [musicLibrary, setMusicLibrary] = useState<Array<{ id: string; title?: string; artist?: string; album?: string; genre?: string; mediaUrl?: string }>>([]);
    const [musicLibraryLoading, setMusicLibraryLoading] = useState(false);
    const [selectedMusicTrackId, setSelectedMusicTrackId] = useState('');

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const sanitizeFileBaseName = (rawName: string) => {
        const normalized = String(rawName || '').trim();
        if (!normalized) {
            return `recording_${Date.now()}`;
        }

        return normalized.replace(/[^a-zA-Z0-9-_]/g, '_');
    };

    const buildUploadFormData = (blob: Blob) => {
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'video/webm' });
        const shouldPublishToYouTube = false;
        const formData = new FormData();
        formData.append('video', file);
        formData.append('file', file);
        formData.append('title', title || 'Untitled Recording');
        formData.append('description', description);
        formData.append('publishToYouTube', String(shouldPublishToYouTube));
        formData.append('publishToYoutube', String(shouldPublishToYouTube));
        formData.append('youTubeChannelOrEmail', '');
        formData.append('youTubePermissionGranted', 'false');
        formData.append('privacy', privacy);
        formData.append('privacyStatus', privacy);
        formData.append('musicTrackId', selectedMusicTrack?.id || '');
        formData.append('musicTrackTitle', selectedMusicTrack?.title || '');
        formData.append('musicTrackUrl', selectedMusicTrack?.mediaUrl || '');
        formData.append('musicTrackArtist', selectedMusicTrack?.artist || '');
        formData.append('musicTrackAlbum', selectedMusicTrack?.album || '');
        formData.append('musicTrackGenre', selectedMusicTrack?.genre || '');
        formData.append('destinationFolder', '/wiseravenshare/ravensight/video');
        formData.append('storageMode', 'temporary');
        formData.append('isPermanent', 'false');
        return formData;
    };

    const autoSaveToDatabase = async (blob: Blob) => {
        try {
            setIsAutoSaving(true);
            const savedVideo = await videoService.uploadVideo(buildUploadFormData(blob));
            setHasAutoSaved(true);
            toast.success('Auto-saved to database');
            window.dispatchEvent(new CustomEvent('ravensight:video-saved', { detail: savedVideo }));
        } catch (error) {
            console.error('Auto-save failed:', error);
            toast.error('Auto-save to database failed. You can still upload manually.');
        } finally {
            setIsAutoSaving(false);
        }
    };

    useEffect(() => {
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadPermission = async () => {
            setIsPermissionLoading(true);
            const permission = await getRavensightLocalFolderPermission();
            if (!isMounted) {
                return;
            }

            if (permission) {
                setFolderPermission(permission);
                if (permission.localSaveRoot !== localSaveRoot) {
                    setLocalSaveRoot(permission.localSaveRoot);
                    setRavensightLocalSaveRootPreference(permission.localSaveRoot);
                }
            }

            setIsPermissionLoading(false);
        };

        void loadPermission();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadMusicLibrary = async () => {
            try {
                setMusicLibraryLoading(true);
                const response = await apiService.getMusicLibrary();
                if (!isMounted) {
                    return;
                }

                const tracks = Array.isArray(response?.data) ? response.data : [];
                setMusicLibrary(tracks);
                if (!selectedMusicTrackId && tracks.length > 0) {
                    setSelectedMusicTrackId(tracks[0].id || '');
                }
            } catch (error) {
                console.warn('Unable to load music library for video soundtrack selection:', error);
                if (isMounted) {
                    setMusicLibrary([]);
                }
            } finally {
                if (isMounted) {
                    setMusicLibraryLoading(false);
                }
            }
        };

        void loadMusicLibrary();

        return () => {
            isMounted = false;
        };
    }, []);

    const selectedMusicTrack = musicLibrary.find((track) => String(track?.id || '') === String(selectedMusicTrackId || ''));

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: isCameraOn,
                audio: isMicOn,
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            const mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9,opus',
            });

            mediaRecorderRef.current = mediaRecorder;
            chunksRef.current = [];
            setRecordedChunks([]);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                    setRecordedChunks([...chunksRef.current]);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                if (blob.size === 0) {
                    toast.error('Recording is empty. Please record again.');
                    return;
                }
                const url = URL.createObjectURL(blob);
                setVideoURL(url);
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                    videoRef.current.src = url;
                }

                void autoSaveToDatabase(blob);
            };

            mediaRecorder.start(1000);
            setIsRecording(true);
            setRecordingTime(0);

            timerRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

            toast.success('Recording started!');
        } catch (error) {
            console.error('Failed to start recording:', error);
            toast.error('Failed to access camera/microphone');
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
            toast.success('Recording saved!');
        }
    };

    const togglePause = () => {
        if (mediaRecorderRef.current && isRecording) {
            if (isPaused) {
                mediaRecorderRef.current.resume();
                timerRef.current = setInterval(() => {
                    setRecordingTime(prev => prev + 1);
                }, 1000);
            } else {
                mediaRecorderRef.current.pause();
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                }
            }
            setIsPaused(!isPaused);
        }
    };

    const uploadMutation = useMutation({
        mutationFn: videoService.uploadVideo,
        onSuccess: (data) => {
            toast.success('Video uploaded successfully!');
            resetStudio();
        },
        onError: (error: any) => {
            toast.error(error.message || 'Failed to upload video');
        },
    });

    const handleUpload = async () => {
        if (!videoURL) {
            toast.error('No video to upload');
            return;
        }

        const blob = await fetch(videoURL).then(r => r.blob());
        const formData = buildUploadFormData(blob);

        uploadMutation.mutate(formData);
    };

    const handleSaveToComputer = async () => {
        if (!videoURL) {
            toast.error('No video to save');
            return;
        }

        const blob = await fetch(videoURL).then((response) => response.blob());
        const safeTitle = sanitizeFileBaseName(title || `recording_${Date.now()}`);
        const result = await saveFileToRavensightFolder(blob, `${safeTitle}.webm`, 'video', localSaveRoot);

        if (result.mode === 'directory') {
            const rootLabel = result.startIn === 'videos' ? 'Videos' : 'Pictures';
            toast.success(`Saved to ${rootLabel}/Ravensight`);
            return;
        }

        toast.success('Saved to computer');
    };

    const handleLocalSaveRootChange = (value: RavensightSaveRoot) => {
        setLocalSaveRoot(value);
        setRavensightLocalSaveRootPreference(value);
    };

    const handleGrantFolderPermission = async () => {
        try {
            setIsPermissionSaving(true);
            const updated = await setRavensightLocalFolderPermission(true, localSaveRoot);
            setFolderPermission(updated);
            toast.success('Ravensight folder permission granted.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to grant folder permission.');
        } finally {
            setIsPermissionSaving(false);
        }
    };

    const handleRevokeFolderPermission = async () => {
        try {
            setIsPermissionSaving(true);
            const updated = await setRavensightLocalFolderPermission(false, localSaveRoot);
            setFolderPermission(updated);
            toast.success('Ravensight folder permission revoked.');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Unable to revoke folder permission.');
        } finally {
            setIsPermissionSaving(false);
        }
    };

    const resetStudio = () => {
        chunksRef.current = [];
        setVideoURL(null);
        setRecordedChunks([]);
        setRecordingTime(0);
        setTitle('');
        setDescription('');
        setHasAutoSaved(false);
        setIsAutoSaving(false);
        setSelectedMusicTrackId(musicLibrary[0]?.id || '');
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Video Preview */}
            <Card className="lg:col-span-2 p-4">
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-contain"
                    />

                    {isRecording && (
                        <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-full">
                            <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-sm font-mono">{formatTime(recordingTime)}</span>
                        </div>
                    )}

                    {!isRecording && !videoURL && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                            <div className="text-center text-gray-400">
                                <FiVideo className="w-16 h-16 mx-auto mb-4" />
                                <p>Click "Start Recording" to begin</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                    {!isRecording && !videoURL && (
                        <>
                            <Button onClick={startRecording} className="bg-red-500 hover:bg-red-600">
                                <FiVideo className="mr-2" />
                                Start Recording
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => setIsCameraOn(!isCameraOn)}
                                className={!isCameraOn ? 'text-red-400' : ''}
                            >
                                {isCameraOn ? <FiCamera /> : <FiVideoOff />}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => setIsMicOn(!isMicOn)}
                                className={!isMicOn ? 'text-red-400' : ''}
                            >
                                {isMicOn ? <FiMic /> : <FiMicOff />}
                            </Button>
                        </>
                    )}

                    {isRecording && (
                        <>
                            <Button onClick={togglePause} variant="ghost">
                                {isPaused ? <FiPlay /> : <FiPause />}
                            </Button>
                            <Button onClick={stopRecording} className="bg-red-500 hover:bg-red-600">
                                <FiStopCircle className="mr-2" />
                                Stop
                            </Button>
                        </>
                    )}

                    {videoURL && (
                        <>
                            <Button onClick={handleUpload} disabled={uploadMutation.isPending}>
                                <FiUpload className="mr-2" />
                                {uploadMutation.isPending ? 'Uploading...' : hasAutoSaved ? 'Upload Again' : 'Upload'}
                            </Button>
                            <Button onClick={handleSaveToComputer} variant="ghost">
                                <FiDownload className="mr-2" />
                                Save to Computer
                            </Button>
                            <Button onClick={resetStudio} variant="ghost">
                                Record Again
                            </Button>
                        </>
                    )}
                </div>
            </Card>

            {/* Upload Form */}
            <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Video Details</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Enter video title"
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            disabled={!videoURL}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Description
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter video description"
                            rows={3}
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition resize-none"
                            disabled={!videoURL}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                        Add Music to Video
                        </label>
                        <select
                        value={selectedMusicTrackId}
                        onChange={(e) => setSelectedMusicTrackId(e.target.value)}
                        disabled={musicLibraryLoading || musicLibrary.length === 0}
                        className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                        >
                        <option value="">
                            {musicLibraryLoading ? 'Loading music library...' : 'No soundtrack selected'}
                        </option>
                        {musicLibrary.map((track) => (
                            <option key={track.id} value={track.id}>
                                {track.artist ? `${track.artist} — ` : ''}{track.title || 'Untitled track'}
                            </option>
                        ))}
                        </select>
                        {selectedMusicTrack && (
                        <div className="mt-2 rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm text-gray-200">
                            <div className="font-semibold">{selectedMusicTrack.title}</div>
                            <div className="text-xs text-gray-400">
                                {selectedMusicTrack.artist || 'Unknown artist'}
                                {selectedMusicTrack.album ? ` • ${selectedMusicTrack.album}` : ''}
                                {selectedMusicTrack.genre ? ` • ${selectedMusicTrack.genre}` : ''}
                            </div>
                        </div>
                        )}
                    </div>

                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={publishToYoutube}
                                onChange={(e) => setPublishToYoutube(e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary"
                                disabled={!videoURL}
                            />
                            <span className="text-sm">Publish to YouTube</span>
                            <FiYoutube className="text-red-500" />
                        </label>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Privacy
                        </label>
                        <select
                            value={privacy}
                            onChange={(e) => setPrivacy(e.target.value)}
                            className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                            disabled={!videoURL}
                        >
                            <option value="public">Public</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="private">Private</option>
                        </select>
                    </div>

                    {videoURL && (
                        <div className="p-3 bg-white/5 rounded-lg">
                            <div className="mb-3 p-3 bg-black/20 rounded-lg border border-border/50">
                                <div className="text-sm font-medium text-gray-200">Ravensight Folder Identity</div>
                                <div className="text-xs text-gray-400 mt-1">
                                    Server copies auto-delete in 7 days unless your local Ravensight folder permission is active.
                                </div>
                                <div className="mt-2 text-xs text-gray-300">
                                    Status: {isPermissionLoading
                                        ? 'Checking...'
                                        : folderPermission?.localFolderPermissionGranted
                                            ? 'Active'
                                            : 'Not granted'}
                                </div>
                                {folderPermission?.folderIdentityKey && (
                                    <div className="mt-1 text-xs text-gray-500 break-words">
                                        Key: {folderPermission.folderIdentityKey}
                                    </div>
                                )}
                                <div className="mt-3 flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleGrantFolderPermission}
                                        disabled={isPermissionSaving}
                                    >
                                        {isPermissionSaving ? 'Saving...' : 'Grant Permission'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={handleRevokeFolderPermission}
                                        disabled={isPermissionSaving || !(folderPermission?.localFolderPermissionGranted)}
                                    >
                                        Revoke Permission
                                    </Button>
                                </div>
                            </div>
                            <div className="mb-3">
                                <label className="block text-sm font-medium text-gray-400 mb-1">
                                    Local Save Folder
                                </label>
                                <select
                                    value={localSaveRoot}
                                    onChange={(e) => handleLocalSaveRootChange(e.target.value as RavensightSaveRoot)}
                                    className="w-full px-3 py-2 bg-white/5 border border-border rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition"
                                >
                                    <option value="auto">Auto (Video to Videos, Photo/Music to Pictures)</option>
                                    <option value="videos">Always Videos</option>
                                    <option value="pictures">Always Pictures</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400">
                                <FiClock />
                                <span>Duration: {formatTime(recordingTime)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-400 mt-1">
                                <FiEye />
                                <span>Size: {(recordedChunks.reduce((acc, chunk) => acc + chunk.size, 0) / 1024 / 1024).toFixed(1)} MB</span>
                            </div>
                            <div className="text-sm text-gray-400 mt-1">
                                {isAutoSaving ? 'Auto-saving to database...' : hasAutoSaved ? 'Saved to database for later retrieval.' : 'Not yet saved to database.'}
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
};