import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus } from "lucide-react";

export default function PodcastForm({ onCreate }) {
  const [title, setTitle] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [subjectMatter, setSubjectMatter] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !episodeNumber || !subjectMatter) return;
    setSaving(true);
    try {
      await onCreate({
        title,
        episode_number: Number(episodeNumber),
        subject_matter: subjectMatter,
        is_premium: true,
        price_monthly: 499,
        ai_pricing: {
          assemblyai_setup: {
            automatic_transcription: true,
            speaker_diarization: true,
            auto_chapters: true,
            content_insights: true,
            voice_agent: false,
            speaker_labels: true,
            iab_categories: true,
            sentiment_analysis: true,
            provider: "assemblyai",
            updated_at: new Date().toISOString(),
          },
        },
      });
      setTitle("");
      setEpisodeNumber("");
      setSubjectMatter("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Episode title"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Episode #</Label>
          <Input
            type="number"
            min="1"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Subject Matter</Label>
          <Input
            value={subjectMatter}
            onChange={(e) => setSubjectMatter(e.target.value)}
            placeholder="Topic of the episode"
          />
        </div>
      </div>
      <Button
        type="submit"
        disabled={saving || !title || !episodeNumber || !subjectMatter}
        className="w-full"
      >
        {saving ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Plus className="w-4 h-4" />
        )}
        Start Episode
      </Button>
    </form>
  );
}