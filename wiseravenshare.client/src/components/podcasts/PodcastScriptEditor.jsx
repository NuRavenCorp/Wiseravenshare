import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, CheckCircle, FileText, Send, Eye } from "lucide-react";
import { apiClient } from "@/api/client";

const STATUS_STYLES = {
  approved: "bg-green-500/15 text-green-500",
  submitted: "bg-accent/15 text-accent",
  draft: "bg-muted text-muted-foreground",
};

export default function PodcastScriptEditor({ podcast, onUpdate, permissions }) {
  const canEdit = permissions?.canEditScript;
  const [script, setScript] = useState(podcast.script || "");
  const [status, setStatus] = useState(podcast.script_status || "draft");
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState(false);

  useEffect(() => {
    setScript(podcast.script || "");
    setStatus(podcast.script_status || "draft");
  }, [podcast.id, podcast.script, podcast.script_status]);

  const saveScript = async (newStatus) => {
    setSaving(true);
    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        script,
        script_status: newStatus || status,
      });
      setStatus(newStatus || status);
      onUpdate();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Script</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              STATUS_STYLES[status] || STATUS_STYLES.draft
            }`}
          >
            {status}
          </span>
        </div>
        {canEdit && (
          <button
            onClick={() => setViewMode(!viewMode)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            {viewMode ? "Edit" : "View"}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Script lines feed the studio teleprompter and cue cards during recording, and can be extended live from the Record tab.
      </p>

      {(viewMode || !canEdit) ? (
        <div className="min-h-[300px] p-4 rounded-lg border border-border bg-card/50 whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
          {script || (
            <span className="text-muted-foreground italic">
              No script written yet.
            </span>
          )}
        </div>
      ) : (
        <Textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Write your podcast script here..."
          className="min-h-[300px] font-mono text-sm leading-relaxed"
        />
      )}

      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => saveScript("draft")}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            Save Draft
          </Button>
          {permissions?.canSubmitScript && (
            <Button
              variant="outline"
              onClick={() => saveScript("submitted")}
              disabled={saving || !script.trim()}
            >
              <Send className="w-4 h-4" />
              Submit for Approval
            </Button>
          )}
          {permissions?.canApproveScript && (
            <Button
              onClick={() => saveScript("approved")}
              disabled={saving || !script.trim()}
            >
              <CheckCircle className="w-4 h-4" />
              Approve Script
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          You have view-only access to this script.
        </p>
      )}
    </div>
  );
}