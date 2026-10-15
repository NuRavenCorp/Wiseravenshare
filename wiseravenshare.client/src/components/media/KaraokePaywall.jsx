import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, RefreshCw, CheckCircle, Mic } from "lucide-react";
import { apiClient } from "@/api/client";

const KARAOKE_PRICE = 4.99;

export default function KaraokePaywall({ children, currentUser, onAuthRequired }) {
  const [hasAccess, setHasAccess] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) {
      setHasAccess(false);
      return;
    }
    apiClient.entities.KaraokePayment.filter({
      user_id: currentUser.id,
      status: { $in: ["active", "pending"] },
    }, { limit: 1 })
      .then((res) => {
        const items = res.items || [];
        setHasAccess(items.length > 0 && items[0].status === "active");
      })
      .catch(() => setHasAccess(false));
  }, [currentUser?.id]);

  const handleCheckout = async () => {
    if (!currentUser) return onAuthRequired?.();
    setError("");
    const isFramed = window.self !== window.top;
    const checkoutTab = isFramed ? window.open("", "_blank") : null;
    if (isFramed && !checkoutTab) {
      setError("Allow popups to continue to checkout.");
      return;
    }
    if (checkoutTab) checkoutTab.opener = null;

    setCheckoutLoading(true);
    try {
      const res = await apiClient.functions.invoke("CreateKaraokeCheckout", {});
      const url = res.data?.url;
      if (!url) throw new Error("No checkout URL returned");
      if (checkoutTab) {
        checkoutTab.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      checkoutTab?.close();
      setError(e?.response?.data?.error || e?.message || "Checkout failed");
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (hasAccess === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-xl border border-primary/30 bg-gradient-to-b from-primary/5 to-transparent text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-primary" />
          <h3 className="font-heading text-lg text-foreground">
            Unlock Karaoke Studio
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          Upload tracks, extract lyrics, and access the full Ravensight karaoke toolkit
          for just {KARAOKE_PRICE}/month.
        </p>
        <div className="flex justify-center">
          <Button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="flex flex-col items-center gap-1 h-auto py-4 px-8"
          >
            {checkoutLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <RefreshCw className="w-5 h-5" />
            )}
            <span className="text-base font-semibold">${KARAOKE_PRICE}/mo</span>
            <span className="text-xs opacity-80">Monthly Subscription</span>
          </Button>
        </div>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: Mic, label: "Unlimited Track Uploads" },
          { icon: RefreshCw, label: "AI Word Extraction" },
          { icon: CheckCircle, label: "Cancel Anytime" },
        ].map((f, i) => {
          const Icon = f.icon;
          return (
            <div key={i} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
              <Icon className="w-4 h-4 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground">{f.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}