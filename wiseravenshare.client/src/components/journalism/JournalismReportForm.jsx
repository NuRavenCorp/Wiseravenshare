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
const MAX_POST_LENGTH = 1000;

export default function JournalismReportForm({ onPublished }) {
  const [media, setMedia] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fields, setFields] = useState({ who: "", what: "", where: "", when: "", why: "", how: "" });
  const [showGuidedNotes, setShowGuidedNotes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draftHeadline, setDraftHeadline] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [integrityResult, setIntegrityResult] = useState(null);

  const buildJournalismPrompt = () => {
    const lines = [
      "Generate a structured journalism report from these field notes.",
      `Who: ${fields.who || "Not specified"}`,
      `What: ${fields.what || "Not specified"}`,
      `Where: ${fields.where || "Not specified"}`,
      `When: ${fields.when || "Not specified"}`,
      `Why: ${fields.why || "Not specified"}`,
      `How: ${fields.how || "Not specified"}`,
    ];
    if (media.length > 0) {
      lines.push(`Media evidence: ${media.map((m) => `${m.type}: ${m.name}`).join(", ")}`);
    }
    lines.push("Return the report with a headline first, then the full body.");
    return lines.join("\n");
  };

  const parseGeneratedReport = (reply) => {
    const text = (reply || "").trim();
    if (!text) {
      return { headline: "Journalism Report", body: "" };
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headline = (lines[0] || "Journalism Report").replace(/^#+\s*/, "");
    const body = lines.slice(1).join("\n").trim() || text;
    return { headline, body };
  };

  const runIntegrityScoring = async (postId) => {
    setPublishing(false);
    setScoring(true);
    try {
      const res = await apiClient.functions.invoke("ScoreTruth", {
        postId,
      });
      setIntegrityResult(res.data);
    } catch {
      setError(
        "Report published, but the integrity filter failed. You can score it manually from TruthSeeker."
      );
    } finally {
      setScoring(false);
    }
  };

  const reconcilePublishedReport = async (content) => {
    try {
      const snapshot = await apiClient.entities.Post.filter({}, { limit: 25, sort: "-created_date" });
      const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
      const now = Date.now();
      return items.find((item) => {
        const itemContent = (item?.content || "").trim();
        if (!itemContent || itemContent !== content) return false;
        const createdAt = Date.parse(item?.created_date || item?.createdAt || "");
        if (Number.isNaN(createdAt)) return true;
        return now - createdAt <= 15 * 60 * 1000;
      }) || null;
    } catch {
      return null;
    }
  };

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
      setError("Add at least a short 'What happened' note before AI assist.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GenerateJournalismReport", {
        prompt: buildJournalismPrompt(),
      });
      if (res?.data?.error) {
        throw new Error(res.data.error);
      }

      const parsed = parseGeneratedReport(res?.data?.reply);
      setDraftHeadline((current) => current.trim() || parsed.headline);
      setDraftBody((current) => (current.trim() ? current : parsed.body));
    } catch (err) {
      setError(err?.data?.error || err?.message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    const cleanHeadline = draftHeadline.trim();
    const cleanBody = draftBody.trim();
    if (!cleanHeadline || !cleanBody) {
      setError("Add both a headline and report body before publishing.");
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      const content = `${cleanHeadline}\n\n${cleanBody}`;
      if (content.length > MAX_POST_LENGTH) {
        setError(`Report is too long (${content.length}/${MAX_POST_LENGTH}). Shorten the headline or body.`);
        setPublishing(false);
        return;
      }

      const post = await apiClient.requestJson("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          content,
          type: media.some((item) => item.type === "video") ? "Video" : (media.length > 0 ? "Image" : "Text"),
          mediaUrl: media[0]?.url || null,
          mediaUrls: media.length > 0 ? JSON.stringify(media.map((m) => m.url)) : null,
          locationName: fields.where || null,
        }),
      });
      // Create a tracking record for admin verification
      try {
        await apiClient.entities.JournalismReport.create({
          post_id: post.id,
          headline: cleanHeadline,
          description: fields.what || undefined,
          region: fields.where || undefined,
          verification_status: "verified",
        });
      } catch (e) {
        console.error("Failed to create journalism report tracker:", e?.message || e);
      }
      await runIntegrityScoring(post?.id || post?.Id);
    } catch (err) {
      const content = `${cleanHeadline}\n\n${cleanBody}`;
      const reconciled = await reconcilePublishedReport(content);
      if (reconciled?.id) {
        setError(null);
        await runIntegrityScoring(reconciled.id);
        return;
      }

      const message = (err?.data?.message || err?.message || "Failed to publish report.").toString();
      const isUpstream503 = message.includes("Error code: 503") || message.includes("via_upstream");
      setError(
        isUpstream503
          ? "Publish request timed out upstream. Please retry in a moment."
          : message
      );
      setPublishing(false);
    }
  };

  const handleDone = () => {
    setMedia([]);
    setFields({ who: "", what: "", where: "", when: "", why: "", how: "" });
    setShowGuidedNotes(false);
    setDraftHeadline("");
    setDraftBody("");
    setIntegrityResult(null);
    if (onPublished) onPublished();
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      {/* Upload section */}
      <div>
        <Label className="text-sm font-medium text-foreground mb-3 block">
          Step 1: Add evidence (optional)
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

      <div className="space-y-3">
        <Label className="text-sm font-medium text-foreground mb-1 block">
          Step 2: Write your report
        </Label>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Headline
          </Label>
          <Input
            value={draftHeadline}
            onChange={(e) => setDraftHeadline(e.target.value)}
            placeholder="Write a clear headline"
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Body
          </Label>
          <Textarea
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            rows={10}
            className="resize-y text-sm leading-relaxed"
            placeholder="Write the story, key facts, and context."
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background/40 p-4 space-y-4">
        <button
          type="button"
          onClick={() => setShowGuidedNotes((s) => !s)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-medium text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Optional: Guided notes + AI assist
          </span>
          <span className="text-xs text-muted-foreground">{showGuidedNotes ? "Hide" : "Show"}</span>
        </button>

        {showGuidedNotes && (
          <div className="space-y-4">
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
            <Button
              onClick={handleGenerate}
              disabled={generating || uploading || !fields.what.trim()}
              className="w-full"
              variant="outline"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Building draft...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Fill draft with AI
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground block">
          Step 3: Publish
        </Label>
        <Button onClick={handlePublish} disabled={publishing || uploading} className="w-full">
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