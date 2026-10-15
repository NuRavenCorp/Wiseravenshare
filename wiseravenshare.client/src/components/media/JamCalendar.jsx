import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import {
  Calendar as CalIcon, ChevronLeft, ChevronRight, Clock,
  Users, Plus, Music, Check, Loader2, X, UserCheck, CalendarPlus
} from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  parseISO, isFuture
} from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import GoogleCalendarConnect from "@/components/media/GoogleCalendarConnect";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function JamCalendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: "20:00",
    bpm: 120,
    description: "",
    max_participants: "",
    inviteEmails: "",
  });
  const [creating, setCreating] = useState(false);

  const fetchSessions = async () => {
    try {
      const res = await apiClient.entities.JamSession.filter(
        { status: { $in: ["scheduled", "active"] } },
        { sort: "started_at", limit: 100 }
      );
      setSessions(res.items || []);
    } catch {
      // not logged in
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const unsub = apiClient.entities.JamSession.subscribe(() => fetchSessions());
    return unsub;
  }, []);

  const sessionsByDate = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const raw = s.scheduled_date || s.started_at;
      if (!raw) continue;
      try {
        const key = format(parseISO(raw), "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(s);
      } catch { /* skip invalid dates */ }
    }
    return map;
  }, [sessions]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const selectedSessions = (sessionsByDate[selectedDateStr] || []).sort((a, b) => {
    const da = a.scheduled_date || a.started_at || "";
    const db = b.scheduled_date || b.started_at || "";
    return da.localeCompare(db);
  });

  const handleSignUp = async (session) => {
    if (!user) return;
    const signups = session.signup_ids || [];
    const isLeaving = signups.includes(user.id);
    await apiClient.entities.JamSession.update(session.id, {
      signup_ids: isLeaving
        ? signups.filter((id) => id !== user.id)
        : [...signups, user.id],
    });
    // Auto-sync the jam to the signer's Google Calendar so they never miss the start
    if (!isLeaving) {
      try {
        const calRes = await apiClient.functions.invoke("AddJamSessionToCalendar", {
          title: session.title,
          scheduled_date: session.scheduled_date || session.started_at,
          description: session.description,
          bpm: session.bpm,
        });
        if (calRes.data?.success) {
          toast({ title: "Added to your Google Calendar", description: session.title });
        }
      } catch {
        /* Google Calendar not connected — session signup still saved */
      }
    }
    fetchSessions();
  };

  const handleAddToCalendar = async (session) => {
    try {
      const calRes = await apiClient.functions.invoke("AddJamSessionToCalendar", {
        title: session.title,
        scheduled_date: session.scheduled_date || session.started_at,
        description: session.description,
        bpm: session.bpm,
      });
      if (calRes.data?.success) {
        toast({ title: "Added to your Google Calendar", description: session.title });
      } else {
        toast({ title: "Connect Google Calendar above first", variant: "destructive" });
      }
    } catch {
      toast({ title: "Connect Google Calendar above first", variant: "destructive" });
    }
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !user) return;
    setCreating(true);
    try {
      const scheduledDate = new Date(`${form.date}T${form.time}`);
      await apiClient.entities.JamSession.create({
        title: form.title.trim(),
        participants: [user.id],
        signup_ids: [user.id],
        status: "scheduled",
        scheduled_date: scheduledDate.toISOString(),
        started_at: scheduledDate.toISOString(),
        bpm: form.bpm,
        description: form.description || undefined,
        max_participants: form.max_participants ? Number(form.max_participants) : undefined,
      });
      // Auto-add to the creator's Google Calendar if connected
      try {
        const attendee_emails = form.inviteEmails
          ? form.inviteEmails.split(",").map((e) => e.trim()).filter(Boolean)
          : [];
        const calRes = await apiClient.functions.invoke("AddJamSessionToCalendar", {
          title: form.title.trim(),
          scheduled_date: scheduledDate.toISOString(),
          description: form.description || undefined,
          bpm: form.bpm,
          attendee_emails,
        });
        if (calRes.data?.success) {
          toast({
            title: "Added to your Google Calendar",
            description: attendee_emails.length > 0
              ? `${attendee_emails.length} participant${attendee_emails.length !== 1 ? "s" : ""} invited`
              : form.title.trim(),
          });
        }
      } catch {
        /* not connected or failed — session still created */
      }
      setForm({
        title: "", date: format(selectedDate, "yyyy-MM-dd"), time: "20:00",
        bpm: 120, description: "", max_participants: "", inviteEmails: "",
      });
      setShowCreate(false);
      fetchSessions();
    } finally {
      setCreating(false);
    }
  };

  const isHost = (session) => session.created_by_id === user?.id;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalIcon className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Jam Session Calendar</span>
        </div>
        <div className="flex items-center gap-2">
          {user && <GoogleCalendarConnect />}
          {user && (
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(!showCreate); setForm({ ...form, date: format(selectedDate, "yyyy-MM-dd") }); }}>
              <Plus className="w-3.5 h-3.5" /> Post Session
            </Button>
          )}
        </div>
      </div>

      {showCreate && user && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-4">
          <Input
            placeholder="Session title (e.g. 'Friday Funk Jam')"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="bg-background"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date</label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Time</label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="bg-background"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tempo (BPM)</label>
              <Input
                type="number"
                min={40}
                max={240}
                value={form.bpm}
                onChange={(e) => setForm({ ...form, bpm: Number(e.target.value) })}
                className="bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Max signups (optional)</label>
              <Input
                type="number"
                min={1}
                placeholder="No limit"
                value={form.max_participants}
                onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
                className="bg-background"
              />
            </div>
          </div>
          <Input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="bg-background"
          />
          <Input
            placeholder="Invite participants by email (comma-separated) — they'll get a calendar invite"
            value={form.inviteEmails}
            onChange={(e) => setForm({ ...form, inviteEmails: e.target.value })}
            className="bg-background"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!form.title.trim() || creating}>
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Schedule Session
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-heading text-foreground">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>
        ))}
        {calendarDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const daySessions = sessionsByDate[key] || [];
          const inMonth = isSameMonth(day, currentMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          return (
            <button
              key={key}
              onClick={() => setSelectedDate(day)}
              className={`relative aspect-square rounded-lg border text-sm transition-colors flex flex-col items-center justify-center ${
                isSelected
                  ? "border-primary bg-primary/10 text-foreground"
                  : inMonth
                    ? "border-border hover:border-primary/40 text-foreground"
                    : "border-transparent text-muted-foreground/40"
              }`}
            >
              <span className={isToday ? "font-bold text-primary" : ""}>{format(day, "d")}</span>
              {daySessions.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {daySessions.slice(0, 3).map((_, i) => (
                    <span key={i} className="w-1 h-1 rounded-full bg-primary" />
                  ))}
                  {daySessions.length > 3 && (
                    <span className="text-[8px] text-primary leading-none">+{daySessions.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Sessions for selected date */}
      <div className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground mb-3">
          {format(selectedDate, "EEEE, MMMM d")}
          {selectedSessions.length > 0 && ` · ${selectedSessions.length} session${selectedSessions.length !== 1 ? "s" : ""}`}
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : selectedSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No sessions scheduled. {user && "Post one to get the jam going."}
          </p>
        ) : (
          <div className="space-y-2">
            {selectedSessions.map((s) => {
              const signups = s.signup_ids || [];
              const signedUp = user ? signups.includes(user.id) : false;
              const isFull = s.max_participants && signups.length >= s.max_participants;
              const raw = s.scheduled_date || s.started_at;
              let timeStr = "";
              try { timeStr = format(parseISO(raw), "h:mm a"); } catch { /* skip */ }

              return (
                <div key={s.id} className="p-3 rounded-lg border border-border bg-secondary/30 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <Music className="w-3.5 h-3.5 text-primary shrink-0" />
                        {s.title}
                      </p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                      )}
                    </div>
                    {isHost(s) && (
                      <span className="text-[10px] text-accent border border-accent/30 rounded-full px-2 py-0.5 shrink-0">Host</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {timeStr && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {timeStr}</span>
                    )}
                    <span className="flex items-center gap-1"><Music className="w-3 h-3" /> {s.bpm || 120} BPM</span>
                    <span className="flex items-center gap-1">
                      <UserCheck className="w-3 h-3" /> {signups.length}
                      {s.max_participants ? `/${s.max_participants}` : ""} signed up
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {s.participants?.length || 0} in session
                    </span>
                  </div>
                  {user && (
                    <div className="flex items-center gap-2 pt-1">
                      {signedUp ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => handleSignUp(s)}>
                            <Check className="w-3.5 h-3.5" /> Signed up · Leave
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAddToCalendar(s)}>
                            <CalendarPlus className="w-3.5 h-3.5" /> Add to Calendar
                          </Button>
                        </>
                      ) : isFull ? (
                        <Button size="sm" variant="outline" disabled>Full</Button>
                      ) : (
                        <Button size="sm" onClick={() => handleSignUp(s)}>
                          {isFuture(parseISO(s.scheduled_date || s.started_at)) ? "Sign Up" : "Request to Join"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}