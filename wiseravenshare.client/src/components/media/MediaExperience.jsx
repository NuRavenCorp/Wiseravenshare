import React, { createContext, useCallback, useContext, useState } from "react";
import ReactPlayer from "react-player";
import { ChevronUp, Minimize2, X } from "lucide-react";
import { getPlayableUrl } from "@/lib/mediaUtils";
import ZoomableImage from "@/components/media/ZoomableImage";
import MusicPlayer from "@/components/media/MusicPlayer";

const MediaExperienceContext = createContext(null);

export function MediaExperienceProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [musicExpanded, setMusicExpanded] = useState(false);
  const openMedia = useCallback((media) => {
    const kind = String(media?.type || media?.asset_type || "").toLowerCase();
    const type = kind === "audio" || kind === "music" ? "music"
      : kind === "image" || kind === "photo" ? "photo"
      : kind === "video" ? "video" : "";
    const mediaId = media?.id ?? media?.trackId ?? media?.TrackId ?? media?.assetId ?? media?.AssetId ?? null;
    const url = media?.url || media?.file_uri || media?.mediaUrl || media?.videoUrl || media?.imageUrl || "";
    if (!type || (!url && !(type === "music" && mediaId))) return;
    setRequest({ ...media, id: mediaId ?? media?.id, type, url, title: media.title || media.fileName || "Untitled media" });
    if (type === "music") {
      setMusicExpanded(true);
    }
  }, []);
  const closeMedia = useCallback(() => {
    setMusicExpanded(false);
    setRequest((current) => (current?.type === "music" ? current : null));
  }, []);
  const stopMusic = useCallback(() => {
    setMusicExpanded(false);
    setRequest((current) => (current?.type === "music" ? null : current));
  }, []);

  return (
    <MediaExperienceContext.Provider value={{ openMedia, closeMedia }}>
      {children}
      {request?.type === "music" ? (
        <PersistentMusicPlayer
          key={`${request.type}:${request.id || request.url}`}
          request={request}
          expanded={musicExpanded}
          onExpand={() => setMusicExpanded(true)}
          onMinimize={() => setMusicExpanded(false)}
          onStop={stopMusic}
        />
      ) : request ? (
        <MediaExperienceModal key={`${request.type}:${request.id || request.url}`} request={request} onClose={closeMedia} />
      ) : null}
    </MediaExperienceContext.Provider>
  );
}

export function useMediaExperience() {
  const context = useContext(MediaExperienceContext);
  if (!context) throw new Error("useMediaExperience must be used inside MediaExperienceProvider");
  return context;
}

function MediaExperienceModal({ request, onClose }) {
  const [url, setUrl] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [videoError, setVideoError] = useState("");
  React.useEffect(() => {
    if (request.type === "music") return undefined;
    let active = true;
    getPlayableUrl(request.url)
      .then((resolved) => {
        if (active) {
          setUrl(resolved || request.url);
          setMediaError("");
        }
      })
      .catch((error) => {
        if (active) setMediaError(error?.message || "This media could not be prepared for playback.");
      });
    return () => { active = false; };
  }, [request.type, request.url]);

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <section className="w-full max-w-5xl max-h-[92vh] overflow-auto rounded-xl border border-border bg-background p-4" onClick={(event) => event.stopPropagation()}>
        <header className="mb-3 flex items-center justify-between gap-3">
          <h2 className="truncate text-sm font-semibold">{request.title}</h2>
          <button type="button" onClick={onClose} aria-label="Close media player" className="rounded p-1 text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </header>
        {request.type === "music" ? <MusicPlayer initialTrack={request} initialQueue={request.queue} />
          : mediaError ? <p role="alert" className="py-16 text-center text-sm text-destructive">{mediaError}</p>
          : !url ? <div className="py-16 text-center text-sm text-muted-foreground">Loading media…</div>
          : request.type === "photo" ? <ZoomableImage src={url} alt={request.title} className="mx-auto h-[78vh] w-full rounded-lg" fittingType="fill" />
          : (
            <div>
              <ReactPlayer
                url={url}
                controls
                playsInline
                preload="metadata"
                width="100%"
                height="min(78vh, 56.25vw)"
                style={{ maxHeight: "78vh", aspectRatio: "16 / 9", background: "#000", borderRadius: "0.5rem", overflow: "hidden" }}
                onError={(error) => setVideoError(error?.message || "This video could not be played in this browser.")}
                onPlaying={() => setVideoError("")}
              />
              {videoError && <p role="alert" className="mt-3 text-sm text-destructive">{videoError}</p>}
            </div>
          )}
      </section>
    </div>
  );
}

function PersistentMusicPlayer({ request, expanded, onExpand, onMinimize, onStop }) {
  return (
    <>
      <div className={`fixed bottom-4 right-4 z-[100] w-[min(56rem,calc(100vw-2rem))] transition-all ${expanded ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-full opacity-0 pointer-events-none"}`}>
        <section className="rounded-xl border border-border bg-background p-4 shadow-2xl">
          <header className="mb-3 flex items-center justify-between gap-3">
            <h2 className="truncate text-sm font-semibold">{request.title}</h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={onMinimize} aria-label="Minimize music player" className="rounded p-1 text-muted-foreground hover:text-foreground">
                <Minimize2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={onStop} aria-label="Stop music player" className="rounded p-1 text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>
          <MusicPlayer initialTrack={request} initialQueue={request.queue} />
        </section>
      </div>
      {!expanded && (
        <button
          type="button"
          onClick={onExpand}
          className="fixed bottom-4 right-4 z-[100] flex max-w-[80vw] items-center gap-2 rounded-full border border-border bg-background px-3 py-2 text-xs text-foreground shadow-lg hover:bg-secondary/40"
        >
          <ChevronUp className="h-4 w-4 text-primary" />
          <span className="truncate">Now playing: {request.title}</span>
        </button>
      )}
    </>
  );
}
