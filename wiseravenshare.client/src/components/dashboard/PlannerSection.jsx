import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, Loader2, Clock, X, Calendar } from "lucide-react";

const typeColors = {
  session: "text-primary",
  meeting: "text-chart-4",
  deadline: "text-destructive",
  personal: "text-accent",
  stream: "text-chart-5",
};

export default function PlannerSection() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", event_date: "", event_time: "", event_type: "session", location: "" });

  const fetchEvents = async () => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const res = await apiClient.entities.PlannerEvent.filter(
        { event_date: { $gte: today } },
        { sort: "event_date", limit: 50 }
      );
      setEvents(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchEvents();
  }, [user]);

  const handleCreate = async () => {
    if (!form.title || !form.event_date) return;
    await apiClient.entities.PlannerEvent.create(form);
    setForm({ title: "", description: "", event_date: "", event_time: "", event_type: "session", location: "" });
    setShowForm(false);
    fetchEvents();
  };

  const handleStatus = async (id, status) => {
    await apiClient.entities.PlannerEvent.update(id, { status });
    fetchEvents();
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)} variant="outline">
        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? "Cancel" : "New Event"}
      </Button>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Jam session, stream, deadline..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select id="type" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm">
                <option value="session">Session</option>
                <option value="meeting">Meeting</option>
                <option value="deadline">Deadline</option>
                <option value="personal">Personal</option>
                <option value="stream">Stream</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc">Location</Label>
              <Input id="loc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Studio, online..." />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <Button onClick={handleCreate} disabled={!form.title || !form.event_date}>Add to Planner</Button>
        </div>
      )}
      {events.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No upcoming events. Plan your next session!</p>
        </div>
      ) : (
        events.map((ev) => (
          <div key={ev.id} className={`rounded-lg border border-border bg-card p-4 ${ev.status === "completed" ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${typeColors[ev.event_type] || "text-primary"}`}>{ev.event_type}</span>
                  {ev.event_time && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{ev.event_time}</span>}
                </div>
                <p className="text-sm font-medium text-foreground">{ev.title}</p>
                {ev.description && <p className="text-xs text-muted-foreground mt-1">{ev.description}</p>}
                <p className="text-xs text-muted-foreground mt-1">{new Date(ev.event_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{ev.location ? ` · ${ev.location}` : ""}</p>
              </div>
              {ev.status === "scheduled" && (
                <Button variant="ghost" size="sm" onClick={() => handleStatus(ev.id, "completed")}>
                  <Check className="w-4 h-4" /> Done
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}