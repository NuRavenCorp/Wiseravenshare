import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistedState } from './usePersistedState';

const VOLUME_KEY = 'emp:volume:v1';
const MUTE_KEY = 'emp:mute:v1';
const positionKey = (trackId) => `emp:pos:${trackId}`;

function safeLocalStorage() {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function usePersistedAudio(audioRef, currentTrack, onEnded) {
  const [volume, setVolume] = usePersistedState(VOLUME_KEY, 0.8);
  const [isMuted, setIsMuted] = usePersistedState(MUTE_KEY, false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [error, setError] = useState(null);

  const isDraggingRef = useRef(false);
  const lastSavedRef = useRef(0);
  const volumeBeforeMuteRef = useRef(volume || 0.8);

  useEffect(() => {
    if (!audioRef?.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [audioRef, isMuted, volume]);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio || !currentTrack) return undefined;

    const storage = safeLocalStorage();

    setError(null);
    setIsBuffering(true);
    setCurrentTime(0);
    setDuration(0);

    const handleLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      if (storage && currentTrack.id) {
        const saved = parseFloat(storage.getItem(positionKey(currentTrack.id)) || '0');
        if (Number.isFinite(saved) && saved > 1 && saved < audio.duration - 5) {
          try {
            audio.currentTime = saved;
          } catch {
            // Ignore invalid seeks from stale position values.
          }
        }
      }
      setIsBuffering(false);
    };

    const handleTimeUpdate = () => {
      if (!isDraggingRef.current) {
        setCurrentTime(audio.currentTime);
      }

      const now = Date.now();
      if (storage && currentTrack.id && now - lastSavedRef.current > 5000) {
        lastSavedRef.current = now;
        try {
          storage.setItem(positionKey(currentTrack.id), String(audio.currentTime));
        } catch {
          // Ignore localStorage quota errors.
        }
      }
    };

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => setIsBuffering(false);
    const handleCanPlay = () => setIsBuffering(false);
    const handleError = () => {
      setError(audio.error?.message || 'Playback error');
      setIsBuffering(false);
    };
    const handleEnded = () => {
      if (storage && currentTrack.id) {
        try {
          storage.removeItem(positionKey(currentTrack.id));
        } catch {
          // Ignore localStorage write failures.
        }
      }
      onEnded?.();
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);

      if (storage && currentTrack.id && audio.currentTime > 0) {
        try {
          storage.setItem(positionKey(currentTrack.id), String(audio.currentTime));
        } catch {
          // Ignore localStorage write failures.
        }
      }
    };
  }, [audioRef, currentTrack, onEnded]);

  const seek = useCallback((time) => {
    if (!audioRef?.current) return;
    const clamped = Math.max(0, Math.min(time, duration || 0));
    audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
  }, [audioRef, duration]);

  const skip = useCallback((delta) => {
    if (!audioRef?.current) return;
    seek(audioRef.current.currentTime + delta);
  }, [audioRef, seek]);

  const setVolumeSafe = useCallback((value) => {
    const clamped = Math.max(0, Math.min(1, value));
    setVolume(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
  }, [isMuted, setIsMuted, setVolume]);

  const toggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      setVolume(volumeBeforeMuteRef.current || 0.8);
    } else {
      volumeBeforeMuteRef.current = volume;
      setIsMuted(true);
    }
  }, [isMuted, setIsMuted, setVolume, volume]);

  return {
    volume,
    isMuted,
    duration,
    currentTime,
    isBuffering,
    error,
    isDraggingRef,
    seek,
    skip,
    setVolume: setVolumeSafe,
    toggleMute,
  };
}

