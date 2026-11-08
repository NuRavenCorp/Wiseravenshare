import React, { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "@/components/landing/Navbar";
import KaraokeExtractor from "@/components/media/KaraokeExtractor";
import KaraokePlayer from "@/components/media/KaraokePlayer";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  Loader2,
  Trash2,
  ChevronRight,
  Music,
  Music2,
  Mic2,
  Upload,
  Search,
  CheckCircle2,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABEL = { 0: "Recording", 1: "Processing", 2: "Completed", 3: "Failed" };
const SONG_PAGE_SIZE = 24;
const PERF_PAGE_SIZE = 10;
const TABS = ["Songs", "Catalog", "Upload", "Performances"];

// ─── PerformanceRow ───────────────────────────────────────────────────────────
function PerformanceRow({ perf, onDelete }) {
  const statusText = STATUS_LABEL[perf.status] ?? perf.status;
  const score = perf.lyricScore != null ? `${Math.round(perf.lyricScore)}/100` : "—";
  const started = new Date(perf.startedAt).toLocaleString();

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{started}</p>
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
        <Button size="icon" variant="ghost" onClick={() => onDelete(perf.id)} aria-label="Delete performance">
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

// ─── SongCard ─────────────────────────────────────────────────────────────────
function SongCard({ song, onClick }) {
  const hasLyrics = !!(song.lrcContent || song.plainLyrics);
  return (
    <button
      onClick={() => onClick(song)}
      className="text-left rounded-xl border border-border bg-card hover:bg-accent/40 hover:border-primary/40 transition-all p-4 flex flex-col gap-2 w-full group relative"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {song.title || "Untitled"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{song.artist || "Unknown artist"}</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
          <Play className="w-3.5 h-3.5 ml-0.5" />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/50">
        {hasLyrics && (
          <span className="flex items-center gap-1 text-[11px] bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Lyrics
          </span>
        )}
        {song.genre && (
          <span className="text-[11px] text-muted-foreground truncate">
            {song.genre}
          </span>
        )}
        {song.duration > 0 && (
          <span className="text-xs text-muted-foreground ml-auto">
            {Math.floor(song.duration / 60)}:{String(Math.floor(song.duration % 60)).padStart(2, "0")}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── KaraokePage ──────────────────────────────────────────────────────────────
export default function KaraokePage() {
  const { user: currentUser, isLoadingAuth } = useAuth();
  const [activeTab, setActiveTab] = useState("Songs");

  // Songs tab state
  const [songs, setSongs] = useState([]);
  const [songsLoading, setSongsLoading] = useState(false);
  const [songsError, setSongsError] = useState(null);
  const [songsPage, setSongsPage] = useState(1);
  const [songsTotal, setSongsTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [activeSong, setActiveSong] = useState(null);

  // Performances tab state
  const [performances, setPerformances] = useState([]);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfError, setPerfError] = useState(null);
  const [perfPage, setPerfPage] = useState(1);
  const [perfTotal, setPerfTotal] = useState(0);

  // ── Songs ────────────────────────────────────────────────────────────────
  const fetchSongs = useCallback(async (page = 1, reset = false) => {
    setSongsLoading(true);
    setSongsError(null);
    try {
      const data = await apiClient.karaoke.songs.list({
        page,
        pageSize: SONG_PAGE_SIZE,
        includePublic: true,
      });
      const items = data.items ?? [];
      setSongs((prev) => (reset || page === 1 ? items : [...prev, ...items]));
      setSongsTotal(data.total ?? 0);
      setSongsPage(page);
    } catch (err) {
      setSongsError(err.message || "Failed to load songs.");
    } finally {
      setSongsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSongs(1, true);
  }, [fetchSongs]);

  const filteredSongs = songs.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.artist?.toLowerCase().includes(q) ||
      s.genre?.toLowerCase().includes(q)
    );
  });

  const canLoadMore = songs.length < songsTotal;

  // ── Performances ─────────────────────────────────────────────────────────
  const fetchPerformances = useCallback(async (page = 1) => {
    setPerfLoading(true);
    setPerfError(null);
    try {
      const data = await apiClient.karaoke.getPerformances({ page, pageSize: PERF_PAGE_SIZE });
      setPerformances(data.items ?? []);
      setPerfTotal(data.total ?? 0);
      setPerfPage(page);
    } catch (err) {
      setPerfError(err.message || "Failed to load performances.");
    } finally {
      setPerfLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "Performances") fetchPerformances(1);
  }, [activeTab, fetchPerformances]);

  async function handleDeletePerf(id) {
    if (!window.confirm("Delete this performance?")) return;
    try {
      await apiClient.karaoke.deletePerformance(id);
      setPerformances((prev) => prev.filter((p) => p.id !== id));
      setPerfTotal((t) => Math.max(0, t - 1));
    } catch (err) {
      alert(err.message || "Delete failed.");
    }
  }

  const perfTotalPages = Math.ceil(perfTotal / PERF_PAGE_SIZE);

  // ── Tab icons ─────────────────────────────────────────────────────────────
  const TAB_ICONS = { Songs: Music, Catalog: Music2, Upload: Upload, Performances: Mic2 };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {/* Full-screen player overlay */}
      {activeSong && (
        <KaraokePlayer
          song={activeSong}
          onClose={() => setActiveSong(null)}
          onSaved={(updated) => {
            setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
            setActiveSong(updated);
          }}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16">
        {/* Header */}
        <div className="mb-6">
          <h1 className="font-heading text-3xl text-foreground text-glow">Karaoke Studio</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse catalog classics, upload custom songs, sing live with synchronized lyrics, and track your scores.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="w-4 h-4" />
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Songs tab ───────────────────────────────────────────────────── */}
        {activeTab === "Songs" && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search songs by title, artist, or genre…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {/* Error */}
            {songsError && (
              <p className="text-sm text-destructive">{songsError}</p>
            )}

            {/* Grid */}
            {filteredSongs.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredSongs.map((s) => (
                  <SongCard key={s.id} song={s} onClick={setActiveSong} />
                ))}
              </div>
            ) : !songsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border border-dashed border-border rounded-xl">
                <Music className="w-10 h-10 text-muted-foreground/50" />
                <p className="text-sm font-medium text-foreground">
                  {search ? "No songs match your search." : "No uploaded songs yet"}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm text-center">
                  Upload an audio file or browse the Song Catalog to start singing right away.
                </p>
                {!search && (
                  <div className="flex gap-2 pt-2">
                    <Button onClick={() => setActiveTab("Upload")} size="sm">
                      <Upload className="w-4 h-4 mr-1.5" /> Upload a song
                    </Button>
                    <Button onClick={() => setActiveTab("Catalog")} size="sm" variant="outline">
                      <Music2 className="w-4 h-4 mr-1.5" /> Browse Catalog
                    </Button>
                  </div>
                )}
              </div>
            ) : null}

            {songsLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading songs…
              </div>
            )}

            {/* Load more */}
            {!search && canLoadMore && !songsLoading && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchSongs(songsPage + 1)}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Catalog tab ─────────────────────────────────────────────────── */}
        {activeTab === "Catalog" && (
          <KaraokeExtractor
            defaultTab="catalog"
            currentUser={currentUser}
            userLoading={isLoadingAuth}
            onAuthRequired={() => apiClient.auth.redirectToLogin?.("/karaoke")}
            onOpenPlayer={(song) => setActiveSong(song)}
            onTrackSelected={() => {
              fetchSongs(1, true);
            }}
          />
        )}

        {/* ── Upload tab ──────────────────────────────────────────────────── */}
        {activeTab === "Upload" && (
          <KaraokeExtractor
            defaultTab="upload"
            currentUser={currentUser}
            userLoading={isLoadingAuth}
            onAuthRequired={() => apiClient.auth.redirectToLogin?.("/karaoke")}
            onOpenPlayer={(song) => setActiveSong(song)}
            onTrackSelected={(song) => {
              fetchSongs(1, true);
              if (song) setActiveSong(song);
              else setActiveTab("Songs");
            }}
          />
        )}

        {/* ── Performances tab ────────────────────────────────────────────── */}
        {activeTab === "Performances" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Your performances
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
            {perfError && <p className="text-sm text-destructive">{perfError}</p>}
            {!perfLoading && performances.length === 0 && !perfError && (
              <div className="text-center py-12 border border-dashed border-border rounded-xl space-y-2">
                <Mic2 className="w-8 h-8 text-muted-foreground/50 mx-auto" />
                <p className="text-sm text-foreground font-medium">No performances yet</p>
                <p className="text-xs text-muted-foreground">Sing a song from the Catalog or your Songs list with mic scoring turned on to track your performances!</p>
                <div className="pt-2">
                  <Button size="sm" onClick={() => setActiveTab("Catalog")}>
                    <Play className="w-3.5 h-3.5 mr-1.5" /> Start singing
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {performances.map((perf) => (
                <PerformanceRow key={perf.id} perf={perf} onDelete={handleDeletePerf} />
              ))}
            </div>

            {perfTotalPages > 1 && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
                  disabled={perfPage <= 1}
                  onClick={() => fetchPerformances(perfPage - 1)}
                >
                  Previous
                </button>
                <span className="text-xs text-muted-foreground">{perfPage} / {perfTotalPages}</span>
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground disabled:opacity-40 hover:text-foreground"
                  disabled={perfPage >= perfTotalPages}
                  onClick={() => fetchPerformances(perfPage + 1)}
                >
                  Next <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
