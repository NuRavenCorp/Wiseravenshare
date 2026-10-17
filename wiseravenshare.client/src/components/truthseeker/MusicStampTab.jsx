import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { analyzeMusicTrack } from "@/lib/musicAnalyzer";
import {
  Loader2,
  Music,
  Upload,
  Award,
  Fingerprint,
  Gauge,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Trash2,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MusicStampTab() {
  const [tracks, setTracks] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [features, setFeatures] = useState(null);
  const [stamp, setStamp] = useState(null);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef(null);

  const loadTracks = async () => {
    try {
      const page = await apiClient.ravensightMedia.listMusic();
      setTracks(page || []);
    } catch {}
  };

  const loadRecent = async () => {
    try {
      const res = await apiClient.functions.invoke("ListMusicAnalyses", {
        stamp_status: statusFilter || undefined,
        limit: 20,
      });
      setRecent(res.data?.items || []);
    } catch {
    } finally {
      setLoadingRecent(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      await apiClient.functions.invoke("ManageMusicAnalysis", {
        action: "delete",
        analysis_id: id,
      });
      loadRecent();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    loadTracks();
  }, []);

  useEffect(() => {
    loadRecent();
  }, [statusFilter]);

  const analyzeArrayBuffer = async (arrayBuffer, title, mediaAssetId) => {
    setAnalyzing(true);
    setError(null);
    setFeatures(null);
    setStamp(null);
    try {
      const result = await analyzeMusicTrack(arrayBuffer);
      setFeatures({ ...result, track_title: title, media_asset_id: mediaAssetId });
    } catch (e) {
      setError(e?.message || "Failed to analyze audio. Ensure it's a valid audio file.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSelectTrack = async (trackId) => {
    setSelectedId(trackId);
    if (!trackId) return;
    const track = tracks.find((t) => t.id === trackId);
    if (!track) return;
    try {
      const url = await getPlayableUrl(track.file_uri);
      if (!url) {
        setError("Could not resolve a playable URL for this track.");
        return;
      }
      const res = await fetch(url);
      const buf = await res.arrayBuffer();
      await analyzeArrayBuffer(buf, track.title || "Untitled Track", track.id);
    } catch (e) {
      setError(e?.message || "Failed to load track for analysis.");
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedId("");
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Upload to private storage and create a media asset record
      const upload = await apiClient.ravensightMedia.uploadMusic(file, {
        title: file.name.replace(/\.[^.]+$/, ""),
        destinationFolder: "truth-stamp",
      });
      await loadTracks();
      await analyzeArrayBuffer(arrayBuffer, upload.track?.title || file.name.replace(/\.[^.]+$/, ""), upload.track?.id || "");
    } catch (err) {
      setError(err?.message || "Upload failed.");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleStamp = async () => {
    if (!features) return;
    setStamping(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("StampMusicAnalysis", {
        media_asset_id: features.media_asset_id || null,
        track_title: features.track_title,
        bpm: features.bpm,
        key: features.key,
        energy: features.energy,
        dynamics: features.dynamics,
        spectral_centroid: features.spectral_centroid,
        bass_energy: features.bass_energy,
        mid_energy: features.mid_energy,
        treble_energy: features.treble_energy,
        fingerprint: features.fingerprint,
        confidence: features.confidence,
      });
      setStamp(res.data);
      loadRecent();
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Stamping failed.");
    } finally {
      setStamping(false);
    }
  };

  const bandPercent = (v) => `${Math.round(v * 100)}%`;

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-accent" />
          <h3 className="font-heading text-lg text-foreground">
            Originality Stamp Engine
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Our algorithm analyzes the first 10 bars of any track — detecting BPM,
          musical key, energy, dynamics, and spectral balance — then generates a
          unique fingerprint stamp certifying the work as original.
        </p>
      </div>

      {/* Track selection */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-2 block">
            Select from your music library
          </label>
          <select
            value={selectedId}
            onChange={(e) => handleSelectTrack(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            <option value="">Choose a track…</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title || "Untitled"}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={handleUpload}
            className="hidden"
            id="music-upload"
          />
          <Button
            asChild
            variant="outline"
            className="w-full"
            disabled={analyzing || stamping}
          >
            <label htmlFor="music-upload" className="cursor-pointer flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              Upload a Track
            </label>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Uploaded tracks are stored privately — no public URL, so access follows your app's permissions.
        </p>
      </div>

      {/* Analyzing state */}
      {analyzing && (
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Analyzing first 10 bars…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Analysis results */}
      {features && !analyzing && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Gauge className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium text-foreground">
                Analysis: {features.track_title}
              </h3>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <Metric icon={Activity} label="BPM" value={features.bpm} />
              <Metric icon={Music} label="Key" value={features.key} />
              <Metric
                icon={Gauge}
                label="Energy"
                value={features.energy.toFixed(3)}
              />
              <Metric
                icon={Activity}
                label="Dynamics"
                value={features.dynamics.toFixed(2)}
              />
            </div>

            {/* Band energy bars */}
            <div className="space-y-2 mb-4">
              <p className="text-xs text-muted-foreground">Frequency Balance</p>
              <BandBar label="Bass" value={features.bass_energy} color="bg-primary" />
              <BandBar label="Mid" value={features.mid_energy} color="bg-chart-2" />
              <BandBar label="Treble" value={features.treble_energy} color="bg-accent" />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-accent" />
                <span className="text-xs text-muted-foreground">Fingerprint</span>
              </div>
              <span className="text-sm font-mono text-accent">
                {features.fingerprint}
              </span>
            </div>

            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                Confidence: {(features.confidence * 100).toFixed(0)}%
              </span>
              {!stamp && (
                <Button
                  onClick={handleStamp}
                  disabled={stamping}
                  className="bg-primary text-primary-foreground"
                >
                  {stamping ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Award className="w-4 h-4" />
                  )}
                  Stamp This Work
                </Button>
              )}
            </div>
          </div>

          {/* Stamp display */}
          {stamp && (
            <div
              className={`rounded-lg border-2 p-5 ${
                stamp.stamp_status === "flagged"
                  ? "border-destructive/40 bg-destructive/5"
                  : "border-accent/40 bg-accent/5"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-16 h-16 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    stamp.stamp_status === "flagged"
                      ? "border-destructive/50"
                      : "border-accent/50"
                  }`}
                >
                  {stamp.stamp_status === "flagged" ? (
                    <AlertTriangle className="w-7 h-7 text-destructive" />
                  ) : (
                    <ShieldCheck className="w-7 h-7 text-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded ${
                        stamp.stamp_status === "flagged"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-accent/15 text-accent"
                      }`}
                    >
                      {stamp.stamp_status === "flagged" ? "Flagged" : "Certified Original"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground mb-1">{stamp.assessment}</p>
                  {stamp.character_tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {stamp.character_tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {stamp.originality_note && (
                    <p className="text-xs text-destructive mt-2">
                      {stamp.originality_note}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <Fingerprint className="w-3.5 h-3.5 text-accent" />
                    <span className="text-xs font-mono text-muted-foreground">
                      {stamp.stamp_id}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent stamps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Recently Stamped Works
          </h3>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              <option value="">All</option>
              <option value="certified">Certified</option>
              <option value="flagged">Flagged</option>
              <option value="original">Original</option>
            </select>
          </div>
        </div>
        {loadingRecent ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tracks stamped yet.
          </p>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    r.stamp_status === "flagged"
                      ? "bg-destructive/15"
                      : "bg-accent/15"
                  }`}
                >
                  {r.stamp_status === "flagged" ? (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-accent" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{r.track_title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.bpm} BPM · {r.key}
                  </p>
                </div>
                <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
                  {r.fingerprint}
                </span>
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deleting === r.id}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  {deleting === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-lg border border-border bg-background/50">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-mono text-foreground truncate">{value}</p>
    </div>
  );
}

function BandBar({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-12 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
        {Math.round(value * 100)}%
      </span>
    </div>
  );
}