import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FiPlay,
    FiPause,
    FiSkipBack,
    FiSkipForward,
    FiVolume2,
    FiVolumeX,
    FiHeart,
    FiRepeat,
    FiShuffle,
    FiList,
    FiMusic,
    FiMaximize2,
    FiMinimize2,
    FiX,
    FiDownload,
    FiShare2,
    FiInfo,
    FiClock,
    FiHeadphones,
    FiDisc
} from 'react-icons/fi';

const formatDuration = (seconds) => {
    if (!seconds || Number.isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const SAMPLE_TRACKS = [
    {
        id: '1',
        title: 'Test Track 1',
        artist: 'Artist One',
        album: 'Album One',
        duration: 180,
        fileUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        coverArtUrl: 'https://picsum.photos/200/200?random=1'
    },
    {
        id: '2',
        title: 'Test Track 2',
        artist: 'Artist Two',
        album: 'Album Two',
        duration: 200,
        fileUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        coverArtUrl: 'https://picsum.photos/200/200?random=2'
    },
    {
        id: '3',
        title: 'Test Track 3',
        artist: 'Artist Three',
        album: 'Album Three',
        duration: 220,
        fileUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        coverArtUrl: 'https://picsum.photos/200/200?random=3'
    }
];

export const RavenMusicPlayer = ({
    initialTrack = null,
    playlist = [],
    autoPlay = false,
    onClose,
    onTrackChange,
    className = ''
}) => {
    const [currentTrack, setCurrentTrack] = useState(initialTrack || null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(80);
    const [isMuted, setIsMuted] = useState(false);
    const [queue, setQueue] = useState(playlist.length > 0 ? playlist : SAMPLE_TRACKS);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [isShuffled, setIsShuffled] = useState(false);
    const [repeatMode, setRepeatMode] = useState('none');
    const [isFavorite, setIsFavorite] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showPlaylist, setShowPlaylist] = useState(false);
    const [error, setError] = useState(null);

    const audioRef = useRef(null);
    const containerRef = useRef(null);

    const handleTimeUpdate = useCallback(() => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    }, []);

    const handleLoadedMetadata = useCallback(() => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    }, []);

    const handlePlaying = useCallback(() => {
        setIsPlaying(true);
        setIsBuffering(false);
        setError(null);
    }, []);

    const handlePause = useCallback(() => {
        setIsPlaying(false);
    }, []);

    const handleWaiting = useCallback(() => {
        setIsBuffering(true);
    }, []);

    const handleCanPlay = useCallback(() => {
        setIsBuffering(false);
        setError(null);
    }, []);

    const handleError = useCallback((event) => {
        const audio = event.target;
        setError(`Error playing: ${audio?.error?.message || 'Unknown error'}`);
        setIsPlaying(false);
        setIsBuffering(false);
        console.error('Audio error:', audio?.error);
    }, []);

    const handleEnded = useCallback(() => {
        if (repeatMode === 'one') {
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
            }
        } else {
            playNext();
        }
    }, [repeatMode]);

    const loadTrack = useCallback((track) => {
        if (!audioRef.current || !track) return;

        try {
            if (!track.fileUrl && !track.mediaUrl && !track.url) {
                setError('No audio URL provided');
                return;
            }

            const source = track.fileUrl || track.mediaUrl || track.url;
            audioRef.current.src = source;
            audioRef.current.load();

            setCurrentTrack(track);
            setError(null);
            setCurrentTime(0);
            setDuration(0);

            const index = queue.findIndex((item) => item.id === track.id);
            if (index !== -1) {
                setCurrentIndex(index);
            }

            if (autoPlay || isPlaying) {
                audioRef.current.play().catch(() => {
                    setIsPlaying(false);
                });
            }

            onTrackChange?.(track);
        } catch (err) {
            setError('Failed to load track');
            console.error('Load track error:', err);
        }
    }, [autoPlay, isPlaying, onTrackChange, queue]);

    const togglePlay = useCallback(() => {
        if (!audioRef.current || !currentTrack) {
            if (queue.length > 0) {
                loadTrack(queue[0]);
                window.setTimeout(() => togglePlay(), 200);
            }
            return;
        }

        try {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {
                        setIsPlaying(false);
                    });
                }
            }
        } catch (err) {
            console.error('Play error:', err);
            setError('Playback error');
        }
    }, [currentTrack, isPlaying, loadTrack, queue]);

    const playNext = useCallback(() => {
        if (queue.length === 0) return;

        let nextIndex = currentIndex + 1;
        if (nextIndex >= queue.length) {
            if (repeatMode === 'all') {
                nextIndex = 0;
            } else {
                return;
            }
        }

        const nextTrack = queue[nextIndex];
        if (nextTrack) {
            loadTrack(nextTrack);
        }
    }, [currentIndex, queue, repeatMode, loadTrack]);

    const playPrevious = useCallback(() => {
        if (queue.length === 0) return;

        let prevIndex = currentIndex - 1;
        if (prevIndex < 0) {
            if (repeatMode === 'all') {
                prevIndex = queue.length - 1;
            } else {
                return;
            }
        }

        const prevTrack = queue[prevIndex];
        if (prevTrack) {
            loadTrack(prevTrack);
        }
    }, [currentIndex, queue, repeatMode, loadTrack]);

    const seek = useCallback((time) => {
        if (audioRef.current) {
            const clampedTime = Math.max(0, Math.min(time, duration));
            audioRef.current.currentTime = clampedTime;
            setCurrentTime(clampedTime);
        }
    }, [duration]);

    const toggleShuffle = useCallback(() => {
        setIsShuffled((prev) => !prev);
        if (!isShuffled && queue.length > 1) {
            const shuffled = [...queue];
            for (let i = shuffled.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            setQueue(shuffled);
        } else {
            setQueue(playlist.length > 0 ? playlist : SAMPLE_TRACKS);
        }
    }, [isShuffled, playlist, queue]);

    const toggleRepeat = useCallback(() => {
        setRepeatMode((prev) => {
            if (prev === 'none') return 'all';
            if (prev === 'all') return 'one';
            return 'none';
        });
    }, []);

    const toggleFavorite = useCallback(() => {
        setIsFavorite((prev) => !prev);
    }, []);

    const addToQueue = useCallback((track) => {
        setQueue((prev) => [...prev, track]);
    }, []);

    const removeFromQueue = useCallback((trackId) => {
        setQueue((prev) => prev.filter((track) => track.id !== trackId));
    }, []);

    const clearQueue = useCallback(() => {
        setQueue([]);
        setCurrentIndex(-1);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
        }
        setCurrentTrack(null);
        setIsPlaying(false);
    }, []);

    const playTrack = useCallback((track) => {
        if (!queue.some((item) => item.id === track.id)) {
            setQueue((prev) => [...prev, track]);
        }
        loadTrack(track);
        if (audioRef.current) {
            audioRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        }
    }, [loadTrack, queue]);

    const handleSeek = useCallback((event) => {
        const value = Number.parseFloat(event.target.value);
        const time = (value / 100) * duration;
        seek(time);
    }, [duration, seek]);

    const handleVolumeChange = useCallback((event) => {
        const value = Number.parseInt(event.target.value, 10);
        setVolume(value);
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : value / 100;
        }
    }, [isMuted]);

    const toggleMute = useCallback(() => {
        setIsMuted((prev) => !prev);
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? volume / 100 : 0;
        }
    }, [isMuted, volume]);

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    useEffect(() => {
        const audio = new Audio();
        audioRef.current = audio;

        audio.addEventListener('timeupdate', handleTimeUpdate);
        audio.addEventListener('loadedmetadata', handleLoadedMetadata);
        audio.addEventListener('playing', handlePlaying);
        audio.addEventListener('pause', handlePause);
        audio.addEventListener('waiting', handleWaiting);
        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('error', handleError);
        audio.addEventListener('ended', handleEnded);
        audio.volume = volume / 100;

        if (initialTrack) {
            loadTrack(initialTrack);
        } else if (queue.length > 0) {
            loadTrack(queue[0]);
        }

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.src = '';
                audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
                audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata);
                audioRef.current.removeEventListener('playing', handlePlaying);
                audioRef.current.removeEventListener('pause', handlePause);
                audioRef.current.removeEventListener('waiting', handleWaiting);
                audioRef.current.removeEventListener('canplay', handleCanPlay);
                audioRef.current.removeEventListener('error', handleError);
                audioRef.current.removeEventListener('ended', handleEnded);
            }
        };
    }, [handleCanPlay, handleEnded, handleError, handleLoadedMetadata, handlePause, handlePlaying, handleTimeUpdate, handleWaiting, initialTrack, loadTrack, queue]);

    useEffect(() => {
        if (autoPlay && currentTrack && audioRef.current) {
            audioRef.current.play().catch(() => {
                setIsPlaying(false);
            });
        }
    }, [autoPlay, currentTrack]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = isMuted ? 0 : volume / 100;
        }
    }, [volume, isMuted]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.target instanceof HTMLInputElement) return;

            switch (event.key) {
                case ' ':
                    event.preventDefault();
                    togglePlay();
                    break;
                case 'ArrowRight':
                    if (event.ctrlKey) {
                        event.preventDefault();
                        playNext();
                    }
                    break;
                case 'ArrowLeft':
                    if (event.ctrlKey) {
                        event.preventDefault();
                        playPrevious();
                    }
                    break;
                case 'f':
                case 'F':
                    setIsExpanded((prev) => !prev);
                    break;
                default:
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [playNext, playPrevious, togglePlay]);

    if (!currentTrack && queue.length === 0) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 text-center text-gray-400">
                <p>No music playing. Add tracks to the queue.</p>
            </div>
        );
    }

    return (
        <motion.div
            ref={containerRef}
            className={`fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-black/80 backdrop-blur-xl border-t border-white/10 shadow-2xl z-50 transition-all duration-300 ${
                isExpanded ? 'h-[85vh]' : 'h-[72px]'
            } ${className}`}
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
        >
            <div className="h-[72px] flex items-center px-4 gap-3 relative">
                <div className="flex items-center gap-3 min-w-[180px] flex-shrink-0">
                    <div className="relative w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {currentTrack?.coverArtUrl ? (
                            <img
                                src={currentTrack.coverArtUrl}
                                alt={currentTrack.title}
                                className="w-full h-full object-cover"
                                onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                }}
                            />
                        ) : (
                            <FiMusic className="w-6 h-6 text-primary" />
                        )}
                        {isPlaying && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <h4 className="font-semibold text-sm truncate text-white">
                            {currentTrack?.title || 'No Track'}
                        </h4>
                        <p className="text-xs text-gray-400 truncate">
                            {currentTrack?.artist || 'Unknown Artist'}
                            {currentTrack?.album && ` • ${currentTrack.album}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={toggleShuffle}
                        className={`p-2 rounded-lg transition ${
                            isShuffled ? 'text-primary' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Shuffle"
                    >
                        <FiShuffle className="w-4 h-4" />
                    </button>
                    <button
                        onClick={playPrevious}
                        className="p-2 rounded-lg hover:bg-white/5 transition text-gray-400 hover:text-white"
                        title="Previous"
                    >
                        <FiSkipBack className="w-5 h-5" />
                    </button>
                    <button
                        onClick={togglePlay}
                        disabled={isBuffering}
                        className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/30 transition-all duration-300 flex items-center justify-center disabled:opacity-50"
                    >
                        {isBuffering ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : isPlaying ? (
                            <FiPause className="w-6 h-6" />
                        ) : (
                            <FiPlay className="w-6 h-6 ml-0.5" />
                        )}
                    </button>
                    <button
                        onClick={playNext}
                        className="p-2 rounded-lg hover:bg-white/5 transition text-gray-400 hover:text-white"
                        title="Next"
                    >
                        <FiSkipForward className="w-5 h-5" />
                    </button>
                    <button
                        onClick={toggleRepeat}
                        className={`p-2 rounded-lg transition ${
                            repeatMode !== 'none' ? 'text-primary' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Repeat"
                    >
                        <FiRepeat className="w-4 h-4" />
                        {repeatMode === 'one' && (
                            <span className="absolute -top-1 -right-1 text-[8px] font-bold">1</span>
                        )}
                    </button>
                </div>

                <div className="flex-1 flex items-center gap-3 min-w-[120px]">
                    <span className="text-xs text-gray-400 font-mono tabular-nums w-12">
                        {formatDuration(currentTime)}
                    </span>
                    <div className="flex-1 relative group">
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-100"
                                style={{ width: `${Math.min(100, progress)}%` }}
                            />
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={progress}
                            onChange={handleSeek}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <span className="text-xs text-gray-400 font-mono tabular-nums w-12">
                        {formatDuration(duration)}
                    </span>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={toggleFavorite}
                        className={`p-2 rounded-lg transition ${
                            isFavorite ? 'text-red-500' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Add to favorites"
                    >
                        <FiHeart className={`w-4 h-4 ${isFavorite ? 'fill-red-500' : ''}`} />
                    </button>

                    <button
                        onClick={() => setShowPlaylist((prev) => !prev)}
                        className={`p-2 rounded-lg transition ${
                            showPlaylist ? 'text-primary' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Toggle playlist"
                    >
                        <FiList className="w-4 h-4" />
                    </button>

                    <button
                        onClick={() => setIsExpanded((prev) => !prev)}
                        className="p-2 rounded-lg hover:bg-white/5 transition text-gray-400 hover:text-white"
                        title="Expand"
                    >
                        {isExpanded ? <FiMinimize2 className="w-4 h-4" /> : <FiMaximize2 className="w-4 h-4" />}
                    </button>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition"
                            title="Close"
                        >
                            <FiX className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'calc(100% - 72px)' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="h-full flex flex-col">
                            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
                                <div className="flex flex-col items-center justify-center space-y-4">
                                    <div className="w-48 h-48 rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shadow-2xl">
                                        {currentTrack?.coverArtUrl ? (
                                            <img
                                                src={currentTrack.coverArtUrl}
                                                alt={currentTrack.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <FiMusic className="w-24 h-24 text-primary/50" />
                                        )}
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-xl font-bold text-white">
                                            {currentTrack?.title || 'No Track'}
                                        </h3>
                                        <p className="text-gray-400">
                                            {currentTrack?.artist || 'Unknown Artist'}
                                        </p>
                                        {currentTrack?.album && (
                                            <p className="text-sm text-gray-500">
                                                {currentTrack.album}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col items-center justify-center space-y-6">
                                    <div className="flex items-center gap-3 w-full max-w-xs">
                                        <button
                                            onClick={toggleMute}
                                            className="p-1 hover:bg-white/5 rounded"
                                        >
                                            {isMuted || volume === 0 ? (
                                                <FiVolumeX className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <FiVolume2 className="w-5 h-5" />
                                            )}
                                        </button>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={isMuted ? 0 : volume}
                                            onChange={handleVolumeChange}
                                            className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                                        />
                                        <span className="text-xs text-gray-400 w-8">
                                            {volume}%
                                        </span>
                                    </div>

                                    {error && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                            {error}
                                        </div>
                                    )}

                                    <div className="text-center text-sm text-gray-400">
                                        <p>Duration: {formatDuration(duration)}</p>
                                        <p>Played: {formatDuration(currentTime)}</p>
                                    </div>
                                </div>

                                <div className="overflow-y-auto">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-semibold text-white">
                                            Queue ({queue.length})
                                        </h3>
                                        <button
                                            onClick={clearQueue}
                                            className="text-xs text-gray-400 hover:text-red-400 transition"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {queue.map((track, index) => (
                                            <div
                                                key={track.id || `${track.title}-${index}`}
                                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition ${
                                                    currentTrack?.id === track.id
                                                        ? 'bg-primary/20 border border-primary/30'
                                                        : 'hover:bg-white/5'
                                                }`}
                                                onClick={() => playTrack(track)}
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                                    <FiMusic className="w-4 h-4 text-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate text-white">
                                                        {track.title}
                                                    </p>
                                                    <p className="text-xs text-gray-400 truncate">
                                                        {track.artist || 'Unknown'}
                                                    </p>
                                                </div>
                                                <span className="text-xs text-gray-400">
                                                    {formatDuration(track.duration)}
                                                </span>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        removeFromQueue(track.id);
                                                    }}
                                                    className="p-1 hover:bg-white/10 rounded transition text-gray-400 hover:text-red-400"
                                                >
                                                    <FiX className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {queue.length === 0 && (
                                            <div className="text-center text-gray-500 py-8">
                                                <p>Queue is empty</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default RavenMusicPlayer;
