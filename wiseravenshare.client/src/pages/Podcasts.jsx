import React from "react";
import Navbar from "@/components/landing/Navbar";
import PodcastsPanel from "@/components/ravensight/PodcastsPanel";

export default function Podcasts() {
  return (
    <div className="min-h-screen bg-background bg-grain">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        <PodcastsPanel />
      </div>
    </div>
  );
}