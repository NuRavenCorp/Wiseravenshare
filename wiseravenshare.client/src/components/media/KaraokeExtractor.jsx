import React, { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Mic, Wand2, Upload, FileAudio2, Music2, ChevronDown, ChevronRight, Play, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KaraokePaywall from "@/components/media/KaraokePaywall";
import KaraokeTranscriber from "@/components/media/KaraokeTranscriber";

function readAccessToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return window.localStorage.getItem("wiseravenshare_access_token")
    || window.localStorage.getItem("token")
    || "";
}

async function transcribeFile(file) {
  const token = readAccessToken();
  const endpoints = [
    // Preferred karaoke words route.
    "/api/karaoke/speech/transcribe/words",
    // Legacy compat endpoints that are still deployed in some environments.
    "/api/functions/words-karaoke",
    "/api/functions/WordsKaraoke",
    "/api/functions/transcribe-local-file",
    "/api/functions/TranscribeLocalFile",
    // Dedicated karaoke plain transcription fallback.
    "/api/karaoke/speech/transcribe",
    // Assistant endpoint requires auth and feature gate; keep as last resort.
    ...(token ? ["/api/assistant/audio/transcribe"] : []),
  ];

  let lastError = null;
  const attempts = [];
  for (const endpoint of endpoints) {
    const body = new FormData();
    body.append("audio", file);
    try {
      const result = await apiClient.requestJson(endpoint, {
        method: "POST",
        body,
        omitAuth: endpoint !== "/api/assistant/audio/transcribe",
      });
      const transcript =
        (result?.lyrics || result?.text || result?.transcript || result?.lrc || "").toString().trim();
      const hasWordPayload = Array.isArray(result?.words) && result.words.length > 0;
      if (transcript.length > 0 || hasWordPayload) {
        return result;
      }
      lastError = new Error("Transcription returned empty output.");
      attempts.push(`${endpoint} -> empty`);
    } catch (error) {
      lastError = error;
      attempts.push(`${endpoint} -> ${error?.status ?? "ERR"}`);
      if (![400, 401, 403, 404, 405, 415, 422, 500, 502, 503, 504].includes(error?.status)) {
        throw error;
      }
    }
  }

  if (lastError) {
    const details = attempts.length ? ` Tried: ${attempts.join(", ")}` : "";
    lastError.message = `${lastError.message}${details}`;
  }
  throw lastError || new Error("Unable to transcribe file.");
}

async function transcribeUrl(url, fileName) {
  const extensionFromMime = (mime) => {
    const normalized = (mime || "").toLowerCase();
    if (normalized.includes("audio/mpeg")) return ".mp3";
    if (normalized.includes("audio/mp4")) return ".m4a";
    if (normalized.includes("video/mp4")) return ".mp4";
    if (normalized.includes("audio/wav")) return ".wav";
    if (normalized.includes("audio/ogg")) return ".ogg";
    if (normalized.includes("audio/webm") || normalized.includes("video/webm")) return ".webm";
    return "";
  };

  const normalizeFileName = (baseName, sourceUrl, mime) => {
    const rawName = (baseName || "karaoke-media").trim();
    const hasExt = /\.[a-z0-9]{2,8}$/i.test(rawName);
    if (hasExt) return rawName;

    let ext = "";
    try {
      const parsed = new URL(sourceUrl, window.location.origin);
      const urlPath = parsed.pathname || "";
      const match = urlPath.match(/\.[a-z0-9]{2,8}$/i);
      ext = match?.[0] || "";
    } catch {
      ext = "";
    }

    if (!ext) {
      ext = extensionFromMime(mime);
    }

    return `${rawName}${ext || ".webm"}`;
  };

  let credentials = "include";
  const headers = {};
  const token = readAccessToken();
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin && /^https?:$/i.test(resolved.protocol)) {
      credentials = "omit";
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    credentials = "include";
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(url, { credentials, headers });
  if (!response.ok) {
    throw new Error(`Failed to load media (${response.status})`);
  }

  const blob = await response.blob();
  const normalizedName = normalizeFileName(fileName || "karaoke-media", url, blob.type);
  const file = new File([blob], normalizedName, {
    type: blob.type || "application/octet-stream",
  });
  return transcribeFile(file);
}

/** Extract displayable text from any transcription result shape. */
function extractTranscriptText(result) {
  if (!result) return "";
  // New structured format from /transcribe/words
  if (result.lrc) return result.lrc;
  if (result.words?.length) {
    return result.words.map((w) => w.word).join(" ").trim();
  }
  // Legacy plain text
  return (result.lyrics || result.text || result.transcript || "").toString().trim();
}

export default function KaraokeExtractor({ currentUser, onAuthRequired }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [lrc, setLrc] = useState("");
  const [wordCount, setWordCount] = useState(null);
  const [vocalsIsolated, setVocalsIsolated] = useState(false);
  const [error, setError] = useState("");
  const [libraryUploadFile, setLibraryUploadFile] = useState(null);
  const [localFile, setLocalFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // ── Catalog state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState("catalog"); // "catalog" | "library" | "local"
  const [catalog, setCatalog] = useState([]);            // grouped array from API
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogGenres, setCatalogGenres] = useState([]);
  const [activeGenre, setActiveGenre] = useState("All");
  const [expandedGenres, setExpandedGenres] = useState({});
  const [catalogTrack, setCatalogTrack] = useState(null); // selected catalog track

  const loadSources = useCallback(async () => {
    try {
      const [music, videos] = await Promise.all([
        apiClient.ravensightMedia.listMusic(),
        apiClient.ravensightMedia.listVideos(),
      ]);

      const normalizedMusic = (music || []).map((item) => ({
        id: `music:${item.id}`,
        kind: "music",
        title: item.title || item.name || "Untitled track",
        url: item.mediaUrl || item.file_uri || "",
      }));

      const normalizedVideos = (videos || []).map((item) => ({
        id: `video:${item.id}`,
        kind: "video",
        title: item.title || item.caption || item.fileName || "Untitled clip",
        url: item.mediaUrl || item.videoUrl || item.file_uri || "",
      }));

      setSources([...normalizedVideos, ...normalizedMusic]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Load catalog from DB
  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const pageSize = 400;
      let page = 1;
      let total = Number.POSITIVE_INFINITY;
      const groupedMap = new Map();
      while (((page - 1) * pageSize) < total && page <= 8) {
        const catRes = await apiClient.karaoke.getCatalog({ page, pageSize, includeExternal: true });
        total = Number(catRes?.total || 0);
        for (const group of catRes?.grouped || []) {
          const key = group?.genre || "Other";
          const existing = groupedMap.get(key) || [];
          const merged = [...existing, ...(group?.tracks || [])];
          const deduped = Array.from(new Map(merged.map((t) => [String(t.id), t])).values());
          groupedMap.set(key, deduped);
        }
        if ((catRes?.items || []).length === 0) break;
        page += 1;
      }

      const grouped = Array.from(groupedMap.entries()).map(([genre, tracks]) => ({ genre, tracks }));
      const genreRes = await apiClient.karaoke.getGenres();
      const discoveredGenres = Array.from(new Set(grouped.map((g) => g.genre).filter(Boolean)));
      setCatalog(grouped);
      setCatalogGenres(["All", ...(genreRes?.genres || [])]);
      if (discoveredGenres.length > 0) {
        setCatalogGenres((prev) => {
          const merged = new Set([...(prev || ["All"]), ...discoveredGenres]);
          return ["All", ...Array.from(merged).filter((g) => g !== "All").sort((a, b) => a.localeCompare(b))];
        });
      }
    } catch {
      // catalog unavailable — graceful degradation
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  // Filter catalog by genre
  const filteredCatalog = useMemo(() => {
    if (activeGenre === "All") return catalog;
    return catalog.filter((g) => g.genre.toLowerCase().includes(activeGenre.toLowerCase()));
  }, [catalog, activeGenre]);

  const selectedSource = useMemo(
    () => sources.find((item) => item.id === selectedId) || null,
    [selectedId, sources]
  );

  const handleLibraryUpload = async () => {
    if (!libraryUploadFile) return;
    setUploading(true);
    setError("");
    try {
      const isVideo = libraryUploadFile.type.startsWith("video/");
      await (isVideo
        ? apiClient.ravensightMedia.uploadVideo(libraryUploadFile, {
            title: libraryUploadFile.name.replace(/\.[^/.]+$/, ""),
            destinationFolder: "karaoke",
          })
        : apiClient.ravensightMedia.uploadMusic(libraryUploadFile, {
            title: libraryUploadFile.name.replace(/\.[^/.]+$/, ""),
            destinationFolder: "karaoke",
          }));
      setLibraryUploadFile(null);
      await loadSources();
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleExtractSelected = async () => {
    if (!selectedSource) return;
    setExtracting(true);
    setError("");
    setLyrics("");
    try {
      const playableUrl = await getPlayableUrl(selectedSource.url);
      if (!playableUrl) {
        throw new Error("This item does not have a playable media URL.");
      }
      const result = await transcribeUrl(playableUrl, selectedSource.title);
      setLyrics(extractTranscriptText(result));
      setLrc(result?.lrc || "");
      setWordCount(result?.word_count ?? null);
      setVocalsIsolated(result?.vocals_isolated ?? false);
    } catch (extractError) {
      setError(extractError?.message || "Word extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  const handleTranscribeLocal = async () => {
    if (!localFile) return;
    setExtracting(true);
    setError("");
    setLyrics("");
    try {
      const result = await transcribeFile(localFile);
      setLyrics(extractTranscriptText(result));
      setLrc(result?.lrc || "");
      setWordCount(result?.word_count ?? null);
      setVocalsIsolated(result?.vocals_isolated ?? false);
    } catch (extractError) {
      setError(extractError?.message || "Word extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  // Extract words from a catalog track via its source URL
  const handleExtractCatalogTrack = async (track) => {
    setCatalogTrack(track);
    setExtracting(true);
    setError("");
    setLyrics("");
    setLrc("");
    setWordCount(null);
    setVocalsIsolated(false);

    // Record a play for DB-backed tracks only.
    if (track?.sourceType !== "external") {
      apiClient.karaoke.recordPlay(track.id).catch(() => {});
    }

    // If the track already has LRC content or plain lyrics — show immediately
    if (track.lrcContent) {
      setLrc(track.lrcContent);
      setLyrics(track.lrcContent);
      setExtracting(false);
      return;
    }
    if (track.plainLyrics) {
      setLyrics(track.plainLyrics);
      setExtracting(false);
      return;
    }

    // If the track has a ready instrumental blob URL — run word extraction on it
    const audioUrl = track.instrumentalUrl || track.sourceUrl;
    if (!audioUrl) {
      setError(`No audio URL available for "${track.title}". It may still be processing.`);
      setExtracting(false);
      return;
    }
    try {
      const result = await transcribeUrl(audioUrl, `${track.artist} - ${track.title}`);
      setLyrics(extractTranscriptText(result));
      setLrc(result?.lrc || "");
      setWordCount(result?.word_count ?? null);
      setVocalsIsolated(result?.vocals_isolated ?? false);
    } catch (err) {
      setError(err?.message || "Word extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  if (loading && catalogLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KaraokePaywall currentUser={currentUser} onAuthRequired={onAuthRequired}>

        {/* ── Tab switcher ───────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-border mb-2">
          {[
            { id: "catalog", label: "Song Catalog", icon: Music2 },
            { id: "library", label: "My Library",   icon: Mic },
            { id: "local",   label: "Local File",   icon: FileAudio2 },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors -mb-px ${
                activeTab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Song Catalog ──────────────────────────────────────── */}
        {activeTab === "catalog" && (
          <div className="space-y-4">
            {/* Genre chips — clicking scrolls to that genre section */}
            <div className="flex flex-wrap gap-2">
              {catalogGenres.map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setActiveGenre(g);
                    if (g === "All") {
                      document.getElementById("karaoke-catalog-top")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    } else {
                      document.getElementById(`genre-section-${g.replace(/[^a-z0-9]/gi, "-")}`)
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeGenre === g
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>

            {catalogLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                No songs found for "{activeGenre}".
              </div>
            ) : (
              <div id="karaoke-catalog-top" className="space-y-3">
                {/* Always render all groups sorted by genre; selected genre stays highlighted */}
                {(activeGenre === "All" ? catalog : filteredCatalog)
                  .slice()
                  .sort((a, b) => a.genre.localeCompare(b.genre))
                  .map((group) => {
                  const sectionId = `genre-section-${group.genre.replace(/[^a-z0-9]/gi, "-")}`;
                  const isActive  = activeGenre === "All" || activeGenre === group.genre || group.genre.toLowerCase().includes(activeGenre.toLowerCase());
                  const isOpen    = expandedGenres[group.genre] !== false; // default open
                  return (
                    <div
                      key={group.genre}
                      id={sectionId}
                      className={`rounded-xl border overflow-hidden transition-colors ${
                        isActive && activeGenre !== "All"
                          ? "border-primary/40"
                          : "border-border"
                      }`}
                    >
                      {/* Genre header */}
                      <button
                        onClick={() => setExpandedGenres((e) => ({ ...e, [group.genre]: !isOpen }))}
                        className={`w-full flex items-center justify-between px-4 py-2.5 transition-colors text-left ${
                          isActive && activeGenre !== "All"
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "bg-secondary/30 hover:bg-secondary/50"
                        }`}
                      >
                        <span className="text-sm font-semibold text-foreground">{group.genre}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{group.tracks.length} track{group.tracks.length !== 1 ? "s" : ""}</span>
                          {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Track list */}
                      {isOpen && (
                        <div className="divide-y divide-border">
                          {group.tracks.map((track) => {
                            const isSelected = catalogTrack?.id === track.id;
                            const isReady    = track.status === "Ready";
                            const hasMaterial = track.lrcContent || track.plainLyrics || track.instrumentalUrl || track.sourceUrl;
                            return (
                              <div
                                key={track.id}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                                  isSelected ? "bg-primary/10" : "hover:bg-secondary/20"
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{track.title}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {track.artist}
                                    {track.year ? ` · ${track.year}` : ""}
                                    {" · "}
                                    {track.source ? `${track.source} · ` : ""}
                                    <span className={`capitalize ${isReady ? "text-green-500" : "text-muted-foreground"}`}>
                                      {track.status?.toLowerCase()}
                                    </span>
                                    {track.license ? ` · ${track.license.replace("Lyrics via LRCLIB (fair-use display only)", "Lyrics only")}` : ""}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* LRC / lyrics already available */}
                                  {(track.lrcContent || track.plainLyrics) && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">
                                      <BookOpen className="inline w-2.5 h-2.5 mr-0.5" />Lyrics
                                    </span>
                                  )}
                                  {/* Source link */}
                                  {track.sourceUrl && (
                                    <a
                                      href={track.sourceUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-muted-foreground hover:text-foreground"
                                      title="View source"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  )}
                                  {/* Extract / Play button */}
                                  <Button
                                    size="sm"
                                    variant={isSelected ? "default" : "outline"}
                                    disabled={extracting || !hasMaterial}
                                    onClick={() => handleExtractCatalogTrack(track)}
                                    title={!hasMaterial ? "No audio available yet — pending processing" : "Extract words"}
                                  >
                                    {extracting && isSelected
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <Play className="w-3.5 h-3.5" />
                                    }
                                    {extracting && isSelected ? "Extracting…" : "Extract"}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: My Library ────────────────────────────────────────── */}
        {activeTab === "library" && (
          <>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Upload from PC</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload an audio or video file into the library, then extract words from it.
          </p>
          <div className="flex flex-col gap-2">
            <Input
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => setLibraryUploadFile(e.target.files?.[0] || null)}
            />
            <Button onClick={handleLibraryUpload} disabled={!libraryUploadFile || uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? "Uploading..." : "Upload to Library"}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Library word extraction</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Pick any music or video already stored in Ravensight and turn it into words.
          </p>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground"
          >
            <option value="">Select a media source...</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.kind === "video" ? "Video" : "Music"} · {source.title}
              </option>
            ))}
          </select>
          <Button onClick={handleExtractSelected} disabled={!selectedSource || extracting}>
            {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {extracting ? "Extracting words..." : "Extract Words"}
          </Button>
        </div>
          </>
        )}

        {/* ── Tab: Local File ────────────────────────────────────────── */}
        {activeTab === "local" && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileAudio2 className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Direct local transcription</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Transcribe a file immediately without waiting for the upload to finish.
            Vocals are isolated automatically before transcription for best accuracy.
          </p>
          <div className="flex flex-col gap-2">
            <Input
              type="file"
              accept="audio/*,video/*"
              onChange={(e) => setLocalFile(e.target.files?.[0] || null)}
            />
            <Button onClick={handleTranscribeLocal} disabled={!localFile || extracting}>
              {extracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {extracting ? "Transcribing..." : "Transcribe Local File"}
            </Button>
          </div>
        </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Selected catalog track info */}
        {catalogTrack && (
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Selected track</p>
            <p className="text-sm font-medium text-foreground mt-1">{catalogTrack.artist} — {catalogTrack.title}</p>
            <p className="text-xs text-muted-foreground">
              {catalogTrack.genre}{catalogTrack.year ? ` · ${catalogTrack.year}` : ""}
              {" · "}{catalogTrack.license}
            </p>
          </div>
        )}

        {selectedSource && !catalogTrack && (
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Selected source</p>
            <p className="text-sm font-medium text-foreground mt-1">{selectedSource.title}</p>
            <p className="text-xs text-muted-foreground">
              {selectedSource.kind === "video" ? "Video clip" : "Music track"}
            </p>
          </div>
        )}

        <KaraokeTranscriber
          sessionId={catalogTrack?.id || selectedSource?.id || undefined}
          songMetadata={
            catalogTrack
              ? {
                  trackId: catalogTrack.id,
                  language: catalogTrack.language || "",
                  languageCodes: catalogTrack.language ? [catalogTrack.language] : [],
                }
              : null
          }
        />

        {lyrics && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-medium text-accent">Extracted words</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {vocalsIsolated && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Mic className="w-3 h-3" /> Vocals isolated
                  </span>
                )}
                {wordCount !== null && (
                  <span>{wordCount} words</span>
                )}
              </div>
            </div>
            {lrc && (
              <details className="group">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  LRC timed lyrics
                </summary>
                <div className="max-h-48 overflow-y-auto mt-2">
                  <pre className="text-xs text-foreground font-mono whitespace-pre-wrap">{lrc}</pre>
                </div>
              </details>
            )}
            <div className="max-h-64 overflow-y-auto">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{lyrics}</p>
            </div>
          </div>
        )}
      </KaraokePaywall>
    </div>
  );
}
