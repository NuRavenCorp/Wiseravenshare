import React, { useState, useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import VideoPlayer from "@/components/media/VideoPlayer";
import VideoLibrary from "@/components/media/VideoLibrary";
import MediaUpload from "@/components/media/MediaUpload";
import FMRadioPage from "@/pages/FMRadioPage";
import KaraokeExtractor from "@/components/media/KaraokeExtractor";
import JamSessionPanel from "@/components/media/JamSessionPanel";
import JamCalendar from "@/components/media/JamCalendar";
import LiveStreamPanel from "@/components/media/LiveStreamPanel";
import RightsManager from "@/components/media/RightsManager";
import DRMManager from "@/components/media/DRMManager";
import CloudMediaPanel from "@/components/media/CloudMediaPanel";
import { useMediaExperience } from "@/components/media/MediaExperience";
import { apiClient } from "@/api/client";
import { Play, Music, Loader2 } from "lucide-react";

const tabs = [
  { id: "video", label: "Video" },
  { id: "video-library", label: "Video Library" },
  { id: "music", label: "Music" },
  { id: "radio", label: "FM Radio" },
  { id: "karaoke", label: "Karaoke" },
  { id: "live", label: "WiseRavenShare Live" },
  { id: "rights", label: "Rights" },
  { id: "drm", label: "DRM" },
  { id: "cloud", label: "Cloud" },
];

export default function Media() {
  const [tab, setTab] = useState("video");
  const [tracks, setTracks] = useState([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState(new Set());
  const { openMedia } = useMediaExperience();

  useEffect(() => {
    if (tab !== "music") return;
    setTracksLoading(true);
    apiClient.ravensightMedia.listMusic()
      .then((res) => setTracks(res || []))
      .catch(() => setTracks([]))
      .finally(() => setTracksLoading(false));
  }, [tab]);

  useEffect(() => {
    setSelectedTrackIds((prev) => {
      const validIds = new Set((tracks || []).map((track) => track.id));
      const next = new Set();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [tracks]);

  const playTrack = (track, allTracks) => {
    openMedia({
      ...track,
      type: "music",
      url: track.mediaUrl || track.file_uri || track.url || "",
      queue: allTracks,
    });
  };

  const shuffleTracks = (list) => {
    const next = [...list];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  };

  const toggleTrackSelection = (trackId) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  };

  const selectAllTracks = () => {
    setSelectedTrackIds(new Set(tracks.map((track) => track.id)));
  };

  const clearTrackSelection = () => {
    setSelectedTrackIds(new Set());
  };

  const playSelectedTracksInOrder = () => {
    const selected = tracks.filter((track) => selectedTrackIds.has(track.id));
    if (!selected.length) return;
    playTrack(selected[0], selected);
  };

  const playSelectedTracksShuffled = () => {
    const selected = tracks.filter((track) => selectedTrackIds.has(track.id));
    if (!selected.length) return;
    const shuffled = shuffleTracks(selected);
    playTrack(shuffled[0], shuffled);
  };

  const playAllTracksInOrder = () => {
    if (!tracks.length) return;
    playTrack(tracks[0], tracks);
  };

  const playAllTracksShuffled = () => {
    if (!tracks.length) return;
    const shuffled = shuffleTracks(tracks);
    playTrack(shuffled[0], shuffled);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-8">
        <div className="mb-6">
          <h1 className="font-heading text-3xl text-foreground mb-2 text-glow">FM Radio & Media</h1>
          <p className="text-sm text-muted-foreground">Your music, radio, and media tools in one place.</p>
        </div>
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {tabs.map((t) => {
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {tab === "video" && <VideoPlayer />}
        {tab === "video-library" && <VideoLibrary />}
        {tab === "music" && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm">
              <header className="mb-5">
                <h2 className="text-xl font-semibold text-foreground">My Music</h2>
                <p className="mt-1 text-sm text-muted-foreground">Upload tracks to your library, then double-click or press ▶ to play.</p>
              </header>
              <MediaUpload type="music" onUploaded={() => {
                setSelectedTrackIds(new Set());
                setTracksLoading(true);
                apiClient.ravensightMedia.listMusic()
                  .then((res) => setTracks(res || []))
                  .catch(() => {})
                  .finally(() => setTracksLoading(false));
              }} />
              {tracks.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={playAllTracksInOrder} disabled={!tracks.length} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50">Play all (order)</button>
                  <button type="button" onClick={playAllTracksShuffled} disabled={!tracks.length} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50">Play all (shuffle)</button>
                  <button type="button" onClick={selectAllTracks} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50">Select all</button>
                  <button type="button" onClick={clearTrackSelection} disabled={!selectedTrackIds.size} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50">Clear</button>
                  <button type="button" onClick={playSelectedTracksInOrder} disabled={!selectedTrackIds.size} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50">Play selected (order)</button>
                  <button type="button" onClick={playSelectedTracksShuffled} disabled={!selectedTrackIds.size} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground hover:bg-secondary/50 disabled:opacity-50">Play selected (shuffle)</button>
                  <span className="text-xs text-muted-foreground">{selectedTrackIds.size} selected</span>
                </div>
              )}
              <div className="mt-4 space-y-1">
                {tracksLoading && (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
                )}
                {!tracksLoading && tracks.length === 0 && (
                  <div className="rounded-lg border border-border bg-card p-8 text-center">
                    <Music className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No tracks yet. Upload music above to start listening.</p>
                  </div>
                )}
                {tracks.map((t) => (
                  <div
                    key={t.id}
                    onDoubleClick={() => playTrack(t, tracks)}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-secondary/50 cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={selectedTrackIds.has(t.id)}
                      onChange={() => toggleTrackSelection(t.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="accent-primary"
                    />
                    <button
                      onClick={() => playTrack(t, tracks)}
                      className="w-8 h-8 rounded bg-secondary flex items-center justify-center shrink-0 hover:bg-primary/20"
                      aria-label={`Play ${t.title}`}
                    >
                      <Play className="w-3.5 h-3.5 text-primary" />
                    </button>
                    <span className="text-sm text-foreground truncate flex-1">
                      {t.title || t.fileName || "Untitled track"}
                    </span>
                    {t.artist && <span className="text-xs text-muted-foreground truncate hidden sm:block">{t.artist}</span>}
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-5">
              <header>
                <h2 className="text-xl font-semibold text-foreground">Jam Sessions</h2>
                <p className="mt-1 text-sm text-muted-foreground">Plan upcoming sessions and connect with other musicians.</p>
              </header>
              <JamCalendar />
              <JamSessionPanel />
            </section>
          </div>
        )}
        {tab === "radio" && <FMRadioPage />}
        {tab === "karaoke" && <KaraokeExtractor />}
        {tab === "live" && <LiveStreamPanel />}
        {tab === "rights" && <RightsManager />}
        {tab === "drm" && <DRMManager />}
        {tab === "cloud" && <CloudMediaPanel />}
      </div>
    </div>
  );
}
