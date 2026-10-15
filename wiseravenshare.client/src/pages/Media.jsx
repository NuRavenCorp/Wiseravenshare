import React, { useState } from "react";
import Navbar from "@/components/landing/Navbar";
import { Video, Music, Radio, Globe, Mic, SatelliteDish, Film } from "lucide-react";
import VideoPlayer from "@/components/media/VideoPlayer";
import VideoLibrary from "@/components/media/VideoLibrary";
import MusicPlayer from "@/components/media/MusicPlayer";
import RadioPlayer from "@/components/media/RadioPlayer";
import StationFinder from "@/components/media/StationFinder";
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
  { id: "stations", label: "FM Stations", icon: Globe },
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
        <h1 className="font-heading text-3xl text-foreground mb-6 text-glow">FM Radio & Media</h1>
        <div className="flex gap-1 mb-6 border-b border-border">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
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
            <MusicPlayer />
            <JamCalendar />
            <JamSessionPanel />
          </div>
        )}
        {tab === "radio" && <RadioPlayer />}
        {tab === "stations" && <StationFinder />}
        {tab === "karaoke" && <KaraokeExtractor />}
        {tab === "live" && <LiveStreamPanel />}
        {tab === "rights" && <RightsManager />}
        {tab === "drm" && <DRMManager />}
        {tab === "cloud" && <CloudMediaPanel />}
      </div>
    </div>
  );
}