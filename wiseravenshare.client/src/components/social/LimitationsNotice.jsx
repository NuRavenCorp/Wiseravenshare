import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Info, Facebook, Instagram, Linkedin, Music2, AlertTriangle } from "lucide-react";

const STORAGE_KEY = "wrs_social_limitations_acknowledged_v1";

const LIMITATIONS = [
  { platform: "Facebook Pages", icon: Facebook, limitation: "Posts published as text-only feed posts. Photo and video uploads are not supported in this version." },
  { platform: "Instagram Business", icon: Instagram, limitation: "Requires a publicly accessible media URL to publish. You provide the image or video link." },
  { platform: "TikTok", icon: Music2, limitation: "Read-only. TikTok's API does not support content uploads; profile and video stats are viewable only." },
  { platform: "LinkedIn", icon: Linkedin, limitation: "Posts published as text updates to your professional network. Media attachments are not supported in this version." },
];

export default function LimitationsNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch { /* ignore */ }
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="bg-card border-border max-w-lg w-full relative">
        <button onClick={dismiss} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <CardHeader>
          <CardTitle className="font-heading text-2xl flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" /> Platform Limitations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            WiseRavenShare cross-posts to shared community accounts. Each platform has different capabilities — please review before posting.
          </p>
          <div className="space-y-3">
            {LIMITATIONS.map((l) => {
              const Icon = l.icon;
              return (
                <div key={l.platform} className="flex gap-3 p-3 rounded-lg border border-border bg-secondary/20">
                  <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{l.platform}</p>
                    <p className="text-xs text-muted-foreground">{l.limitation}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80">All posts go to the shared community accounts. Be respectful — this is a shared space.</p>
          </div>
          <Button onClick={dismiss} className="w-full">Got it</Button>
        </CardContent>
      </Card>
    </div>
  );
}