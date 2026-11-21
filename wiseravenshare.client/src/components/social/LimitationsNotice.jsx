import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Info, Facebook, Instagram, Linkedin, Music2 } from "lucide-react";

const STORAGE_KEY = "wrs_social_limitations_acknowledged_v1";

const LIMITATIONS = [
  { platform: "Facebook", icon: Facebook, limitation: "Log in at Facebook with your username/password, then grant the permissions Facebook requests so we can post on your behalf." },
  { platform: "Instagram", icon: Instagram, limitation: "Log in at Instagram with your username/password. We need media permissions — just check the boxes Instagram shows you." },
  { platform: "TikTok", icon: Music2, limitation: "Log in at TikTok with your username/password and approve sharing permissions. Read-only sync is available even without upload access." },
  { platform: "LinkedIn", icon: Linkedin, limitation: "Log in at LinkedIn with your username/password, then grant the permissions shown to allow posting to your profile." },
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
            Connect <strong>your personal accounts</strong> so WiseRavenShare can post to them on your behalf. Each platform handles sign-in on its own secure page with your username/password and asks for your consent checkboxes there.
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
          <div className="flex items-start gap-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
            <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              WiseRavenShare only posts content <strong>you explicitly send</strong>. You can disconnect any account at any time.
            </p>
          </div>
          <Button onClick={dismiss} className="w-full">Got it</Button>
        </CardContent>
      </Card>
    </div>
  );
}