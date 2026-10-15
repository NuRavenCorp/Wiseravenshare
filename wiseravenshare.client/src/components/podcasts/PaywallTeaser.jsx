import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Lock,
  CreditCard,
  RefreshCw,
  CheckCircle,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";

export default function PaywallTeaser({
  podcast,
  hasAccess,
  isTeamMember,
}) {
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    if (podcast.teaser_video_uri) {
      getPlayableUrl(podcast.teaser_video_uri).then(setVideoUrl);
    } else {
      setVideoUrl(null);
    }
  }, [podcast.teaser_video_uri]);

  const handleCheckout = async (paymentType) => {
    setError("");
    const isFramed = window.self !== window.top;
    const checkoutTab = isFramed ? window.open("", "_blank") : null;
    if (isFramed && !checkoutTab) {
      setError("Allow popups to continue to checkout.");
      return;
    }
    if (checkoutTab) checkoutTab.opener = null;

    setCheckoutLoading(paymentType);
    try {
      const res = await apiClient.functions.invoke("CreatePodcastCheckout", {
        podcast_id: podcast.id,
        payment_type: paymentType,
      });
      const url = res.data?.url;
      if (!url) throw new Error("No checkout URL returned");
      if (checkoutTab) {
        checkoutTab.location.replace(url);
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      checkoutTab?.close();
      setError(
        e?.response?.data?.error || e?.message || "Checkout failed"
      );
    } finally {
      setCheckoutLoading(null);
    }
  };

  const monthlyPrice = podcast.price_monthly
    ? (podcast.price_monthly / 100).toFixed(2)
    : null;
  const oneTimePrice = podcast.price_one_time
    ? (podcast.price_one_time / 100).toFixed(2)
    : null;

  if (hasAccess) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg border border-green-500/30 bg-green-500/5">
        <CheckCircle className="w-5 h-5 text-green-500" />
        <span className="text-sm text-foreground">
          {isTeamMember
            ? "Team access granted"
            : "You have access to this episode"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Teaser content */}
      {(podcast.teaser_text || videoUrl) && (
        <div className="space-y-3">
          {videoUrl && (
            <video
              src={videoUrl}
              controls
              className="w-full rounded-lg border border-border"
            />
          )}
          {podcast.teaser_text && (
            <div className="p-4 rounded-lg border border-border bg-card/50">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">
                {podcast.teaser_text}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Paywall */}
      <div className="p-6 rounded-xl border border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-primary" />
          <h3 className="font-heading text-lg text-foreground">
            Unlock This Episode
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Get full access to the script, line-up, and all episode content.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {monthlyPrice && (
            <Button
              onClick={() => handleCheckout("subscription")}
              disabled={checkoutLoading !== null}
              className="flex flex-col items-center gap-1 h-auto py-4"
            >
              {checkoutLoading === "subscription" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              <span className="text-base font-semibold">
                ${monthlyPrice}/mo
              </span>
              <span className="text-xs opacity-80">
                Monthly Subscription
              </span>
            </Button>
          )}
          {oneTimePrice && (
            <Button
              onClick={() => handleCheckout("one_time")}
              disabled={checkoutLoading !== null}
              variant="outline"
              className="flex flex-col items-center gap-1 h-auto py-4"
            >
              {checkoutLoading === "one_time" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <CreditCard className="w-5 h-5" />
              )}
              <span className="text-base font-semibold">
                ${oneTimePrice}
              </span>
              <span className="text-xs opacity-80">One-Time Purchase</span>
            </Button>
          )}
        </div>

        {(!monthlyPrice && !oneTimePrice) && (
          <p className="text-sm text-muted-foreground text-center">
            Pricing not yet configured for this episode.
          </p>
        )}

        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}