import React, { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { Video, Music, Radio, Mic, SatelliteDish, Film } from "lucide-react";
import VideoPlayer from "@/components/media/VideoPlayer";
import VideoLibrary from "@/components/media/VideoLibrary";
import MusicPlayer from "@/components/media/MusicPlayer";
import FMRadioPage from "@/pages/FMRadioPage";
import KaraokeExtractor from "@/components/media/KaraokeExtractor";
import JamSessionPanel from "@/components/media/JamSessionPanel";
import JamCalendar from "@/components/media/JamCalendar";
import LiveStreamPanel from "@/components/media/LiveStreamPanel";
import RightsManager from "@/components/media/RightsManager";
import DRMManager from "@/components/media/DRMManager";
import CloudMediaPanel from "@/components/media/CloudMediaPanel";
import { Scale, ShieldCheck, Cloud } from "lucide-react";

const tabs = [
  { id: "video", label: "Video", icon: Video },
  { id: "video-library", label: "Video Library", icon: Film },
  { id: "music", label: "Music", icon: Music },
  { id: "radio", label: "FM Radio", icon: Radio },
  { id: "karaoke", label: "Karaoke", icon: Mic },
  { id: "live", label: "Live", icon: SatelliteDish },
  { id: "rights", label: "Rights", icon: Scale },
  { id: "drm", label: "DRM", icon: ShieldCheck },
  { id: "cloud", label: "Cloud", icon: Cloud },
];

export default function Media() {
  const [tab, setTab] = useState("video");

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
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.id ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
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
                <p className="mt-1 text-sm text-muted-foreground">Upload tracks to your library, then play and manage them here.</p>
              </header>
            <MusicPlayer />
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
