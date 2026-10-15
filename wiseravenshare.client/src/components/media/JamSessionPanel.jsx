import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import Metronome from "@/components/media/Metronome";
import { Users, Plus, Radio, Music, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function JamSessionPanel() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBpm, setNewBpm] = useState(120);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const bpmTimerRef = useRef(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.entities.JamSession.filter(
        { status: "active" },
        { sort: "-created_date", limit: 50 }
      );
      setSessions(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const unsub = apiClient.entities.JamSession.subscribe(() => fetchSessions());
    return unsub;
  }, []);

  const createSession = async () => {
    if (!newTitle.trim() || !user) return;
    const res = await apiClient.entities.JamSession.create({
      title: newTitle.trim(),
      participants: [user.id],
      bpm: newBpm,
      status: "active",
      started_at: new Date().toISOString(),
    });
    setNewTitle("");
    setNewBpm(120);
    setShowCreate(false);
    setActiveSessionId(res.id);
    fetchSessions();
  };

  const joinSession = async (session) => {
    if (!user) return;
    if (!session.participants.includes(user.id)) {
      await apiClient.entities.JamSession.update(session.id, {
        participants: [...session.participants, user.id],
      });
      fetchSessions();
    }
    setActiveSessionId(session.id);
  };

  const leaveSession = async () => {
    if (!activeSession || !user) return;
    const updated = activeSession.participants.filter((id) => id !== user.id);
    if (updated.length === 0) {
      await apiClient.entities.JamSession.update(activeSession.id, {
        status: "ended",
        ended_at: new Date().toISOString(),
      });
    } else {
      await apiClient.entities.JamSession.update(activeSession.id, {
        participants: updated,
      });
    }
    setActiveSessionId(null);
    fetchSessions();
  };

  const updateSessionBpm = (bpm) => {
    if (!activeSession) return;
    clearTimeout(bpmTimerRef.current);
    bpmTimerRef.current = setTimeout(() => {
      apiClient.entities.JamSession.update(activeSession.id, { bpm });
    }, 500);
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className="rounded-lg border border-primary/40 bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">{activeSession.title}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={leaveSession}>
            <LogOut className="w-3.5 h-3.5" /> Leave
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          {activeSession.participants.length} participant
          {activeSession.participants.length !== 1 ? "s" : ""}
        </div>
        <Metronome
          key={activeSession.id}
          initialBpm={activeSession.bpm || 120}
          onBpmChange={updateSessionBpm}
        />
        {activeSession.track_uris && activeSession.track_uris.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-2">Shared Tracks</p>
            <div className="space-y-1">
              {activeSession.track_uris.map((uri, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                  <Music className="w-3 h-3 text-muted-foreground" />
                  Track {i + 1}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Live Jam Sessions</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreate(!showCreate)}>
          <Plus className="w-3.5 h-3.5" /> New
        </Button>
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
          <Input
            placeholder="Session name"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="bg-background"
          />
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-muted-foreground">Tempo</span>
              <span className="text-xs text-foreground">{newBpm} BPM</span>
            </div>
            <input
              type="range"
              min={40}
              max={240}
              value={newBpm}
              onChange={(e) => setNewBpm(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={createSession} disabled={!newTitle.trim()}>
              Create Session
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No active jam sessions. Start one to collaborate live.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => joinSession(s)}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {s.participants.length}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.bpm || 120} BPM</span>
                </div>
              </div>
              <Radio className="w-4 h-4 text-primary" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}