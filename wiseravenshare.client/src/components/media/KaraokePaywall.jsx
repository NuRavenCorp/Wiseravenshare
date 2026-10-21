import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, RefreshCw, CheckCircle, Mic, Music2, FileText, Tv2, Share2, Wand2, Star } from "lucide-react";
import { apiClient } from "@/api/client";

const KARAOKE_PRICE = 4.99;
const PAYWALL_BYPASS_TEAM_ROLES = new Set([
  "owner",
  "producer",
  "host",
  "editor",
  "script-lead",
  "creator",
  "radio-station-creator",
  "radiostation-creator",
  "karaoke-creator",
]);

const DEMO_LINES = [
  { text: "🎵  We built this city on rock and roll 🎵", active: true  },
  { text: "Built this city, built this city on rock…",  active: false },
  { text: "Someone's always playing corporation games",  active: false },
];

export default function KaraokePaywall({ children, currentUser, onAuthRequired }) {
  const [hasAccess, setHasAccess] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");
  const [demoLine, setDemoLine] = useState(0);

  useEffect(() => {
    if (!currentUser) { setHasAccess(false); return; }

    const teamRole = String(currentUser.teamRole || currentUser.role || "").toLowerCase();
    const hasBypassRole = currentUser.isAdmin
      || currentUser.adminPassActive
      || String(currentUser.accessScope || "").toLowerCase() === "admin"
      || PAYWALL_BYPASS_TEAM_ROLES.has(teamRole);

    if (hasBypassRole) {
      setHasAccess(true);
      return;
    }

    Promise.allSettled([
      apiClient.billing.getSubscription(),
      apiClient.entities.KaraokePayment.filter(
        { user_id: currentUser.id, status: { $in: ["active", "pending"] } },
        { limit: 1 }
      ),
    ])
      .then(([subscriptionResult, karaokeResult]) => {
        const hasActiveSubscription = subscriptionResult.status === "fulfilled"
          && Boolean(subscriptionResult.value?.hasActiveSubscription);
        const items = karaokeResult.status === "fulfilled"
          ? (karaokeResult.value?.items || [])
          : [];
        const hasKaraokePayment = items.length > 0 && items[0].status === "active";
        setHasAccess(hasActiveSubscription || hasKaraokePayment);
      })
      .catch(() => setHasAccess(false));
  }, [currentUser?.id, currentUser?.teamRole, currentUser?.role, currentUser?.accessScope, currentUser?.isAdmin, currentUser?.adminPassActive]);

  // Animate demo lyrics line
  useEffect(() => {
    if (hasAccess) return;
    const t = setInterval(() => setDemoLine((l) => (l + 1) % DEMO_LINES.length), 2200);
    return () => clearInterval(t);
  }, [hasAccess]);

  const handleCheckout = async () => {
    if (!currentUser) return onAuthRequired?.();
    setError("");
    const isFramed = window.self !== window.top;
    const checkoutTab = isFramed ? window.open("", "_blank") : null;
    if (isFramed && !checkoutTab) { setError("Allow popups to continue to checkout."); return; }
    if (checkoutTab) checkoutTab.opener = null;
    setCheckoutLoading(true);
    try {
      const res = await apiClient.functions.invoke("CreateKaraokeCheckout", {});
      const url = res.data?.url;
      if (!url) throw new Error("No checkout URL returned");
      if (checkoutTab) checkoutTab.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      checkoutTab?.close();
      setError(e?.response?.data?.error || e?.message || "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (hasAccess === null) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  if (hasAccess) return <>{children}</>;

  return (
    <div className="space-y-5 max-w-2xl mx-auto">

      {/* Hero + animated lyrics demo */}
      <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/8 to-transparent overflow-hidden">
        <div className="px-6 pt-6 pb-4 text-center">
          <div className="text-4xl mb-3">🎤</div>
          <h3 className="font-heading text-xl text-foreground mb-1">Karaoke Studio</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            Extract lyrics from any track, follow along in real time, and share your performance.
          </p>
        </div>

        {/* Animated lyrics preview */}
        <div className="mx-6 mb-6 rounded-xl border border-border bg-black/60 p-5 min-h-[100px] flex flex-col justify-center items-center gap-2">
          {DEMO_LINES.map((line, i) => (
            <p
              key={i}
              className={`text-center transition-all duration-500 ${
                i === demoLine
                  ? "text-primary font-semibold text-base scale-105"
                  : "text-muted-foreground/40 text-sm scale-100"
              }`}
            >
              {line.text}
            </p>
          ))}
          <p className="text-[10px] text-muted-foreground/40 mt-1">— preview only —</p>
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 flex flex-col items-center gap-3">
          <Button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="w-full max-w-xs h-auto py-3 text-base font-semibold"
          >
            {checkoutLoading
              ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
              : <Mic className="w-4 h-4 mr-2" />
            }
            Unlock Karaoke — ${KARAOKE_PRICE}/mo
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Cancel any time · No contracts</p>
        </div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { Icon: Wand2,     label: "AI Lyric Extraction",   body: "Auto-transcribe vocals from any uploaded track or video clip." },
          { Icon: Tv2,       label: "Live Scroll Display",   body: "Lyrics scroll line-by-line in sync as you play — karaoke-style." },
          { Icon: Music2,    label: "Full Library Access",   body: "Use any track from your Music Library or upload a new one on the spot." },
          { Icon: FileText,  label: "Editable Lyrics",       body: "Fix errors, add timing cues, and save your corrected lyrics." },
          { Icon: Share2,    label: "Share Your Performance",body: "Record and share karaoke sessions directly to your social channels." },
          { Icon: Star,      label: "Unlimited Sessions",    body: "No per-song charges — extract and replay as many tracks as you want." },
        ].map(({ Icon, label, body }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs font-semibold text-foreground">{label}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">{body}</p>
          </div>
        ))}
      </div>

      {/* Reassurance strip */}
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        {[
          { Icon: CheckCircle, text: "No contracts" },
          { Icon: RefreshCw,   text: "Cancel any time" },
          { Icon: Lock,        text: "Secure checkout" },
        ].map(({ Icon, text }) => (
          <div key={text} className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 text-primary" />
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}