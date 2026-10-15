import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Film, Clapperboard } from "lucide-react";
import { getPlayableUrl } from "@/lib/mediaUtils";
import MediaManager from "@/components/media/MediaManager";

export default function PodcastMediaTab({ podcast, onUpdate }) {
  const [uploading, setUploading] = useState(false);
  const [episodeUrl, setEpisodeUrl] = useState(null);
  const [teaserUrl, setTeaserUrl] = useState(null);

  useEffect(() => {
    if (podcast.episode_media_uri) getPlayableUrl(podcast.episode_media_uri).then(setEpisodeUrl);
    else setEpisodeUrl(null);
    if (podcast.teaser_video_uri) getPlayableUrl(podcast.teaser_video_uri).then(setTeaserUrl);
    else setTeaserUrl(null);
  }, [podcast.episode_media_uri, podcast.teaser_video_uri]);

  const handleUploadEpisode = async (files) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      await apiClient.entities.Podcast.update(podcast.id, { episode_media_uri: upload.mediaUrl || upload.file?.mediaUrl || "" });
      onUpdate?.();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteEpisode = async () => {
    await apiClient.entities.Podcast.update(podcast.id, { episode_media_uri: "" });
    setEpisodeUrl(null);
    onUpdate?.();
  };

  const handleUploadTeaser = async (files) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    try {
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      await apiClient.entities.Podcast.update(podcast.id, { teaser_video_uri: upload.mediaUrl || upload.file?.mediaUrl || "" });
      onUpdate?.();
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteTeaser = async () => {
    await apiClient.entities.Podcast.update(podcast.id, { teaser_video_uri: "" });
    setTeaserUrl(null);
    onUpdate?.();
  };

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Film className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Full Episode Video</span>
        </div>
        <MediaManager
          items={episodeUrl ? [{ url: episodeUrl, type: "video" }] : []}
          onUpload={handleUploadEpisode}
          onDelete={handleDeleteEpisode}
          accept="video/*"
          uploading={uploading}
          emptyText="No episode video uploaded"
          multiple={false}
        />
      </div>

      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 mb-4">
          <Clapperboard className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Teaser Video</span>
        </div>
        <MediaManager
          items={teaserUrl ? [{ url: teaserUrl, type: "video" }] : []}
          onUpload={handleUploadTeaser}
          onDelete={handleDeleteTeaser}
          accept="video/*"
          uploading={uploading}
          emptyText="No teaser video uploaded"
          multiple={false}
        />
      </div>
    </div>
  );
}