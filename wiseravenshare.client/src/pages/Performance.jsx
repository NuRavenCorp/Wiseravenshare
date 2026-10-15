import React from "react";
import Navbar from "@/components/landing/Navbar";
import ContentPerformance from "@/components/dashboard/ContentPerformance";

export default function Performance() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-12">
        <h1 className="font-heading text-3xl text-foreground mb-6 text-glow">
          Performance Dashboard
        </h1>
        <ContentPerformance />
      </div>
    </div>
  );
}