import React, { createContext, useCallback, useContext, useState } from "react";
import { X } from "lucide-react";
import { getPlayableUrl } from "@/lib/mediaUtils";
import ZoomableImage from "@/components/media/ZoomableImage";
import MusicPlayer from "@/components/media/MusicPlayer";

const MediaExperienceContext = createContext(null);

export function MediaExperienceProvider({ children }) {
  const [request, setRequest] = useState(null);
  const openMedia = useCallback((media) => {
    const kind = String(media?.type || media?.asset_type || "").toLowerCase();
    const type = kind === "audio" || kind === "music" ? "music"
      : kind === "image" || kind === "photo" ? "photo"
      : kind === "video" ? "video" : "";
    const url = media?.url || media?.file_uri || media?.mediaUrl || media?.videoUrl || media?.imageUrl || "";
    if (!type || (!url && !(type === "music" && media?.id))) return;
    setRequest({ ...media, type, url, title: media.title || media.fileName || "Untitled media" });
  }, []);
  const closeMedia = useCallback(() => setRequest(null), []);

  return (
    <MediaExperienceContext.Provider value={{ openMedia, closeMedia }}>
      {children}
      {request && <MediaExperienceModal key={`${request.type}:${request.id || request.url}`} request={request} onClose={closeMedia} />}
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
  React.useEffect(() => {
    if (request.type === "music") return undefined;
    let active = true;
    getPlayableUrl(request.url).then((resolved) => { if (active) setUrl(resolved || request.url); });
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
          : !url ? <div className="py-16 text-center text-sm text-muted-foreground">Loading media…</div>
          : request.type === "photo" ? <ZoomableImage src={url} alt={request.title} className="mx-auto max-h-[78vh] w-full rounded-lg" fittingType="fit" />
          : <video src={url} controls autoPlay playsInline className="mx-auto max-h-[78vh] w-full rounded-lg border border-border bg-black" />}
      </section>
    </div>
  );
}
