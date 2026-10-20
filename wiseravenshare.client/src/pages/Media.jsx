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
  const { openMedia } = useMediaExperience();

  useEffect(() => {
    if (tab !== "music") return;
    setTracksLoading(true);
    apiClient.ravensightMedia.listMusic()
      .then((res) => setTracks(res || []))
      .catch(() => setTracks([]))
      .finally(() => setTracksLoading(false));
  }, [tab]);

  const playTrack = (track, allTracks) => {
    openMedia({
      ...track,
      type: "music",
      url: track.mediaUrl || track.file_uri || track.url || "",
      queue: allTracks,
    });
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
                setTracksLoading(true);
                apiClient.ravensightMedia.listMusic()
                  .then((res) => setTracks(res || []))
                  .catch(() => {})
                  .finally(() => setTracksLoading(false));
              }} />
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
