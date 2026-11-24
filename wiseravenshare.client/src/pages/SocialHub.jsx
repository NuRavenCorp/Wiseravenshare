import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectionCard from "@/components/social/ConnectionCard";
import CrossPostComposer from "@/components/social/CrossPostComposer";
import ImportPanel from "@/components/social/ImportPanel";
import SystemFeedSection from "@/components/social/SystemFeedSection";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import TodaysVibe from "@/components/vibe/TodaysVibe";
import LimitationsNotice from "@/components/social/LimitationsNotice";
import SavedAvatarPhotoContainer from "@/components/media/SavedAvatarPhotoContainer";
import TheFlockCreatorsShelf from "@/components/social/TheFlockCreatorsShelf";
import FollowStatsHero from "@/components/dashboard/FollowStatsHero";
import { Share2, Download, Feather, Link2, CheckCircle2, Circle } from "lucide-react";
import PostComposer from "@/components/feed/PostComposer";
import PostsFeed from "@/components/feed/PostsFeed";
import LiveNowCarousel from "@/components/live/LiveNowCarousel";

// All supported platforms — order determines display sequence
const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube", "twitter", "bluesky", "linkedin", "reddit"];

export default function SocialHub() {
  const [platformStatuses, setPlatformStatuses] = useState({});
  const [platformAccounts, setPlatformAccounts] = useState({});
  // Don't block the page on this — load statuses in the background.
  // The Feed tab renders immediately; Connect tab shows statuses when ready.

  const fetchStatuses = useCallback(async () => {
    try {
      const data = await apiClient.social.getAllPlatformStatuses();
      setPlatformStatuses(data || {});
    } catch {
      setPlatformStatuses({});
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiClient.functions.invoke("SocialGetAccounts");
      if (res?.data) setPlatformAccounts(res.data);
    } catch {
      // non-critical — CrossPostComposer will fall back to its own fetch
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchStatuses(), fetchAccounts()]);
  }, [fetchStatuses, fetchAccounts]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const connectedCount = Object.values(platformStatuses).filter(s => s?.connected).length;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="font-heading text-4xl text-foreground mb-2 text-glow">Your Social Hub</h1>
          <p className="text-muted-foreground">Follow creators, share posts, explore what is trending, and connect your other social accounts.</p>
        </div>
        <TheFlockCreatorsShelf />
        <FollowStatsHero />
        <LimitationsNotice />
        <div className="mb-8">
          <TodaysVibe />
        </div>
        {/* Prominently Featured Saved Avatar & Photo Upload Vault */}
        <div className="mb-8">
          <SavedAvatarPhotoContainer />
        </div>
        <Tabs defaultValue="feed">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="feed" className="flex items-center gap-2">
              <Feather className="w-4 h-4" /> Feed
            </TabsTrigger>
            <TabsTrigger value="connect" className="flex items-center gap-2 relative">
              <Link2 className="w-4 h-4" /> Connect
              {connectedCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1">
                  {connectedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Feather className="w-4 h-4" /> Create
            </TabsTrigger>
            <TabsTrigger value="push" className="flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Cross-Post
            </TabsTrigger>
            <TabsTrigger value="pull" className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Import
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-8">
            <LiveNowCarousel />
            <PostsFeed />
            <SystemFeedSection />
          </TabsContent>

          <TabsContent value="connect">
            <div className="space-y-5">
              {/* Summary banner */}
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {connectedCount > 0
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
                    }
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {connectedCount === 0
                        ? "No accounts connected yet"
                        : `${connectedCount} of ${PLATFORMS.length} platform${connectedCount !== 1 ? "s" : ""} connected`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connect your social accounts to <strong>post text, images &amp; video</strong> across all platforms
                      from one place — and import your existing content into WiseRavenShare.
                    </p>
                    {connectedCount > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {PLATFORMS.map(p => {
                          const s = platformStatuses[p];
                          return s?.connected ? (
                            <span key={p} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" />
                              {p.charAt(0).toUpperCase() + p.slice(1)}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {PLATFORMS.map((platform) => (
                  <ConnectionCard
                    key={platform}
                    platform={platform}
                    onStatusChange={refreshAll}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="create">
            <PostComposer />
          </TabsContent>
          <TabsContent value="push">
            <CrossPostComposer platformStatuses={platformStatuses} accounts={platformAccounts} onRefreshStatuses={refreshAll} />
          </TabsContent>
          <TabsContent value="pull">
            <ImportPanel />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}
