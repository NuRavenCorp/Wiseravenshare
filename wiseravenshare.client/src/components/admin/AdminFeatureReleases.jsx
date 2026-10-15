import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Rocket, Plus, Loader2, Pencil, Trash2, X, Tag, Calendar,
  Users, Percent, Eye, EyeOff, CheckCircle2, AlertCircle
} from "lucide-react";

const CATEGORIES = ["feature", "improvement", "bugfix", "security", "infrastructure"];
const STATUSES = ["planned", "in_development", "testing", "released", "rolled_back"];
const AUDIENCES = ["all", "creators", "admins", "beta"];

const statusStyles = {
  planned: "border-muted-foreground/40 text-muted-foreground bg-muted/30",
  in_development: "border-blue-400/40 text-blue-300 bg-blue-500/10",
  testing: "border-amber-400/40 text-amber-300 bg-amber-500/10",
  released: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10",
  rolled_back: "border-destructive/40 text-destructive bg-destructive/10",
};

const categoryStyles = {
  feature: "text-primary",
  improvement: "text-blue-300",
  bugfix: "text-amber-300",
  security: "text-destructive",
  infrastructure: "text-muted-foreground",
};

const emptyForm = {
  title: "", version: "", description: "", changelog: "",
  category: "feature", status: "planned", target_audience: "all",
  release_date: "", rollout_percentage: 100, is_public: false, tags: "",
};

export default function AdminFeatureReleases() {
  const { toast } = useToast();
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchReleases = async () => {
    try {
      const res = await apiClient.entities.FeatureRelease.filter(
        filterStatus === "all" ? {} : { status: filterStatus },
        { sort: "-created_date", limit: 100 }
      );
      setReleases(res.items || []);
    } catch (e) {
      toast({ title: "Failed to load releases", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReleases(); }, [filterStatus]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (r) => {
    setForm({
      title: r.title || "",
      version: r.version || "",
      description: r.description || "",
      changelog: r.changelog || "",
      category: r.category || "feature",
      status: r.status || "planned",
      target_audience: r.target_audience || "all",
      release_date: r.release_date || "",
      rollout_percentage: r.rollout_percentage ?? 100,
      is_public: r.is_public ?? false,
      tags: (r.tags || []).join(", "),
    });
    setEditingId(r.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        version: form.version.trim() || undefined,
        description: form.description.trim() || undefined,
        changelog: form.changelog.trim() || undefined,
        category: form.category,
        status: form.status,
        target_audience: form.target_audience,
        release_date: form.release_date || undefined,
        rollout_percentage: Number(form.rollout_percentage) || 0,
        is_public: form.is_public,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      };
      if (editingId) {
        await apiClient.entities.FeatureRelease.update(editingId, payload);
        toast({ title: "Release updated" });
      } else {
        await apiClient.entities.FeatureRelease.create(payload);
        toast({ title: "Release created" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchReleases();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this feature release?")) return;
    try {
      await apiClient.entities.FeatureRelease.delete(id);
      toast({ title: "Release deleted" });
      fetchReleases();
    } catch (e) {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  };

  const advanceStatus = async (r) => {
    const idx = STATUSES.indexOf(r.status);
    if (idx >= STATUSES.length - 1) return;
    const next = STATUSES[idx + 1];
    try {
      await apiClient.entities.FeatureRelease.update(r.id, {
        status: next,
        release_date: next === "released" && !r.release_date
          ? new Date().toISOString().split("T")[0]
          : r.release_date,
      });
      toast({ title: `Moved to ${next.replace("_", " ")}` });
      fetchReleases();
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const togglePublic = async (r) => {
    try {
      await apiClient.entities.FeatureRelease.update(r.id, { is_public: !r.is_public });
      fetchReleases();
    } catch (e) {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border ${
                filterStatus === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="w-4 h-4" /> New Release
        </Button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="p-5 rounded-2xl border border-primary/30 bg-card/60 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading text-lg text-foreground flex items-center gap-2">
              <Rocket className="w-4 h-4 text-primary" />
              {editingId ? "Edit Release" : "New Feature Release"}
            </h3>
            <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Multi-camera podcasting" className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label>Version</Label>
              <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="e.g. v2.4.0" className="bg-background" />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Audience</Label>
              <select
                value={form.target_audience}
                onChange={(e) => setForm({ ...form, target_audience: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {AUDIENCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Release Date</Label>
              <Input type="date" value={form.release_date} onChange={(e) => setForm({ ...form, release_date: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label>Rollout %</Label>
              <Input type="number" min={0} max={100} value={form.rollout_percentage} onChange={(e) => setForm({ ...form, rollout_percentage: e.target.value })} className="bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="podcast, media" className="bg-background" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short summary of the feature" className="bg-background" rows={2} />
          </div>

          <div className="space-y-1.5">
            <Label>Changelog / Notes</Label>
            <Textarea value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} placeholder="Detailed changelog entries, bullet points, migration notes…" className="bg-background" rows={4} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              {form.is_public ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              Visible in public changelog
            </span>
          </label>

          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editingId ? "Save Changes" : "Create Release"}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Release list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : releases.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Rocket className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No feature releases yet. Create one to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map((r) => (
            <div key={r.id} className="p-5 rounded-2xl border border-border bg-card/50 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-heading text-lg text-foreground">{r.title}</h3>
                    {r.version && (
                      <span className="font-mono text-xs text-accent border border-accent/30 rounded-full px-2 py-0.5">{r.version}</span>
                    )}
                    <span className={`text-xs font-medium capitalize rounded-full px-2.5 py-0.5 border ${statusStyles[r.status] || ""}`}>
                      {r.status?.replace("_", " ")}
                    </span>
                    <span className={`text-xs capitalize ${categoryStyles[r.category] || ""}`}>{r.category}</span>
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-1.5">{r.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => togglePublic(r)} title={r.is_public ? "Public" : "Private"}>
                    {r.is_public ? <Eye className="w-4 h-4 text-primary" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                {r.release_date && (
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {r.release_date}</span>
                )}
                <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {r.target_audience}</span>
                <span className="flex items-center gap-1"><Percent className="w-3 h-3" /> {r.rollout_percentage ?? 0}% rollout</span>
                {r.tags?.length > 0 && (
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" /> {r.tags.join(", ")}</span>
                )}
              </div>

              {/* Changelog preview */}
              {r.changelog && (
                <div className="pt-2 border-t border-border">
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-4">{r.changelog}</p>
                </div>
              )}

              {/* Advance status */}
              {r.status !== "released" && r.status !== "rolled_back" && (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => advanceStatus(r)}>
                    {r.status === "testing" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    Advance to {STATUSES[STATUSES.indexOf(r.status) + 1]?.replace("_", " ")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}