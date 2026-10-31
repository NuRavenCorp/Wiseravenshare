import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Mic, Wand2, Upload, FileAudio2, Music2, ChevronDown, ChevronRight, Play, BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KaraokePaywall from "@/components/media/KaraokePaywall";
import KaraokeTranscriber from "@/components/media/KaraokeTranscriber";
import KaraokeSingView from "@/components/media/KaraokeSingView";

function readAccessToken() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return window.localStorage.getItem("wiseravenshare_access_token")
    || window.localStorage.getItem("token")
    || "";
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert AssemblyAI words[] (start/end in seconds) to LRC format.
 * Groups words into lines by silence gap or max word count.
 */
function wordsToLrc(words = [], { maxWordsPerLine = 7, silenceGapSeconds = 1.5 } = {}) {
  if (!Array.isArray(words) || words.length === 0) return "";
  const lines = [];
  let lineWords = [];
  let lineStart = words[0].start;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const gap = prev ? (w.start - prev.end) : 0;
    if (lineWords.length > 0 && (gap >= silenceGapSeconds || lineWords.length >= maxWordsPerLine)) {
      const mm = String(Math.floor(lineStart / 60)).padStart(2, "0");
      const ss = String(Math.floor(lineStart % 60)).padStart(2, "0");
      const ms = String(Math.round((lineStart % 1) * 100)).padStart(2, "0");
      lines.push(`[${mm}:${ss}.${ms}]${lineWords.join(" ")}`);
      lineWords = [];
      lineStart = w.start;
    }
    lineWords.push(w.word);
  }
  if (lineWords.length > 0) {
    const mm = String(Math.floor(lineStart / 60)).padStart(2, "0");
    const ss = String(Math.floor(lineStart % 60)).padStart(2, "0");
    const ms = String(Math.round((lineStart % 1) * 100)).padStart(2, "0");
    lines.push(`[${mm}:${ss}.${ms}]${lineWords.join(" ")}`);
  }
  return lines.join("\n");
}

/** Normalize any transcription response into { text, lrc, words, word_count, vocals_isolated }. */
function normalizeTranscriptResult(result) {
  if (!result) return { text: "", lrc: "", words: [], word_count: 0, vocals_isolated: false };
  const words = Array.isArray(result.words) ? result.words : [];
  // Generate LRC from words array if we have timing data
  const lrcFromWords = words.length > 0 ? wordsToLrc(words) : "";
  const lrc = result.lrc || lrcFromWords;
  const text = result.text || result.lyrics || result.transcript || words.map((w) => w.word).join(" ").trim();
  return {
    text,
    lrc,
    words,
    word_count: result.word_count ?? words.length,
    vocals_isolated: result.vocals_isolated ?? false,
    transcript_id: result.transcript_id,
    language_code: result.language_code,
  };
}

async function transcribeFile(file) {
  // Primary: AssemblyAI Sync API via /api/podcast-audio/assemblyai/transcribe
  // No 120s cap, handles songs up to 20 minutes. extractAudioFirst=true runs
  // ffmpeg vocal extraction on the server before sending to AssemblyAI.
  try {
    const result = await apiClient.podcastAudio.transcribeFile(file, {
      extractAudioFirst: true,
      wordTimestamps: true,
    });
    const hasContent = (result?.text || "").trim().length > 0 || (result?.words?.length || 0) > 0;
    if (hasContent) return result;
  } catch (primaryError) {
    const status = primaryError?.status;
    // If audio service is unavailable/misconfigured/rate-limited, fall through.
    if (![404, 405, 429, 502, 503].includes(status)) throw primaryError;
  }

  // Fallback: karaoke-speech microservice endpoints
  const endpoints = [
    "/api/karaoke/speech/transcribe/words",
    "/api/functions/words-karaoke",
    "/api/functions/WordsKaraoke",
    "/api/functions/transcribe-local-file",
    "/api/functions/TranscribeLocalFile",
    "/api/karaoke/speech/transcribe",
  ];

  let lastError = null;
  let preferredError = null;
  let rateLimitError = null;
  const attempts = [];
  for (const endpoint of endpoints) {
    let retry429 = 0;
    while (retry429 < 4) {
      const body = new FormData();
      body.append("audio", file);
      try {
        const result = await apiClient.requestJson(endpoint, { method: "POST", body, omitAuth: true });
        const transcript = (result?.lyrics || result?.text || result?.transcript || result?.lrc || "").toString().trim();
        const hasWordPayload = Array.isArray(result?.words) && result.words.length > 0;
        if (transcript.length > 0 || hasWordPayload) return result;
        lastError = new Error("Transcription returned empty output.");
        attempts.push(`${endpoint} -> empty`);
        break;
      } catch (error) {
        const status = error?.status;
        if (status === 429 && retry429 < 3) {
          retry429 += 1;
          attempts.push(`${endpoint} -> 429 (retry ${retry429})`);
          await wait(Math.min(750 * (2 ** (retry429 - 1)), 5000));
          continue;
        }
        lastError = error;
        const msg = String(error?.data?.message || error?.message || "").trim();
        attempts.push(`${endpoint} -> ${status ?? "ERR"}${msg ? ` (${msg})` : ""}`);
        if (status === 429 && !rateLimitError) {
          rateLimitError = error;
        } else if (!preferredError && ![404, 405, 429].includes(status)) {
          preferredError = error;
        }
        if (![400, 401, 403, 404, 405, 415, 422, 429, 500, 502, 503, 504].includes(status)) throw error;
        break;
      }
    }
  }

  const err = preferredError || rateLimitError || lastError;
  if (err) {
    if (err?.status === 429 && !preferredError) {
      err.message = "Transcription providers are temporarily rate limited. Please retry in 20-30 seconds.";
      throw err;
    }
    const details = attempts.length ? ` Tried: ${attempts.join(", ")}` : "";
    err.message = `${err.message}${details}`;
  }
  throw err || new Error("Unable to transcribe file.");
}

async function transcribeUrl(url, fileName) {
  // Primary: AssemblyAI Sync API via /api/podcast-audio/assemblyai/transcribe-url
  try {
    const result = await apiClient.podcastAudio.transcribeUrl(url, {
      wordTimestamps: true,
    });
    const hasContent = (result?.text || "").trim().length > 0 || (result?.words?.length || 0) > 0;
    if (hasContent) return result;
  } catch (primaryError) {
    const status = primaryError?.status;
    if (![404, 405, 429, 502, 503].includes(status)) throw primaryError;
  }

  // Fallback: download the file locally and send to old endpoints
  const extensionFromMime = (mime) => {
    const n = (mime || "").toLowerCase();
    if (n.includes("audio/mpeg")) return ".mp3";
    if (n.includes("audio/mp4")) return ".m4a";
    if (n.includes("video/mp4")) return ".mp4";
    if (n.includes("audio/wav")) return ".wav";
    if (n.includes("audio/ogg")) return ".ogg";
    if (n.includes("audio/webm") || n.includes("video/webm")) return ".webm";
    return "";
  };
  const normalizeFileName = (baseName, sourceUrl, mime) => {
    const rawName = (baseName || "karaoke-media").trim();
    if (/\.[a-z0-9]{2,8}$/i.test(rawName)) return rawName;
    let ext = "";
    try {
      const parsed = new URL(sourceUrl, window.location.origin);
      const match = (parsed.pathname || "").match(/\.[a-z0-9]{2,8}$/i);
      ext = match?.[0] || "";
    } catch { ext = ""; }
    if (!ext) ext = extensionFromMime(mime);
    return `${rawName}${ext || ".webm"}`;
  };

  let credentials = "include";
  const headers = {};
  const token = (typeof window !== "undefined" && window.localStorage)
    ? (window.localStorage.getItem("wiseravenshare_access_token") || window.localStorage.getItem("token") || "")
    : "";
  try {
    const resolved = new URL(url, window.location.origin);
    if (resolved.origin !== window.location.origin && /^https?:$/i.test(resolved.protocol)) {
      credentials = "omit";
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    credentials = "include";
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { credentials, headers });
  if (!response.ok) throw new Error(`Failed to load media (${response.status})`);
  const blob = await response.blob();
  const normalizedName = normalizeFileName(fileName || "karaoke-media", url, blob.type);
  const file = new File([blob], normalizedName, { type: blob.type || "application/octet-stream" });
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

function parseLrcLines(lrcText = "") {
  const lines = String(lrcText || "").split(/\r?\n/);
  const parsed = [];
  for (const raw of lines) {
    const match = raw.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$/);
    if (!match) continue;
    const minutes = Number(match[1] || 0);
    const seconds = Number(match[2] || 0);
    const fractional = String(match[3] || "0").padEnd(3, "0").slice(0, 3);
    const text = String(match[4] || "").trim();
    if (!text) continue;
    const timeSeconds = minutes * 60 + seconds + Number(fractional) / 1000;
    parsed.push({ timeSeconds, text });
  }
  return parsed.sort((a, b) => a.timeSeconds - b.timeSeconds);
}

export default function KaraokeExtractor({ currentUser, userLoading = false, onAuthRequired, onTrackSelected = null }) {
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
  const [catalogPlaybackUrl, setCatalogPlaybackUrl] = useState("");
  const [catalogPlaybackLoading, setCatalogPlaybackLoading] = useState(false);
  const [catalogPlaybackError, setCatalogPlaybackError] = useState("");
  const [activeLyricIndex, setActiveLyricIndex] = useState(-1);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState(0);
  const [singMode, setSingMode] = useState(false);   // true = full-screen singing stage
  const audioRef = useRef(null);

  const loadSources = useCallback(async () => {
    try {
      const [music, videos] = await Promise.all([
        apiClient.ravensightMedia.listMusic(),
        apiClient.ravensightMedia.listVideos(),
      ]);

      const normalizedMusic = (music || []).map((item) => ({
        id: `music:${item.id}`,
        sourceId: String(item.id || ""),
        kind: "music",
        title: item.title || item.name || "Untitled track",
        // Prefer the stable stream endpoint by track id for extraction/playback.
        url: item?.id ? `/api/ravensight/media/music/${encodeURIComponent(String(item.id))}/stream` : (item.mediaUrl || item.file_uri || ""),
        fallbackUrl: item.mediaUrl || item.file_uri || "",
      }));

      const normalizedVideos = (videos || []).map((item) => ({
        id: `video:${item.id}`,
        sourceId: String(item.id || ""),
        kind: "video",
        title: item.title || item.caption || item.fileName || "Untitled clip",
        url: item.mediaUrl || item.videoUrl || item.file_uri || "",
        fallbackUrl: item.file_uri || "",
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

  const resolveSelectedSourceCandidates = useCallback(async (source) => {
    if (!source) return [];
    const candidates = new Set([source.url, source.fallbackUrl].filter(Boolean));

    if (source.kind === "music" && source.sourceId) {
      candidates.add(`/api/ravensight/media/music/${encodeURIComponent(String(source.sourceId))}/stream`);
    }

    try {
      if (source.kind === "music") {
        const music = await apiClient.ravensightMedia.listMusic();
        const match = (music || []).find((item) => String(item?.id || "") === String(source.sourceId || ""));
        if (match) {
          if (match.mediaUrl) candidates.add(match.mediaUrl);
          if (match.file_uri) candidates.add(match.file_uri);
          if (match.id) candidates.add(`/api/ravensight/media/music/${encodeURIComponent(String(match.id))}/stream`);
        }
      } else if (source.kind === "video") {
        const videos = await apiClient.ravensightMedia.listVideos();
        const match = (videos || []).find((item) => String(item?.id || "") === String(source.sourceId || ""));
        if (match) {
          if (match.mediaUrl) candidates.add(match.mediaUrl);
          if (match.videoUrl) candidates.add(match.videoUrl);
          if (match.file_uri) candidates.add(match.file_uri);
        }
      }
    } catch {
      // Keep original candidates if refresh is unavailable.
    }

    return Array.from(candidates);
  }, []);


  const handleExtractSelected = async () => {
    if (!selectedSource) return;
    setExtracting(true);
    setError("");
    setLyrics("");
    try {
      const sourceCandidates = await resolveSelectedSourceCandidates(selectedSource);
      if (sourceCandidates.length === 0) {
        throw new Error("This item does not have a playable media URL.");
      }
      let result = null;
      let lastError = null;
      for (const sourceUrl of sourceCandidates) {
        try {
          const playableUrl = await getPlayableUrl(sourceUrl);
          if (!playableUrl) continue;
          result = await transcribeUrl(playableUrl, selectedSource.title);
          if (result) break;
        } catch (candidateError) {
          lastError = candidateError;
        }
      }
      if (!result) throw lastError || new Error("This item does not have a playable media URL.");
      const normalized = normalizeTranscriptResult(result);
      setLyrics(normalized.text);
      setLrc(normalized.lrc);
      setWordCount(normalized.word_count);
      setVocalsIsolated(normalized.vocals_isolated);
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
      const normalized = normalizeTranscriptResult(result);
      setLyrics(normalized.text);
      setLrc(normalized.lrc);
      setWordCount(normalized.word_count);
      setVocalsIsolated(normalized.vocals_isolated);
    } catch (extractError) {
      setError(extractError?.message || "Word extraction failed.");
    } finally {
      setExtracting(false);
    }
  };


  // Catalog tracks are selected for singing directly.
  // Word extraction is reserved for uploaded/local songs.
  const timedLyrics = useMemo(() => {
    const fromLrc = parseLrcLines(lrc);
    if (fromLrc.length > 0) return fromLrc;

    const lines = String(lyrics || "")
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const duration = Number(audioDurationSeconds || catalogTrack?.durationSeconds || 0);
    if (!Number.isFinite(duration) || duration <= 0) {
      return lines.map((text, index) => ({ timeSeconds: index * 3, text }));
    }

    const step = duration / Math.max(lines.length, 1);
    return lines.map((text, index) => ({ timeSeconds: index * step, text }));
  }, [lrc, lyrics, audioDurationSeconds, catalogTrack?.durationSeconds]);

  const handleSelectCatalogTrack = async (track) => {
    setCatalogTrack(track);
    onTrackSelected?.(track);
    setError("");
    setCatalogPlaybackError("");
    setCatalogPlaybackUrl("");
    setActiveLyricIndex(-1);
    setAudioDurationSeconds(0);
    setSingMode(false);

    // Record a play for DB-backed tracks only.
    if (track?.sourceType !== "external") {
      apiClient.karaoke.recordPlay(track.id).catch(() => {});
    }

    const lrcContent  = track.lrcContent  || track.lrc_content  || "";
    const plainLyrics = track.plainLyrics || track.plain_lyrics || track.lyrics || "";
    const lrcUrl      = track.lrcUrl      || track.lrc_url      || "";

    let resolvedLrc   = lrcContent;
    let resolvedPlain = plainLyrics;

    // Priority 1: use inline data from catalog
    // Priority 2: fetch from lrcUrl stored on track
    if (!resolvedLrc && lrcUrl) {
      try {
        const response = await fetch(lrcUrl, { credentials: "include" });
        if (response.ok) {
          const fetched = await response.text();
          if (fetched?.trim()) resolvedLrc = fetched;
        }
      } catch { /* non-fatal */ }
    }

    // Priority 3: on-demand LRCLib lookup via server proxy
    if (!resolvedLrc && !resolvedPlain && track.artist && track.title) {
      try {
        const lrcRes = await apiClient.karaoke.getLyrics({
          artist: track.artist,
          title:  track.title,
          album:  track.album || undefined,
          duration: track.durationSeconds || undefined,
        });
        if (lrcRes?.found) {
          resolvedLrc   = lrcRes.lrc         || "";
          resolvedPlain = lrcRes.plainLyrics  || "";
        }
      } catch { /* non-fatal — sing view will show "no lyrics" gracefully */ }
    }

    setLrc(resolvedLrc);
    setLyrics(resolvedLrc || resolvedPlain);
    setWordCount(null);
    setVocalsIsolated(false);

    const audioUrl = track.instrumentalUrl || track.sourceUrl || "";
    if (!audioUrl) {
      setSingMode(true);
      return;
    }

    setCatalogPlaybackLoading(true);
    try {
      const playableUrl = await getPlayableUrl(audioUrl);
      if (!playableUrl) {
        setCatalogPlaybackError("Instrumental audio is not available yet for this track.");
        return;
      }
      setCatalogPlaybackUrl(playableUrl);
      setSingMode(true);
    } catch {
      setCatalogPlaybackError("Could not load instrumental audio for this track.");
    } finally {
      setCatalogPlaybackLoading(false);
    }
  };

  if (loading && catalogLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // ── Singing stage: full-screen, replaces catalog ─────────────────────────
  if (singMode && catalogTrack) {
    return (
      <KaraokeSingView
        track={catalogTrack}
        playbackUrl={catalogPlaybackUrl}
        timedLyrics={timedLyrics}
        lyrics={lyrics}
        currentUser={currentUser}
        onBack={() => {
          setSingMode(false);
          setCatalogPlaybackUrl("");
          setActiveLyricIndex(-1);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <KaraokePaywall currentUser={currentUser} userLoading={userLoading} onAuthRequired={onAuthRequired}>

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
                            const hasAudio   = Boolean(track.instrumentalUrl || track.sourceUrl);
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
                                  {/* Select/Start singing button */}
                                  <Button
                                    size="sm"
                                    variant={isSelected ? "default" : "outline"}
                                    disabled={!hasAudio || (catalogPlaybackLoading && isSelected)}
                                    onClick={() => handleSelectCatalogTrack(track)}
                                    title={!hasAudio ? "No instrumental/source audio available yet" : "Start singing"}
                                  >
                                    {catalogPlaybackLoading && isSelected
                                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      : <Play className="w-3.5 h-3.5" />}
                                    {catalogPlaybackLoading && isSelected ? "Loading…" : "Start Singing"}
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

        {catalogTrack && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-primary">Karaoke stage</p>
            {catalogPlaybackLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading instrumental...
              </div>
            ) : catalogPlaybackUrl ? (
              <audio
                ref={audioRef}
                className="w-full"
                controls
                autoPlay
                src={catalogPlaybackUrl}
                onLoadedMetadata={(event) => {
                  const duration = Number(event.currentTarget.duration || 0);
                  setAudioDurationSeconds(Number.isFinite(duration) ? duration : 0);
                }}
                onTimeUpdate={(event) => {
                  if (!timedLyrics.length) return;
                  const currentTime = event.currentTarget.currentTime || 0;
                  let nextIndex = -1;
                  for (let i = 0; i < timedLyrics.length; i += 1) {
                    if (currentTime >= timedLyrics[i].timeSeconds) nextIndex = i;
                    else break;
                  }
                  setActiveLyricIndex(nextIndex);
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose a track with instrumental/source audio to start playback.
              </p>
            )}
            {catalogPlaybackError && <p className="text-sm text-destructive">{catalogPlaybackError}</p>}

            {(timedLyrics.length > 0 || lyrics) && (
              <div className="rounded-md border border-border bg-card p-3 max-h-64 overflow-y-auto">
                {timedLyrics.length > 0 ? (
                  <div className="space-y-1">
                    {timedLyrics.map((line, index) => (
                      <p
                        key={`${line.timeSeconds}-${index}`}
                        className={index === activeLyricIndex ? "text-sm text-primary font-medium" : "text-sm text-foreground/80"}
                      >
                        {line.text}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{lyrics}</p>
                )}
              </div>
            )}
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
