import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, DollarSign, Save, CheckCircle } from "lucide-react";

export default function AdminPaywalls() {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const [saved, setSaved] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const page = await apiClient.entities.Podcast.filter(
        { is_premium: true },
        { sort: "-episode_number", limit: 50 }
      );
      setPodcasts(page.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (podcastId) => {
    const edit = edits[podcastId];
    if (!edit) return;
    setSaving(podcastId);
    try {
      await apiClient.entities.Podcast.update(podcastId, {
        price_monthly: edit.monthly !== "" ? Math.round(parseFloat(edit.monthly) * 100) : null,
        price_one_time: edit.oneTime !== "" ? Math.round(parseFloat(edit.oneTime) * 100) : null,
      });
      setSaved(podcastId);
      setTimeout(() => setSaved(null), 2000);
      load();
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (podcasts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No premium podcasts with paywalls.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Adjust paywall pricing for any premium episode. Lower prices to
        increase accessibility.
      </p>
      {podcasts.map((p) => {
        const edit = edits[p.id];
        const monthly = edit ? edit.monthly : p.price_monthly ? (p.price_monthly / 100).toString() : "";
        const oneTime = edit ? edit.oneTime : p.price_one_time ? (p.price_one_time / 100).toString() : "";
        return (
          <div
            key={p.id}
            className="p-4 rounded-xl border border-border bg-card/50 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  EP {p.episode_number}: {p.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.view_count || 0} views
                </p>
              </div>
              {saved === p.id && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> Monthly ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monthly}
                  onChange={(e) =>
                    setEdits({
                      ...edits,
                      [p.id]: { ...edit, monthly: e.target.value },
                    })
                  }
                  placeholder="9.99"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> One-Time ($)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={oneTime}
                  onChange={(e) =>
                    setEdits({
                      ...edits,
                      [p.id]: { ...edit, oneTime: e.target.value },
                    })
                  }
                  placeholder="4.99"
                />
              </div>
            </div>
            <Button
              onClick={() => handleSave(p.id)}
              disabled={saving === p.id || !edits[p.id]}
              size="sm"
              className="w-full"
            >
              {saving === p.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Prices
            </Button>
          </div>
        );
      })}
    </div>
  );
}