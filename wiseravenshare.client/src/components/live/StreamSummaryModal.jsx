import React from "react";
import { CheckCircle2, Clock, Users, MessageSquare, Heart, Video, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StreamSummaryModal({ summary, onClose, onGoToFeed }) {
  if (!summary) return null;
  const playbackUrl = summary.playbackUrl || summary.playback_url || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl text-card-foreground space-y-5 animate-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Close summary"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> Broadcast Finished
          </div>
          <h2 className="text-xl font-heading font-bold text-foreground">Live Video Ended</h2>
          <p className="text-sm text-muted-foreground truncate">{summary.title || "Untitled Live Broadcast"}</p>
        </div>

        {/* Analytics Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span>Duration</span>
            </div>
            <p className="text-lg font-bold text-foreground font-mono">{summary.durationFormatted || "0m 00s"}</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="w-3.5 h-3.5 text-emerald-400" />
              <span>Peak Viewers</span>
            </div>
            <p className="text-lg font-bold text-foreground">{Number(summary.peakViewers || 0).toLocaleString()}</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MessageSquare className="w-3.5 h-3.5 text-primary" />
              <span>Comments</span>
            </div>
            <p className="text-lg font-bold text-foreground">{Number(summary.totalComments || 0).toLocaleString()}</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Heart className="w-3.5 h-3.5 text-pink-500" />
              <span>Reactions</span>
            </div>
            <p className="text-lg font-bold text-foreground">{Number(summary.totalReactions || 0).toLocaleString()}</p>
          </div>
        </div>

        {/* VOD Feed Replay Status */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-xs">
            <p className="font-semibold text-foreground">VOD Replay Card Created</p>
            <p className="text-muted-foreground leading-relaxed">
              {summary.replayStatus || "Your broadcast replay has been automatically packaged and posted to your social timeline."}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {playbackUrl && (
            <Button asChild variant="secondary" className="flex-1 font-semibold rounded-xl">
              <a href={playbackUrl} target="_blank" rel="noreferrer">
                <Video className="w-4 h-4 mr-1.5" /> Watch Replay
              </a>
            </Button>
          )}
          {onGoToFeed && (
            <Button onClick={onGoToFeed} variant="default" className="flex-1 font-semibold rounded-xl">
              <Video className="w-4 h-4 mr-1.5" /> View in Feed
            </Button>
          )}
          <Button onClick={onClose} variant="outline" className="flex-1 rounded-xl">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
