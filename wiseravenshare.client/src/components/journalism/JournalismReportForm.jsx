import React, { useState } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Sparkles, Send, Image as ImageIcon, Video, FileText, ShieldCheck, ShieldAlert } from "lucide-react";

const FIELDS = [
  { key: "who", label: "Who", placeholder: "Who is involved? Names, groups, organizations..." },
  { key: "what", label: "What", placeholder: "What happened? Describe the event...", textarea: true },
  { key: "where", label: "Where", placeholder: "Where did it happen? Location, city, address..." },
  { key: "when", label: "When", placeholder: "When did it happen? Date, time, timeframe..." },
  { key: "why", label: "Why", placeholder: "Why did it happen? Context, causes, motivations..." },
  { key: "how", label: "How", placeholder: "How did it happen? Process, method, sequence..." },
];

export default function JournalismReportForm({ onPublished }) {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fields, setFields] = useState({ who: "", what: "", where: "", when: "", why: "", how: "" });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [editedBody, setEditedBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [integrityResult, setIntegrityResult] = useState(null);

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of files) {
        const { file_url } = await apiClient.integrations.Core.UploadPublicFile({ file });
        uploaded.push({
          url: file_url,
          type: file.type.startsWith("video/") ? "video" : "photo",
          name: file.name,
        });
      }
      setMedia((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setError("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removeMedia = (idx) => {
    setMedia((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleGenerate = async () => {
    if (!fields.what.trim()) {
      setError("Please describe what happened before generating.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GenerateJournalismReport", {
        ...fields,
        mediaDescription: media.map((m) => `${m.type}: ${m.name}`).join(", "),
      });
      setGenerated(res.data);
      setEditedBody(res.data.body);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!generated) return;
    setPublishing(true);
    setError(null);
    try {
      const content = `${generated.headline}\n\n${editedBody}`;
      const post = await apiClient.entities.Post.create({
        content,
        post_type: "journalism",
        media_uris: media.map((m) => m.url),
        region: fields.where || undefined,
        status: "published",
      });
      // Create a tracking record for admin verification
      try {
        await apiClient.entities.JournalismReport.create({
          post_id: post.id,
          headline: generated.headline,
          description: fields.what || undefined,
          region: fields.where || undefined,
          verification_status: "under_review",
        });
      } catch (e) {
        console.error("Failed to create journalism report tracker:", e?.message || e);
      }
      setPublishing(false);
      setScoring(true);
      try {
        const res = await apiClient.functions.invoke("ScoreTruth", {
          post_id: post.id,
        });
        setIntegrityResult(res.data);
      } catch {
        setError(
          "Report published, but the integrity filter failed. You can score it manually from TruthSeeker."
        );
      } finally {
        setScoring(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Failed to publish report.");
      setPublishing(false);
    }
  };

  const handleDone = () => {
    setMedia([]);
    setFields({ who: "", what: "", where: "", when: "", why: "", how: "" });
    setGenerated(null);
    setEditedBody("");
    setIntegrityResult(null);
    if (onPublished) onPublished();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      {/* Upload section */}
      <div>
        <Label className="text-sm font-medium text-foreground mb-3 block">
          Photo / Video Evidence
        </Label>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg p-6 cursor-pointer hover:border-primary/40 transition-colors">
          <Upload className="w-6 h-6 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : "Click to upload photos or videos"}
          </span>
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
            disabled={uploading}
          />
        </label>
        {uploading && (
          <div className="flex items-center justify-center gap-2 mt-3 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Uploading files...
          </div>
        )}
        {media.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
            {media.map((m, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-border aspect-square bg-muted/20">
                {m.type === "video" ? (
                  <video src={m.url} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removeMedia(idx)}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3 text-foreground" />
                </button>
                <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-background/80 rounded px-1.5 py-0.5">
                  {m.type === "video" ? (
                    <Video className="w-3 h-3 text-primary" />
                  ) : (
                    <ImageIcon className="w-3 h-3 text-primary" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5W1H form */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText className="w-4 h-4 text-primary" />
          Field Notes — The Five W's & H
        </div>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">
              {f.label}
            </Label>
            {f.textarea ? (
              <Textarea
                value={fields[f.key]}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={3}
                className="resize-none"
              />
            ) : (
              <Input
                value={fields[f.key]}
                onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            )}
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Generate button */}
      {!generated && (
        <Button
          onClick={handleGenerate}
          disabled={generating || uploading || !fields.what.trim()}
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Writing your report...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate AI Report
            </>
          )}
        </Button>
      )}

      {/* Generated article preview */}
      {generated && (
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4 bg-background/50">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">AI-Generated Report</span>
            </div>
            <h3 className="font-heading text-xl text-foreground mb-3">{generated.headline}</h3>
            <Textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={10}
              className="resize-y text-sm leading-relaxed"
              placeholder="Edit the article body..."
            />
            <p className="text-xs text-muted-foreground mt-2">
              Edit the text above before publishing. Your raw notes and media will be attached.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setGenerated(null);
                setEditedBody("");
              }}
              disabled={publishing}
            >
              Start Over
            </Button>
            <Button onClick={handlePublish} disabled={publishing} className="flex-1">
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Publishing...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Publish Report
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {scoring && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Running AI integrity filters...
            </p>
            <p className="text-xs text-muted-foreground">
              Analyzing truth score, AI detection, and verifiability.
            </p>
          </div>
        </div>
      )}

      {integrityResult && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">
              AI Integrity Report
            </span>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center shrink-0">
              <div
                className={`text-4xl font-heading ${
                  integrityResult.truth_score >= 70
                    ? "text-green-500"
                    : integrityResult.truth_score >= 50
                    ? "text-accent"
                    : "text-destructive"
                }`}
              >
                {integrityResult.truth_score}
              </div>
              <div className="text-xs text-muted-foreground">Truth Score</div>
            </div>
            <div className="flex-1">
              <span
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full capitalize ${
                  integrityResult.status === "verified"
                    ? "bg-green-500/15 text-green-500"
                    : integrityResult.status === "flagged"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-accent/15 text-accent"
                }`}
              >
                {integrityResult.status === "verified" ? (
                  <ShieldCheck className="w-3 h-3" />
                ) : (
                  <ShieldAlert className="w-3 h-3" />
                )}
                {integrityResult.status}
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                {Math.round((integrityResult.confidence || 0) * 100)}%
                confidence
              </span>
            </div>
          </div>
          {integrityResult.factors?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                Factors
              </p>
              <ul className="space-y-1.5">
                {integrityResult.factors.map((f, i) => (
                  <li
                    key={i}
                    className="text-sm text-foreground/80 flex items-start gap-2"
                  >
                    <span className="text-primary mt-0.5">•</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {integrityResult.ai_detection_flags?.length > 0 && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-xs text-destructive font-medium mb-1 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5" /> AI Detection Flags
              </p>
              <p className="text-sm text-destructive/80">
                {integrityResult.ai_detection_flags.join(", ")}
              </p>
            </div>
          )}
          <Button onClick={handleDone} className="w-full">
            Done
          </Button>
        </div>
      )}
    </div>
  );
}