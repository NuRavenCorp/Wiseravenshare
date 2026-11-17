import React, { useState, useEffect, useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Bell, X, Loader2, Calendar, Clock, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/api/client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a JS Date → "YYYY-MM-DDTHH:mm" for datetime-local inputs (local tz). */
function toLocalInputFormat(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** "2026-11-17T10:30" → ISO UTC string ready for the server. */
function localInputToUtcIso(localStr) {
  return new Date(localStr).toISOString();
}

const REMINDER_OPTIONS = [
  { value: 0,  label: "At time of event" },
  { value: 5,  label: "5 minutes before" },
  { value: 15, label: "15 minutes before" },
  { value: 30, label: "30 minutes before" },
  { value: 60, label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

const COLOR_PRESETS = [
  "#3788d8", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

const DEFAULT_FORM = {
  id: null,
  title: "",
  description: "",
  start: "",
  end: "",
  reminderMinutesBefore: 15,
  color: "#3788d8",
};

// ─── DailyPlanner ─────────────────────────────────────────────────────────────

export default function DailyPlanner() {
  const calendarRef = useRef(null);
  const sessionSaveTimeoutRef = useRef(null);

  const [events, setEvents]           = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [loadError, setLoadError]     = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [initialView, setInitialView] = useState("timeGridDay");
  const [initialDate, setInitialDate] = useState(null);
  const [modalOpen, setModalOpen]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [formData, setFormData]       = useState(DEFAULT_FORM);

  const handlePlannerAuthError = useCallback((err) => {
    if (err?.status === 401 || err?.status === 403) {
      apiClient.auth.clearToken();
      setLoadError("Your planner session expired. Redirecting to sign in.");
      apiClient.auth.redirectToLogin("/planner");
      return true;
    }
    return false;
  }, []);

  const queueSessionSave = useCallback((overrides = {}) => {
    if (!sessionHydrated) return;

    const api = calendarRef.current?.getApi();
    const currentView = overrides.currentView ?? api?.view?.type ?? initialView;
    const focusDateUtc = overrides.focusDateUtc ?? (api?.getDate ? api.getDate().toISOString() : null);
    const modalIsOpen = overrides.modalOpen ?? modalOpen;

    const hasDraft =
      modalIsOpen && (
      formData.id ||
      formData.title.trim().length > 0 ||
      formData.description.trim().length > 0 ||
      formData.start ||
      formData.end
      );

    const draftJson = Object.prototype.hasOwnProperty.call(overrides, "draftJson")
      ? overrides.draftJson
      : (hasDraft ? JSON.stringify(formData) : null);

    if (sessionSaveTimeoutRef.current) {
      clearTimeout(sessionSaveTimeoutRef.current);
    }

    sessionSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await apiClient.requestJson("/api/appointments/session-state", {
          method: "PUT",
          body: JSON.stringify({
            currentView,
            focusDateUtc,
            draftJson,
            modalOpen: modalIsOpen,
          }),
        });
      } catch (err) {
        handlePlannerAuthError(err);
      }
    }, 350);
  }, [formData, handlePlannerAuthError, initialView, modalOpen, sessionHydrated]);

  useEffect(() => {
    let mounted = true;
    const loadSessionState = async () => {
      try {
        const state = await apiClient.requestJson("/api/appointments/session-state");
        if (!mounted || !state) return;

        const nextView = typeof state.currentView === "string" && state.currentView.trim()
          ? state.currentView.trim()
          : "timeGridDay";
        setInitialView(nextView);
        setInitialDate(typeof state.focusDateUtc === "string" ? state.focusDateUtc : null);

        if (state.draftJson) {
          try {
            const parsed = JSON.parse(state.draftJson);
            if (parsed && typeof parsed === "object") {
              setFormData((prev) => ({ ...prev, ...parsed }));
            }
          } catch {
            // Ignore invalid persisted drafts and continue with defaults.
          }
        }

        if (state.modalOpen === true) {
          setModalOpen(true);
        }
      } catch (err) {
        handlePlannerAuthError(err);
      } finally {
        if (mounted) {
          setSessionHydrated(true);
        }
      }
    };

    loadSessionState();
    return () => {
      mounted = false;
      if (sessionSaveTimeoutRef.current) {
        clearTimeout(sessionSaveTimeoutRef.current);
      }
    };
  }, [handlePlannerAuthError]);

  useEffect(() => {
    if (!sessionHydrated) return;
    queueSessionSave();
  }, [sessionHydrated, modalOpen, formData, queueSessionSave]);

  // ── Browser notification permission ───────────────────────────────────────
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Alert engine: check every 30 s ────────────────────────────────────────
  useEffect(() => {
    const checkAlerts = () => {
      const now = Date.now();
      for (const ev of events) {
        if (ev.extendedProps?.alertDismissed) continue;
        const startMs   = new Date(ev.start).getTime();
        const endMs     = new Date(ev.end ?? ev.start).getTime();
        const triggerMs = startMs - (ev.extendedProps?.reminderMinutesBefore ?? 0) * 60_000;
        if (now >= triggerMs && now <= endMs) {
          triggerAlert(ev);
          break;
        }
      }
    };
    const interval = setInterval(checkAlerts, 30_000);
    checkAlerts();
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const triggerAlert = (ev) => {
    setActiveAlert(ev);
    new Audio("/alert-chime.mp3").play().catch(() => {});
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`⏰ Upcoming: ${ev.title}`, {
        body: `Starts at ${new Date(ev.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        icon: "/favicon.ico",
      });
    }
  };

  const dismissAlert = async (id) => {
    setActiveAlert(null);
    setEvents((prev) =>
      prev.map((ev) =>
        ev.id === id
          ? { ...ev, extendedProps: { ...ev.extendedProps, alertDismissed: true } }
          : ev
      )
    );
    try {
      await apiClient.requestJson(`/api/appointments/${id}/dismiss-alert`, { method: "PATCH" });
    } catch (err) {
      handlePlannerAuthError(err);
    }
  };

  // ── Fetch when calendar view changes ──────────────────────────────────────
  const handleDatesSet = useCallback(async (dateInfo) => {
    try {
      const data = await apiClient.requestJson(
        `/api/appointments?start=${encodeURIComponent(dateInfo.startStr)}&end=${encodeURIComponent(dateInfo.endStr)}`
      );
      setEvents(Array.isArray(data) ? data : []);
      setLoadError("");
      queueSessionSave({
        currentView: dateInfo?.view?.type,
        focusDateUtc: dateInfo?.startStr ?? null,
      });
    } catch (err) {
      if (handlePlannerAuthError(err)) {
        return;
      }
      setLoadError("Failed to load appointments.");
      console.error("Failed to load appointments:", err);
    }
  }, [handlePlannerAuthError, queueSessionSave]);

  // ── Drag-drop / resize ────────────────────────────────────────────────────
  const handleEventChange = async (changeInfo) => {
    const ev = changeInfo.event;
    const payload = {
      title:                 ev.title,
      description:           ev.extendedProps.description ?? "",
      startUtc:              ev.start.toISOString(),
      endUtc:                (ev.end ?? ev.start).toISOString(),
      reminderMinutesBefore: ev.extendedProps.reminderMinutesBefore ?? 15,
      color:                 ev.backgroundColor ?? "#3788d8",
    };
    try {
      await apiClient.requestJson(`/api/appointments/${ev.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      handlePlannerAuthError(err);
      changeInfo.revert();
    }
  };

  // ── Date select (drag to create slot) ─────────────────────────────────────
  const handleDateSelect = (selectInfo) => {
    setFormData({
      ...DEFAULT_FORM,
      start: toLocalInputFormat(selectInfo.start),
      end:   toLocalInputFormat(selectInfo.end),
    });
    setModalOpen(true);
  };

  // ── Click existing event ──────────────────────────────────────────────────
  const handleEventClick = (clickInfo) => {
    const ev = clickInfo.event;
    setFormData({
      id:                    ev.id,
      title:                 ev.title,
      description:           ev.extendedProps.description ?? "",
      start:                 toLocalInputFormat(ev.start),
      end:                   toLocalInputFormat(ev.end ?? ev.start),
      reminderMinutesBefore: ev.extendedProps.reminderMinutesBefore ?? 15,
      color:                 ev.backgroundColor ?? "#3788d8",
    });
    setModalOpen(true);
  };

  // ── Save (create or update) ───────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      title:                 formData.title.trim(),
      description:           formData.description,
      startUtc:              localInputToUtcIso(formData.start),
      endUtc:                localInputToUtcIso(formData.end),
      reminderMinutesBefore: parseInt(formData.reminderMinutesBefore, 10),
      color:                 formData.color,
    };
    try {
      if (formData.id) {
        await apiClient.requestJson(`/api/appointments/${formData.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient.requestJson("/api/appointments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      queueSessionSave({ modalOpen: false, draftJson: null });
      refreshCalendar();
    } catch (err) {
      if (handlePlannerAuthError(err)) {
        return;
      }
      alert(err?.message || "Failed to save appointment.");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!formData.id || !window.confirm("Delete this appointment?")) return;
    setDeleting(true);
    try {
      await apiClient.requestJson(`/api/appointments/${formData.id}`, { method: "DELETE" });
      setModalOpen(false);
      queueSessionSave({ modalOpen: false, draftJson: null });
      setEvents((prev) => prev.filter((ev) => ev.id !== formData.id));
    } catch (err) {
      if (handlePlannerAuthError(err)) {
        return;
      }
      alert(err?.message || "Failed to delete appointment.");
    } finally {
      setDeleting(false);
    }
  };

  const refreshCalendar = () => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    handleDatesSet({
      startStr: api.view.activeStart.toISOString(),
      endStr:   api.view.activeEnd.toISOString(),
    });
  };

  if (!sessionHydrated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {activeAlert && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>⏰ {activeAlert.title}</strong>
              {" — "}Starts at{" "}
              {new Date(activeAlert.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => dismissAlert(activeAlert.id)}
            className="bg-amber-500 hover:bg-amber-400 text-black rounded-full px-4"
          >
            Dismiss
          </Button>
        </div>
      )}
      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {/* FullCalendar */}
      <div className="fc-dark rounded-xl overflow-hidden border border-border bg-card shadow-sm">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate || undefined}
          headerToolbar={{
            left:   "prev,next today",
            center: "title",
            right:  "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          editable
          selectable
          selectMirror
          dayMaxEvents
          nowIndicator
          slotDuration="00:30:00"
          events={events}
          datesSet={handleDatesSet}
          select={handleDateSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventChange}
          eventResize={handleEventChange}
          height="80vh"
          eventTimeFormat={{ hour: "2-digit", minute: "2-digit", meridiem: "short" }}
        />
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <form
            onSubmit={handleSave}
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4"
          >
            {/* Modal header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-foreground text-base">
                  {formData.id ? "Edit Appointment" : "New Appointment"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <Input
                required
                placeholder="e.g. Studio session, Go-live stream…"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            {/* Start / End */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Start
                </label>
                <Input
                  required
                  type="datetime-local"
                  value={formData.start}
                  onChange={(e) => setFormData({ ...formData, start: e.target.value })}
                  className="text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> End
                </label>
                <Input
                  required
                  type="datetime-local"
                  value={formData.end}
                  min={formData.start}
                  onChange={(e) => setFormData({ ...formData, end: e.target.value })}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Bell className="w-3 h-3" /> Alert Reminder
              </label>
              <select
                value={formData.reminderMinutesBefore}
                onChange={(e) => setFormData({ ...formData, reminderMinutesBefore: parseInt(e.target.value, 10) })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Color Tag</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFormData({ ...formData, color: c })}
                    className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c,
                      borderColor: formData.color === c ? "white" : "transparent",
                    }}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-6 h-6 rounded-full cursor-pointer border border-border p-0 bg-transparent"
                  title="Custom colour"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Notes</label>
              <textarea
                rows={3}
                placeholder="Optional details, links, reminders…"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              {formData.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="gap-1.5"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {formData.id ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
