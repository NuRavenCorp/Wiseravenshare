import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Sparkles,
  DollarSign,
  Users,
  CheckCircle,
} from "lucide-react";
import { apiClient } from "@/api/client";
import VideoTeaserRecorder from "@/components/podcasts/VideoTeaserRecorder";
import EpisodeMediaUploader from "@/components/podcasts/EpisodeMediaUploader";

export default function PodcastMonetization({ podcast, onUpdate }) {
  const [isPremium, setIsPremium] = useState(podcast.is_premium || false);
  const [teaserText, setTeaserText] = useState(podcast.teaser_text || "");
  const [teaserVideoUri, setTeaserVideoUri] = useState(
    podcast.teaser_video_uri || ""
  );
  const [episodeMediaUri, setEpisodeMediaUri] = useState(
    podcast.episode_media_uri || ""
  );
  const [priceMonthly, setPriceMonthly] = useState(
    podcast.price_monthly ? (podcast.price_monthly / 100).toString() : ""
  );
  const [priceOneTime, setPriceOneTime] = useState(
    podcast.price_one_time ? (podcast.price_one_time / 100).toString() : ""
  );
  const [aiPricing, setAiPricing] = useState(podcast.ai_pricing || null);
  const [teamIds, setTeamIds] = useState(podcast.team_ids || []);
  const [teams, setTeams] = useState([]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    const loadTeams = async () => {
      try {
        const page = await apiClient.entities.Team.filter({});
        setTeams(page.items || []);
      } catch {
        // no teams
      }
    };
    loadTeams();
  }, []);

  const handleAiPricing = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await apiClient.functions.invoke("SuggestPodcastPricing", {
        subject_matter: podcast.subject_matter,
        episode_number: podcast.episode_number,
      });
      const pricing = res.data?.pricing;
      if (pricing) {
        setAiPricing(pricing);
        if (pricing.suggested_monthly)
          setPriceMonthly(pricing.suggested_monthly.toString());
        if (pricing.suggested_one_time)
          setPriceOneTime(pricing.suggested_one_time.toString());
      }
    } catch (e) {
      setAiError(
        e?.response?.data?.error || e?.message || "AI pricing failed"
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        is_premium: isPremium,
        episode_media_uri: episodeMediaUri,
        teaser_text: teaserText,
        teaser_video_uri: teaserVideoUri,
        price_monthly: priceMonthly
          ? Math.round(parseFloat(priceMonthly) * 100)
          : null,
        price_one_time: priceOneTime
          ? Math.round(parseFloat(priceOneTime) * 100)
          : null,
        ai_pricing: aiPricing,
        team_ids: teamIds,
      });
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  const toggleTeam = (teamId) => {
    setTeamIds(
      teamIds.includes(teamId)
        ? teamIds.filter((id) => id !== teamId)
        : [...teamIds, teamId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Premium toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
        <div>
          <p className="text-sm font-medium">Premium Episode</p>
          <p className="text-xs text-muted-foreground">
            Gate this episode behind a paywall
          </p>
        </div>
        <Switch checked={isPremium} onCheckedChange={setIsPremium} />
      </div>

      {/* Episode media — always available */}
      <EpisodeMediaUploader
        mediaUri={episodeMediaUri}
        onChange={setEpisodeMediaUri}
      />

      {isPremium && (
        <>
          {/* Teaser text */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Teaser Text</Label>
            <Textarea
              value={teaserText}
              onChange={(e) => setTeaserText(e.target.value)}
              placeholder="Write a teaser that entices listeners to unlock this episode..."
              className="min-h-[100px]"
            />
          </div>

          {/* Video teaser */}
          <VideoTeaserRecorder
            videoUri={teaserVideoUri}
            onChange={setTeaserVideoUri}
          />

          {/* AI Pricing */}
          <div className="space-y-3 p-4 rounded-lg border border-accent/30 bg-accent/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">
                  AI Pricing Suggestion
                </span>
              </div>
              <Button
                onClick={handleAiPricing}
                variant="outline"
                size="sm"
                disabled={aiLoading}
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Suggest Pricing
              </Button>
            </div>
            {aiError && (
              <p className="text-sm text-destructive">{aiError}</p>
            )}
            {aiPricing && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {aiPricing.reasoning}
                </p>
                {aiPricing.market_analysis && (
                  <p className="text-xs text-muted-foreground italic">
                    {aiPricing.market_analysis}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Price inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> Monthly Subscription ($)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={priceMonthly}
                onChange={(e) => setPriceMonthly(e.target.value)}
                placeholder="9.99"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5" /> One-Time Purchase ($)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={priceOneTime}
                onChange={(e) => setPriceOneTime(e.target.value)}
                placeholder="4.99"
              />
            </div>
          </div>

          {/* Team selection */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <Label className="text-sm font-medium">Team Access</Label>
              <span className="text-xs text-muted-foreground">
                Teams that get free access
              </span>
            </div>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No teams available. Create a team first.
              </p>
            ) : (
              <div className="space-y-2">
                {teams.map((team) => (
                  <label
                    key={team.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={teamIds.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="w-4 h-4 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        {team.team_name}
                      </p>
                      {team.focus && (
                        <p className="text-xs text-muted-foreground">
                          {team.focus}
                        </p>
                      )}
                    </div>
                    {teamIds.includes(team.id) && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Save button */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CheckCircle className="w-4 h-4" />
        )}
        Save Monetization Settings
      </Button>
    </div>
  );
}