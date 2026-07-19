// src/components/ravensight/VideoStudio.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { videoService } from '../../services/videoService';
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
    const [publishToYoutube, setPublishToYoutube] = useState(true);
    const [privacy, setPrivacy] = useState('unlisted');
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [hasAutoSaved, setHasAutoSaved] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const buildUploadFormData = (blob: Blob) => {
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('video', file);
        formData.append('title', title || 'Untitled Recording');
        formData.append('description', description);
        formData.append('publishToYoutube', String(publishToYoutube));
        formData.append('privacy', privacy);
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

    const handleSaveToComputer = () => {
        if (!videoURL) {
            toast.error('No video to save');
            return;
        }

        const link = document.createElement('a');
        const safeTitle = (title || `recording_${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, '_');
        link.href = videoURL;
        link.download = `${safeTitle}.webm`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Saved to computer');
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