import React, { useCallback, useEffect, useState } from "react";
import Navbar from "@/components/landing/Navbar";
import KaraokeTranscriber from "@/components/media/KaraokeTranscriber";
import KaraokeExtractor from "@/components/media/KaraokeExtractor";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Trash2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_LABEL = {
  0: "Recording",
  1: "Processing",
  2: "Completed",
  3: "Failed",
};

function PerformanceRow({ perf, onDelete }) {
  const statusText = STATUS_LABEL[perf.status] ?? perf.status;
  const score =
    perf.lyricScore != null ? `${Math.round(perf.lyricScore)}/100` : "—";
  const started = new Date(perf.startedAt).toLocaleString();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {started}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Score: {score} &middot; {statusText}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span
          className={[
            "text-xs px-2 py-0.5 rounded-full",
            perf.hasRecording
              ? "bg-green-500/20 text-green-400"
              : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {perf.hasRecording ? "Recorded" : "No recording"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onDelete(perf.id)}
          aria-label="Delete performance"
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

export default function KaraokePage() {
  const { user: currentUser, isLoadingAuth } = useAuth();
  const [performances, setPerformances] = useState([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState(null);
  const [perfPage, setPerfPage] = useState(1);
  const [perfTotal, setPerfTotal] = useState(0);
  const [selectedTrack, setSelectedTrack] = useState(null);

  const PAGE_SIZE = 10;

  const fetchPerformances = useCallback(
    async (page = 1) => {
      setPerfLoading(true);
      setPerfError(null);
      try {
        const data = await apiClient.karaoke.getPerformances({
          page,
          pageSize: PAGE_SIZE,
        });
        setPerformances(data.items ?? []);
        setPerfTotal(data.total ?? 0);
        setPerfPage(page);
      } catch (err) {
        setPerfError(err.message || "Failed to load performances.");
      } finally {
        setPerfLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchPerformances(1);
  }, [fetchPerformances]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this performance?")) return;
    try {
      await apiClient.karaoke.deletePerformance(id);
      setPerformances((prev) => prev.filter((p) => p.id !== id));
      setPerfTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      alert(err.message || "Delete failed.");
    }
  }

  function handleScored(result) {
    fetchPerformances(perfPage);
    console.info("Karaoke scored", result);
  }

  const totalPages = Math.ceil(perfTotal / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-heading text-3xl text-foreground text-glow">
            Karaoke
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a song, sing live, and get an instant lyric score.
          </p>
        </div>

        {/* Song selector / extractor */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            1. Choose a song
          </h2>
          <KaraokeExtractor
            currentUser={currentUser}
            userLoading={isLoadingAuth}
            onAuthRequired={() => apiClient.auth.redirectToLogin("/karaoke")}
            onTrackSelected={setSelectedTrack}
          />
        </section>

        {/* Live transcriber */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            2. Sing
          </h2>
          <KaraokeTranscriber
            sessionId={selectedTrack?.id}
            songMetadata={
              selectedTrack
                ? {
                    trackId: selectedTrack.id,
                    language: selectedTrack.language || "",
                    languageCodes: selectedTrack.language
                      ? [selectedTrack.language]
                      : [],
                  }
                : null
            }
            onScored={handleScored}
          />
        </section>

        {/* Performances history */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              3. Your performances
            </h2>
            <button
              className="text-xs text-primary hover:underline"
              onClick={() => fetchPerformances(perfPage)}
            >
              Refresh
            </button>
          </div>

          {perfLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}

          {perfError && (
            <p className="text-sm text-destructive">{perfError}</p>
          )}

          {!perfLoading && performances.length === 0 && !perfError && (
            <p className="text-sm text-muted-foreground">
              No performances yet. Sing a song to get started!
            </p>
          )}

          <div className="space-y-2">
            {performances.map((perf) => (
              <PerformanceRow
                key={perf.id}
                perf={perf}
                onDelete={handleDelete}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
                disabled={perfPage <= 1}
                onClick={() => fetchPerformances(perfPage - 1)}
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                {perfPage} / {totalPages}
              </span>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
                disabled={perfPage >= totalPages}
                onClick={() => fetchPerformances(perfPage + 1)}
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
