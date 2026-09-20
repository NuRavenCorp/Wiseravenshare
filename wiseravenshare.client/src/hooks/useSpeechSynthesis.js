import { useCallback, useRef } from 'react';

export function useSpeechSynthesis() {
  const audioRef = useRef(null);

  const speak = useCallback(async (audioBlob) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    audioRef.current = audio;
    await audio.play();
    return audio;
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  return { speak, stop };
}
