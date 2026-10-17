import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Mic, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import MediaManager from "@/components/media/MediaManager";
import KaraokePaywall from "@/components/media/KaraokePaywall";

export default function KaraokeExtractor({ currentUser, onAuthRequired }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  const fetchTracks = useCallback(async () => {
    try {
      const res = await apiClient.ravensightMedia.listMusic();
      setTracks(res || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks();
  }, [fetchTracks]);

  const handleUpload = async (files) => {
    setUploading(true);
    try {
      for (const file of files) {
        await apiClient.ravensightMedia.uploadMusic(file, {
          title: file.name.replace(/\.[^/.]+$/, ""),
          destinationFolder: "karaoke",
        });
      }
      await fetchTracks();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (idx) => {
    const track = trackItems[idx];
    if (!track?.id) return;
    await apiClient.ravensightMedia.deleteMusic(track.id);
    if (selected === track.id) setSelected("");
    await fetchTracks();
  };

  const trackItems = tracks.map((t) => ({
    url: t.mediaUrl,
    type: "music",
    title: t.title,
    id: t.id,
  }));

  const handleExtract = async () => {
    if (!selected) return;
    setExtracting(true);
    setError(null);
    setLyrics(null);
    try {
      const track = tracks.find((t) => t.id === selected);
      const res = await apiClient.functions.invoke("ExtractLyrics", { file_uri: track.mediaUrl });
      if (res.data?.error) throw new Error(res.data.error);
      setLyrics(res.data?.lyrics);
    } catch (e) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <KaraokePaywall currentUser={currentUser} onAuthRequired={onAuthRequired}>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mic className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">Karaoke Tracks</span>
        </div>
        <MediaManager
          items={trackItems}
          onUpload={handleUpload}
          onDelete={handleDelete}
          accept="audio/*"
          uploading={uploading}
          emptyText="No tracks uploaded yet"
        />
      </div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">Karaoke Word Extraction</span>
        </div>
        <p className="text-xs text-muted-foreground">Select a track from your library and extract words for Ravensight karaoke.</p>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
        >
          <option value="">Select a track...</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <Button onClick={handleExtract} disabled={!selected || extracting}>
          {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          {extracting ? "Extracting words..." : "Extract Words"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {lyrics && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
          <p className="text-xs font-medium text-accent mb-2">Extracted Words</p>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{lyrics}</p>
          </div>
        </div>
      )}
      </KaraokePaywall>
    </div>
  );
}