import React, { useState, useEffect } from "react";
import Navbar from "@/components/landing/Navbar";
import { useAuth } from "@/lib/AuthContext";
import { Radio, Mic, Mic2, Newspaper, Film } from "lucide-react";
import PodcastsPanel from "@/components/ravensight/PodcastsPanel";
import RavensightBoard from "@/components/ravensight/RavensightBoard";
import KaraokeExtractor from "@/components/media/KaraokeExtractor";
import JournalismPanel from "@/components/ravensight/JournalismPanel";
import RavensightMedia from "@/components/ravensight/RavensightMedia";
import { apiClient } from "@/api/client";
import { KanbanSquare } from "lucide-react";

const TABS = [
  { id: "podcasts", label: "Podcasts", icon: Mic },
  { id: "board", label: "Board", icon: KanbanSquare },
  { id: "karaoke", label: "Karaoke", icon: Mic2 },
  { id: "journalism", label: "Journalism", icon: Newspaper },
  { id: "media", label: "Media", icon: Film },
];

export default function Ravensight() {
  const [tab, setTab] = useState("podcasts");
  const { isAuthenticated } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      apiClient.auth.me().then(setCurrentUser).catch(() => {});
    }
  }, [isAuthenticated]);

  const onAuthRequired = () => {
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-background bg-grain">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/30 bg-accent/10 mb-4">
            <Radio className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs tracking-[0.2em] uppercase text-accent/90 font-medium">
              Ravensight
            </span>
          </div>
          <h1 className="font-heading text-3xl text-foreground">
            Ravensight Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The creative engine — multi-camera podcasts, footage workflow,
            karaoke, journalism, and media in one place.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {tab === "podcasts" && <PodcastsPanel />}
        {tab === "board" && <RavensightBoard />}
        {tab === "karaoke" && <KaraokeExtractor currentUser={currentUser} onAuthRequired={onAuthRequired} />}
        {tab === "journalism" && <JournalismPanel />}
        {tab === "media" && <RavensightMedia />}
      </div>
    </div>
  );
}