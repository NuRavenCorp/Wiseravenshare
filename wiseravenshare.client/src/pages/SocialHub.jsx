import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConnectionCard from "@/components/social/ConnectionCard";
import CrossPostComposer from "@/components/social/CrossPostComposer";
import ImportPanel from "@/components/social/ImportPanel";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import TodaysVibe from "@/components/vibe/TodaysVibe";
import LimitationsNotice from "@/components/social/LimitationsNotice";
import { Share2, Download, Feather, Link2 } from "lucide-react";
import PostComposer from "@/components/feed/PostComposer";

const PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"];

export default function SocialHub() {
  const [accounts, setAccounts] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await apiClient.functions.invoke("SocialGetAccounts", {});
      setAccounts(res.data);
    } catch {
      setAccounts(null);
    }
  }, []);

  useEffect(() => {
    fetchAccounts().then(() => setLoading(false));
  }, [fetchAccounts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="font-heading text-4xl text-foreground mb-2 text-glow">Social Connections</h1>
          <p className="text-muted-foreground">Connect Instagram, TikTok, YouTube, and the rest of your social stack.</p>
        </div>
        <LimitationsNotice />
        <div className="mb-8">
          <TodaysVibe />
        </div>
        <Tabs defaultValue="connect">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="connect" className="flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Connect
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

          <TabsContent value="connect">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Click <strong>Connect</strong> on each platform to link your account via OAuth. Instagram, TikTok, and YouTube all support the same connect flow.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {PLATFORMS.map((platform) => (
                  <ConnectionCard key={platform} platform={platform} />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="create">
            <PostComposer />
          </TabsContent>
          <TabsContent value="push">
            <CrossPostComposer accounts={accounts} />
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