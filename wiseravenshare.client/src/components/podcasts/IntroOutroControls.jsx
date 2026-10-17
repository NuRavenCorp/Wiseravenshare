import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import {
  Play,
  Square,
  Upload,
  Loader2,
  Music,
  LogOut,
  Trash2,
} from "lucide-react";

export default function IntroOutroControls({ podcast, onUpdate }) {
  const [uploading, setUploading] = useState(null);
  const introAudioRef = useRef(null);
  const outroAudioRef = useRef(null);
  const introFileRef = useRef(null);
  const outroFileRef = useRef(null);

  const handleUpload = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    try {
      const upload = await apiClient.ravensightMedia.uploadMusic(file, {
        title: file.name.replace(/\.[^/.]+$/, ""),
        destinationFolder: "podcast-intros",
      });
      await apiClient.entities.Podcast.update(podcast.id, {
        [kind === "intro" ? "intro_uri" : "outro_uri"]: upload.file?.mediaUrl || upload.track?.mediaUrl || "",
      });
      onUpdate();
    } catch {
      // upload failed
    } finally {
      setUploading(null);
      if (kind === "intro" && introFileRef.current) introFileRef.current.value = "";
      if (kind === "outro" && outroFileRef.current) outroFileRef.current.value = "";
    }
  };

  const play = (kind) => {
    const ref = kind === "intro" ? introAudioRef : outroAudioRef;
    const other = kind === "intro" ? outroAudioRef : introAudioRef;
    if (other.current) other.current.pause();
    ref.current?.play().catch(() => {});
  };

  const stop = (kind) => {
    const ref = kind === "intro" ? introAudioRef : outroAudioRef;
    if (ref.current) {
      ref.current.pause();
      ref.current.currentTime = 0;
    }
  };

  const remove = async (kind) => {
    await apiClient.entities.Podcast.update(podcast.id, {
      [kind === "intro" ? "intro_uri" : "outro_uri"]: "",
    });
    onUpdate();
  };

  const Card = ({ kind, uri, label, icon: Icon, audioRef, fileRef }) => (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="w-4 h-4 text-primary" /> {label}
      </div>
      {uri ? (
        <>
          <audio ref={audioRef} src={uri} preload="auto" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => play(kind)} className="flex-1">
              <Play className="w-3.5 h-3.5" /> Play {label}
            </Button>
            <Button size="sm" variant="outline" onClick={() => stop(kind)}>
              <Square className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => remove(kind)}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        </>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading === kind}
          className="w-full py-4 rounded-md border border-dashed border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          {uploading === kind ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading...</>
          ) : (
            <><Upload className="w-4 h-4" /> Upload {label.toLowerCase()} audio</>
          )}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        onChange={(e) => handleUpload(kind, e.target.files?.[0])}
        className="hidden"
      />
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Music className="w-3.5 h-3.5 text-primary" />
        <span>Intro / Outro playback (directors &amp; producers)</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          kind="intro"
          uri={podcast.intro_uri}
          label="Intro"
          icon={Play}
          audioRef={introAudioRef}
          fileRef={introFileRef}
        />
        <Card
          kind="outro"
          uri={podcast.outro_uri}
          label="Outro"
          icon={LogOut}
          audioRef={outroAudioRef}
          fileRef={outroFileRef}
        />
      </div>
    </div>
  );
}