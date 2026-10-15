import React from "react";
import Navbar from "@/components/landing/Navbar";
import JournalismPanel from "@/components/ravensight/JournalismPanel";
import JournalismStatusBoard from "@/components/ravensight/JournalismStatusBoard";
import TruthLeaderboard from "@/components/journalism/TruthLeaderboard";

export default function JournalismDashboard() {
  return (
    <div className="min-h-screen bg-background bg-grain">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 pt-28 pb-16">
        <h1 className="font-heading text-3xl text-foreground mb-8">
          Journalism Dashboard
        </h1>
        <div className="mb-12">
          <JournalismStatusBoard />
        </div>
        <div className="mb-12">
          <TruthLeaderboard />
        </div>
        <JournalismPanel />
      </div>
    </div>
  );
}