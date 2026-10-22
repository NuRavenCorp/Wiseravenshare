import React, { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Loader2, Mic, Wand2, Upload, FileAudio2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KaraokePaywall from "@/components/media/KaraokePaywall";

async function transcribeFile(file) {
  const body = new FormData();
  body.append("audio", file);
  const endpoints = [
    "/api/functions/transcribe-local-file",
    "/api/assistant/audio/transcribe",
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      return await apiClient.requestJson(endpoint, {
        method: "POST",
        body,
      });
    } catch (error) {
      lastError = error;
      if (![404, 405].includes(error?.status)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Unable to transcribe file.");
}

async function transcribeUrl(url, fileName) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to load media (${response.status})`);
  }

  const blob = await response.blob();
  const file = new File([blob], fileName || "karaoke-media", {
    type: blob.type || "application/octet-stream",
  });
  return transcribeFile(file);
}

export default function KaraokeExtractor({ currentUser, onAuthRequired }) {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [error, setError] = useState("");
  const [libraryUploadFile, setLibraryUploadFile] = useState(null);
  const [localFile, setLocalFile] = useState(null);
  const [uploading, setUploading] = useState(false);

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
      setLyrics(result?.lyrics || result?.text || result?.transcript || JSON.stringify(result, null, 2));
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
      setLyrics(result?.lyrics || result?.text || result?.transcript || JSON.stringify(result, null, 2));
    } catch (extractError) {
      setError(extractError?.message || "Word extraction failed.");
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <KaraokePaywall currentUser={currentUser} onAuthRequired={onAuthRequired}>
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

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileAudio2 className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-foreground">Direct local transcription</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Transcribe a file immediately without waiting for the upload to finish.
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        {selectedSource && (
          <div className="rounded-lg border border-border bg-secondary/20 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Selected source</p>
            <p className="text-sm font-medium text-foreground mt-1">{selectedSource.title}</p>
            <p className="text-xs text-muted-foreground">
              {selectedSource.kind === "video" ? "Video clip" : "Music track"}
            </p>
          </div>
        )}

        {lyrics && (
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
            <p className="text-xs font-medium text-accent mb-2">Extracted words</p>
            <div className="max-h-96 overflow-y-auto">
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{lyrics}</p>
            </div>
          </div>
        )}
      </KaraokePaywall>
    </div>
  );
}
