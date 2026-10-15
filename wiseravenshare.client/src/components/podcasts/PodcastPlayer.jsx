import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Lock,
  CheckCircle,
  Play,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import PaywallButtons from "@/components/podcasts/PaywallButtons";

export default function PodcastPlayer({
  podcast,
  hasAccess,
  isTeamMember,
}) {
  const [teaserUrl, setTeaserUrl] = useState(null);
  const [episodeUrl, setEpisodeUrl] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [error, setError] = useState("");
  const [teaserEnded, setTeaserEnded] = useState(false);

  useEffect(() => {
    if (podcast.teaser_video_uri) {
      getPlayableUrl(podcast.teaser_video_uri).then(setTeaserUrl);
    } else {
      setTeaserUrl(null);
    }
  }, [podcast.teaser_video_uri]);

  useEffect(() => {
    if (hasAccess && podcast.episode_media_uri) {
      getPlayableUrl(podcast.episode_media_uri).then(setEpisodeUrl);
    } else {
      setEpisodeUrl(null);
    }
  }, [hasAccess, podcast.episode_media_uri]);

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

  /* Has access — play full episode */
  if (hasAccess && episodeUrl) {
    return (
      <div className="space-y-3">
        <video
          src={episodeUrl}
          controls
          className="w-full rounded-lg border border-border"
        />
        <div className="flex items-center gap-2 p-3 rounded-lg border border-green-500/30 bg-green-500/5">
          <CheckCircle className="w-4 h-4 text-green-500" />
          <span className="text-sm text-foreground">
            {isTeamMember
              ? "Team access granted"
              : "You have access to this episode"}
          </span>
        </div>
      </div>
    );
  }

  /* Has access but no episode media uploaded yet */
  if (hasAccess && !episodeUrl) {
    return (
      <div className="p-6 rounded-lg border border-border bg-card text-center">
        <Play className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">
          Episode media not yet uploaded.
        </p>
      </div>
    );
  }

  /* No access — teaser with integrated paywall in the player */
  return (
    <div className="space-y-4">
      <div className="relative rounded-lg overflow-hidden border border-border bg-card">
        {teaserUrl ? (
          <>
            <video
              src={teaserUrl}
              controls={!teaserEnded}
              onEnded={() => setTeaserEnded(true)}
              className="w-full"
            />
            {/* Premium badge while teaser plays */}
            {!teaserEnded && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/80 backdrop-blur-sm text-xs text-primary border border-primary/20">
                <Lock className="w-3 h-3" /> Premium
              </div>
            )}
            {/* Paywall overlay after teaser ends — payment buttons in the player */}
            {teaserEnded && (
              <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                <Lock className="w-12 h-12 text-primary mb-3" />
                <p className="text-base text-foreground mb-1">
                  Teaser ended
                </p>
                <p className="text-sm text-muted-foreground mb-5">
                  Subscribe or pay once to watch the full episode
                </p>
                <PaywallButtons
                  monthlyPrice={monthlyPrice}
                  oneTimePrice={oneTimePrice}
                  checkoutLoading={checkoutLoading}
                  onCheckout={handleCheckout}
                  error={error}
                />
              </div>
            )}
          </>
        ) : (
          /* No teaser — paywall directly in the player area */
          <div className="aspect-video flex flex-col items-center justify-center p-6 text-center">
            <Lock className="w-12 h-12 text-primary mb-3" />
            <p className="text-base text-foreground mb-1">
              Premium Episode
            </p>
            <p className="text-sm text-muted-foreground mb-5">
              Subscribe or pay once to watch
            </p>
            <PaywallButtons
              monthlyPrice={monthlyPrice}
              oneTimePrice={oneTimePrice}
              checkoutLoading={checkoutLoading}
              onCheckout={handleCheckout}
              error={error}
            />
          </div>
        )}
      </div>

      {/* Teaser text */}
      {podcast.teaser_text && (
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <p className="text-sm text-foreground/80 whitespace-pre-wrap">
            {podcast.teaser_text}
          </p>
        </div>
      )}
    </div>
  );
}