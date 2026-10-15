import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Loader2, X, Lightbulb } from "lucide-react";

const colorClasses = {
  amethyst: "border-primary/40 bg-primary/5",
  gold: "border-accent/40 bg-accent/5",
  violet: "border-chart-2/40 bg-chart-2/5",
  blue: "border-chart-4/40 bg-chart-4/5",
  rose: "border-chart-5/40 bg-chart-5/5",
};

const colorDot = {
  amethyst: "bg-primary",
  gold: "bg-accent",
  violet: "bg-chart-2",
  blue: "bg-chart-4",
  rose: "bg-chart-5",
};

export default function ScratchboardSection() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", tags: "", color: "amethyst" });

  const fetchNotes = async () => {
    try {
      const res = await apiClient.entities.Scratchboard.filter({}, { sort: "-created_date", limit: 50 });
      setNotes(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchNotes();
  }, [user]);

  const handleCreate = async () => {
    if (!form.title) return;
    const tags = form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
    await apiClient.entities.Scratchboard.create({ title: form.title, content: form.content, tags, color: form.color });
    setForm({ title: "", content: "", tags: "", color: "amethyst" });
    setShowForm(false);
    fetchNotes();
  };

  const handleDelete = async (id) => {
    await apiClient.entities.Scratchboard.delete(id);
    setNotes(notes.filter((n) => n.id !== id));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)} variant="outline">
        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? "Cancel" : "New Idea"}
      </Button>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Spark of an idea..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content">Notes</Label>
            <Textarea id="content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} placeholder="Flesh it out..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input id="tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="music, lyrics, demo" />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2 pt-2">
                {Object.keys(colorDot).map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-6 h-6 rounded-full ${colorDot[c]} ${form.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`} />
                ))}
              </div>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={!form.title}>Save Idea</Button>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Lightbulb className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No ideas yet. Start scratching!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {notes.map((n) => (
            <div key={n.id} className={`rounded-lg border p-4 ${colorClasses[n.color] || colorClasses.amethyst}`}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium text-foreground">{n.title}</h3>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => handleDelete(n.id)}>
                  <Trash2 className="w-3 h-3 text-destructive" />
                </Button>
              </div>
              {n.content && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{n.content}</p>}
              {n.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {n.tags.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}