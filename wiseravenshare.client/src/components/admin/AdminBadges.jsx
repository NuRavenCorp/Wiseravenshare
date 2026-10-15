import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/client";
import { Award, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const categories = ["participation", "productivity", "promotion", "value", "truth", "creator"];

export default function AdminBadges() {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", description: "", category: "participation", threshold: 0 });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiClient.entities.Badge
      .filter({}, { sort: "-created_date", limit: 50 })
      .then((page) => setBadges(page.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await apiClient.entities.Badge.create({
        name: form.name,
        description: form.description,
        category: form.category,
        threshold: Number(form.threshold) || 0,
      });
      setForm({ name: "", description: "", category: "participation", threshold: 0 });
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="p-6 rounded-2xl border border-border bg-card/50">
        <h3 className="font-heading text-xl text-foreground mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-accent" /> Create Badge
        </h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 bg-background/60" />
          </div>
          <div>
            <Label className="text-muted-foreground">Category</Label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="mt-1 w-full h-10 rounded-md border border-border bg-background/60 px-3 text-sm text-foreground"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-muted-foreground">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 bg-background/60" />
          </div>
          <div>
            <Label className="text-muted-foreground">Threshold</Label>
            <Input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="mt-1 bg-background/60" />
          </div>
        </div>
        <Button onClick={create} disabled={saving} className="mt-4 bg-primary text-primary-foreground">
          {saving ? "Creating…" : "Create Badge"}
        </Button>
      </div>

      <div>
        <h3 className="font-heading text-xl text-foreground mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-primary" /> Issued Badges
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : badges.length === 0 ? (
          <p className="text-sm text-muted-foreground">No badges created yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {badges.map((b) => (
              <div key={b.id} className="p-4 rounded-xl border border-border bg-card/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-heading text-lg text-foreground">{b.name}</span>
                  <span className="text-[10px] tracking-wider uppercase text-accent">{b.category}</span>
                </div>
                <p className="text-sm text-muted-foreground">{b.description || "—"}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}