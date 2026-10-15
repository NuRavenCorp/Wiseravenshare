import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Clapperboard,
  FileText,
  Mic,
  Scissors,
  Eye,
  Film,
  CheckCircle,
  Loader2,
  ChevronRight,
  SkipForward,
  Play,
  Check,
  X,
  RotateCcw,
  Calendar,
} from "lucide-react";

export const PRODUCTION_STAGES = [
  { id: "planning", label: "Planning", icon: Clapperboard, desc: "Concept and pre-production" },
  { id: "scripting", label: "Scripting", icon: FileText, desc: "Writing the episode script" },
  { id: "recording", label: "Recording", icon: Mic, desc: "Capturing audio and video" },
  { id: "editing", label: "Editing", icon: Scissors, desc: "Post-production cut" },
  { id: "review", label: "Review", icon: Eye, desc: "Approval and quality check" },
  { id: "teaser", label: "Teaser", icon: Film, desc: "Creating promotional teaser" },
  { id: "published", label: "Released", icon: CheckCircle, desc: "Episode is live" },
];

const STATUS_STYLES = {
  pending: { dot: "bg-muted-foreground/30", ring: "border-border", text: "text-muted-foreground", badge: "bg-muted/40 text-muted-foreground" },
  in_progress: { dot: "bg-primary animate-pulse", ring: "border-primary", text: "text-primary", badge: "bg-primary/15 text-primary" },
  completed: { dot: "bg-green-500", ring: "border-green-500/50", text: "text-green-500", badge: "bg-green-500/15 text-green-500" },
  skipped: { dot: "bg-muted-foreground/20", ring: "border-border/40", text: "text-muted-foreground/40", badge: "bg-muted/20 text-muted-foreground/50" },
};

function formatTimestamp(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

export default function ProductionTimeline({ podcast, onUpdate }) {
  const [timeline, setTimeline] = useState([]);
  const [saving, setSaving] = useState(null);
  const [expandedStage, setExpandedStage] = useState(null);
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    if (podcast.production_timeline && podcast.production_timeline.length > 0) {
      setTimeline(podcast.production_timeline);
    } else {
      setTimeline(
        PRODUCTION_STAGES.map((s, i) => ({
          stage_id: s.id,
          status: i === 0 ? "in_progress" : "pending",
          started_at: i === 0 ? new Date().toISOString() : null,
          completed_at: null,
          notes: "",
        }))
      );
    }
  }, [podcast.id, podcast.production_timeline]);

  const persist = async (newTimeline, extraUpdates = {}) => {
    setTimeline(newTimeline);
    setSaving("all");
    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        production_timeline: newTimeline,
        ...extraUpdates,
      });
      onUpdate?.();
    } finally {
      setSaving(null);
    }
  };

  const advanceStage = async (stageId) => {
    const newTimeline = timeline.map((s) => {
      if (s.stage_id !== stageId) return s;
      let newStatus = "in_progress";
      if (s.status === "pending") newStatus = "in_progress";
      else if (s.status === "in_progress") newStatus = "completed";
      const updated = { ...s, status: newStatus };
      if (newStatus === "in_progress" && !s.started_at) updated.started_at = new Date().toISOString();
      if (newStatus === "completed" && !s.completed_at) updated.completed_at = new Date().toISOString();
      return updated;
    });

    const stage = newTimeline.find((s) => s.stage_id === stageId);
    const extra = {};
    if (stageId === "published" && stage.status === "completed") extra.status = "published";
    if (stageId === "recording" && stage.status === "in_progress") extra.status = "recording";
    persist(newTimeline, extra);
  };

  const skipStage = async (stageId) => {
    const newTimeline = timeline.map((s) =>
      s.stage_id === stageId ? { ...s, status: "skipped" } : s
    );
    persist(newTimeline);
  };

  const resetStage = async (stageId) => {
    const newTimeline = timeline.map((s) =>
      s.stage_id === stageId ? { ...s, status: "pending", started_at: null, completed_at: null } : s
    );
    persist(newTimeline);
  };

  const saveNotes = async (stageId) => {
    const newTimeline = timeline.map((s) =>
      s.stage_id === stageId ? { ...s, notes: notesDraft } : s
    );
    await persist(newTimeline);
    setExpandedStage(null);
  };

  const completedCount = timeline.filter((s) => s.status === "completed").length;
  const progress = timeline.length > 0 ? Math.round((completedCount / timeline.length) * 100) : 0;
  const currentStage = timeline.find((s) => s.status === "in_progress");

  const handleExpand = (stageId) => {
    const stage = timeline.find((s) => s.stage_id === stageId);
    setNotesDraft(stage?.notes || "");
    setExpandedStage(expandedStage === stageId ? null : stageId);
  };

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-heading text-lg text-foreground">Production Timeline</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {currentStage
                ? `Currently: ${PRODUCTION_STAGES.find((s) => s.id === currentStage.stage_id)?.label}`
                : progress === 100
                ? "All stages complete"
                : "No active stage"}
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-heading text-accent">{progress}%</span>
            <p className="text-xs text-muted-foreground">{completedCount} of {timeline.length} stages</p>
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Connecting line - desktop */}
        <div className="hidden md:block absolute top-6 left-0 right-0 h-0.5 bg-border -z-0" />
        <div
          className="hidden md:block absolute top-6 left-0 h-0.5 bg-gradient-to-r from-primary to-accent transition-all duration-500 -z-0"
          style={{ width: `${progress}%` }}
        />

        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 md:gap-2 relative z-10">
          {PRODUCTION_STAGES.map((stage, i) => {
            const stageData = timeline.find((s) => s.stage_id === stage.id);
            const status = stageData?.status || "pending";
            const style = STATUS_STYLES[status];
            const Icon = stage.icon;
            const isExpanded = expandedStage === stage.id;

            return (
              <div key={stage.id} className="flex flex-col items-center md:items-stretch">
                {/* Node */}
                <div className="flex md:flex-col items-center md:items-center gap-3 md:gap-0">
                  <button
                    onClick={() => handleExpand(stage.id)}
                    className={`relative w-12 h-12 rounded-full border-2 ${style.ring} ${style.badge} flex items-center justify-center transition-all hover:scale-105 shrink-0`}
                  >
                    {status === "completed" ? (
                      <Check className="w-5 h-5" />
                    ) : status === "in_progress" ? (
                      <Icon className="w-5 h-5" />
                    ) : (
                      <Icon className="w-5 h-5 opacity-50" />
                    )}
                    {status === "in_progress" && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary animate-ping" />
                    )}
                  </button>

                  {/* Mobile connector */}
                  {i < PRODUCTION_STAGES.length - 1 && (
                    <div className="md:hidden flex-1 h-0.5 bg-border" />
                  )}
                </div>

                {/* Label */}
                <div className="mt-2 text-center md:text-center">
                  <p className={`text-xs font-medium ${style.text} truncate`}>{stage.label}</p>
                  {stageData?.completed_at && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 hidden md:block">
                      {formatTimestamp(stageData.completed_at)}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Expanded stage detail */}
      {expandedStage && (() => {
        const stage = PRODUCTION_STAGES.find((s) => s.id === expandedStage);
        const stageData = timeline.find((s) => s.stage_id === expandedStage);
        const status = stageData?.status || "pending";
        const style = STATUS_STYLES[status];
        const Icon = stage.icon;

        return (
          <div className="p-5 rounded-xl border border-border bg-card space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg border ${style.ring} ${style.badge} flex items-center justify-center`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading text-base text-foreground">{stage.label}</h4>
                  <p className="text-xs text-muted-foreground">{stage.desc}</p>
                </div>
              </div>
              <button onClick={() => setExpandedStage(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${style.badge}`}>
                {status.replace("_", " ")}
              </span>
              {stageData?.started_at && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Started {formatTimestamp(stageData.started_at)}
                </span>
              )}
              {stageData?.completed_at && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Done {formatTimestamp(stageData.completed_at)}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {status !== "completed" && (
                <Button
                  onClick={() => advanceStage(expandedStage)}
                  disabled={saving === "all"}
                  size="sm"
                >
                  {saving === "all" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : status === "pending" ? (
                    <Play className="w-4 h-4" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {status === "pending" ? "Start Stage" : status === "in_progress" ? "Mark Complete" : "Advance"}
                </Button>
              )}
              {status === "completed" && (
                <Button onClick={() => resetStage(expandedStage)} variant="outline" size="sm">
                  <RotateCcw className="w-4 h-4" /> Reset
                </Button>
              )}
              {status !== "skipped" && status !== "completed" && (
                <Button onClick={() => skipStage(expandedStage)} variant="ghost" size="sm">
                  <SkipForward className="w-4 h-4" /> Skip
                </Button>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground font-medium">Stage Notes</label>
              <Textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add notes about this production stage..."
                rows={3}
                className="text-sm"
              />
              <Button onClick={() => saveNotes(expandedStage)} disabled={saving === "all"} size="sm" variant="outline">
                {saving === "all" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Notes
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Stage summary list */}
      <div className="space-y-2">
        {PRODUCTION_STAGES.map((stage) => {
          const stageData = timeline.find((s) => s.stage_id === stage.id);
          const status = stageData?.status || "pending";
          const style = STATUS_STYLES[status];
          const Icon = stage.icon;
          return (
            <button
              key={stage.id}
              onClick={() => handleExpand(stage.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border ${style.ring} bg-card hover:bg-card/60 transition-colors text-left`}
            >
              <div className={`w-8 h-8 rounded-md ${style.badge} flex items-center justify-center shrink-0`}>
                {status === "completed" ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{stage.label}</p>
                {stageData?.notes && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{stageData.notes}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${style.badge} shrink-0`}>
                {status.replace("_", " ")}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}