import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Plus,
  CheckCircle,
  Circle,
  Clock,
  ListChecks,
  X,
} from "lucide-react";
import { apiClient } from "@/api/client";

const AUTOSAVE_DELAY_MS = 2000;

const LINEUP_STYLES = {
  approved: "bg-green-500/15 text-green-500",
  rejected: "bg-destructive/15 text-destructive",
  pending: "bg-muted text-muted-foreground",
};

export default function PodcastItinerary({ podcast, onUpdate, permissions }) {
  const [segments, setSegments] = useState(podcast.itinerary || []);
  const [lineupStatus, setLineupStatus] = useState(
    podcast.lineup_status || "pending"
  );
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [autoSaveLabel, setAutoSaveLabel] = useState("");

  const autosaveTimerRef = useRef(null);
  const savedRef = useRef(JSON.stringify(podcast.itinerary || []));

  useEffect(() => {
    setSegments(podcast.itinerary || []);
    setLineupStatus(podcast.lineup_status || "pending");
    savedRef.current = JSON.stringify(podcast.itinerary || []);
  }, [podcast.id, podcast.itinerary, podcast.lineup_status]);

  useEffect(() => () => clearTimeout(autosaveTimerRef.current), []);

  const saveItinerary = useCallback(async (nextSegs, newLineupStatus, quiet = false) => {
    const segs = nextSegs ?? segments;
    const lstatus = newLineupStatus ?? lineupStatus;
    if (!quiet) setSaving(true);
    else setAutoSaveLabel("Saving…");
    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        itinerary: segs,
        lineup_status: lstatus,
      });
      savedRef.current = JSON.stringify(segs);
      setLineupStatus(lstatus);
      if (quiet) setAutoSaveLabel("Saved");
      onUpdate();
    } catch {
      if (quiet) setAutoSaveLabel("Save failed");
    } finally {
      if (!quiet) setSaving(false);
      if (quiet) setTimeout(() => setAutoSaveLabel(""), 2000);
    }
  }, [podcast.id, segments, lineupStatus, onUpdate]);

  const scheduleAutosave = useCallback((nextSegs) => {
    clearTimeout(autosaveTimerRef.current);
    if (JSON.stringify(nextSegs) !== savedRef.current) {
      autosaveTimerRef.current = setTimeout(
        () => saveItinerary(nextSegs, undefined, true),
        AUTOSAVE_DELAY_MS
      );
    }
  }, [saveItinerary]);

  const addSegment = () => {
    if (!newTitle) return;
    const next = [
      ...segments,
      {
        segment_title: newTitle,
        duration_minutes: Number(newDuration) || 0,
        notes: newNotes,
        approved: false,
      },
    ];
    setSegments(next);
    setNewTitle("");
    setNewDuration("");
    setNewNotes("");
    scheduleAutosave(next);
  };

  const toggleApproved = (idx) => {
    const next = segments.map((s, i) =>
      i === idx ? { ...s, approved: !s.approved } : s
    );
    setSegments(next);
    scheduleAutosave(next);
  };

  const removeSegment = (idx) => {
    const next = segments.filter((_, i) => i !== idx);
    setSegments(next);
    scheduleAutosave(next);
  };

  const allApproved =
    segments.length > 0 && segments.every((s) => s.approved);
  const totalMinutes = segments.reduce(
    (sum, s) => sum + (s.duration_minutes || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Line-up</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              LINEUP_STYLES[lineupStatus] || LINEUP_STYLES.pending
            }`}
          >
            {lineupStatus}
          </span>
          {autoSaveLabel && (
            <span className="text-xs text-muted-foreground">{autoSaveLabel}</span>
          )}
        </div>
        {segments.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {segments.length} segments · {totalMinutes}m total
          </span>
        )}
      </div>

      {/* Add segment form */}
      {permissions?.canEditLineup && (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 p-3 rounded-lg border border-border bg-card/50">
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Segment title"
        />
        <Input
          type="number"
          min="0"
          value={newDuration}
          onChange={(e) => setNewDuration(e.target.value)}
          placeholder="Minutes"
        />
        <Input
          value={newNotes}
          onChange={(e) => setNewNotes(e.target.value)}
          placeholder="Notes"
        />
        <Button onClick={addSegment} disabled={!newTitle} variant="outline">
          <Plus className="w-4 h-4" /> Add Segment
        </Button>
      </div>
      )}

      {/* Segment list */}
      <div className="space-y-2">
        {segments.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No segments yet. Add your first segment above.
          </p>
        )}
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card"
          >
            {permissions?.canEditLineup ? (
              <button
                onClick={() => toggleApproved(idx)}
                className="mt-0.5 shrink-0"
              >
                {seg.approved ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </button>
            ) : (
              <span className="mt-0.5 shrink-0">
                {seg.approved ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm ${
                  seg.approved
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {seg.segment_title}
              </p>
              {seg.notes && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {seg.notes}
                </p>
              )}
            </div>
            {seg.duration_minutes > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <Clock className="w-3 h-3" /> {seg.duration_minutes}m
              </span>
            )}
            {permissions?.canEditLineup && (
              <button
                onClick={() => removeSegment(idx)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Approval controls */}
      {segments.length > 0 && permissions?.canEditLineup && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => saveItinerary(undefined, "pending")}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ListChecks className="w-4 h-4" />
            )}
            Save Line-up
          </Button>
          {permissions?.canApproveLineup && (
            <Button
              onClick={() => saveItinerary(undefined, "approved")}
              disabled={saving || !allApproved}
              className={!allApproved ? "opacity-50 cursor-not-allowed" : ""}
            >
              <CheckCircle className="w-4 h-4" />
              Approve Line-up
            </Button>
          )}
          {!allApproved && permissions?.canApproveLineup && (
            <span className="text-xs text-muted-foreground self-center">
              Approve all segments first
            </span>
          )}
        </div>
      )}
      {segments.length > 0 && !permissions?.canEditLineup && (
        <p className="text-xs text-muted-foreground italic">
          You have view-only access to this line-up.
        </p>
      )}
    </div>
  );
}