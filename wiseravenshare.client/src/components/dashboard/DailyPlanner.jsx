import React, { useState, useEffect, useRef, useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { Bell, X, Loader2, Calendar, Clock, Trash2, Save, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";

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

function isValidDateInput(value) {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizeDateTimeLocalValue(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return toLocalInputFormat(parsed);
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
  // Share the same auth session as the rest of the app.
  const { isAuthenticated, checkUserAuth } = useAuth();

  const calendarRef = useRef(null);
  const sessionSaveTimeoutRef = useRef(null);
  const authRetryTimeoutRef = useRef(null);

  const [events, setEvents]           = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const [loadError, setLoadError]     = useState("");
  const [authFailed, setAuthFailed]   = useState(false);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [initialView, setInitialView] = useState("timeGridDay");
  const [initialDate, setInitialDate] = useState(null);
  const [modalOpen, setModalOpen]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [retrying, setRetrying]       = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [formData, setFormData]       = useState(DEFAULT_FORM);
  const [formError, setFormError]     = useState("");

  const isAuthError = useCallback((err) => err?.status === 401 || err?.status === 403, []);
  const authExpiredMessage = "Session expired — please sign in again to use the planner.";

  const clearAuthBanner = useCallback(() => {
    setAuthFailed(false);
    setLoadError((prev) => (prev === authExpiredMessage ? "" : prev));
  }, [authExpiredMessage]);

  const handlePlannerAuthError = useCallback((err) => {
    if (isAuthError(err)) {
      if (isAuthenticated) {
        // AuthContext says user IS logged in. The planner got a 401 likely due to
        // a stale/refreshing token. Attempt one silent token refresh through the
        // shared auth context — this re-validates the session without any visible
        // disruption. The 30-second retry interval will then reload appointments.
        apiClient.auth.tryRefreshToken().then(() => {
          checkUserAuth(false);
        }).catch(() => {});
      }
      setAuthFailed(true);
      setLoadError(authExpiredMessage);
      return true;
    }
    return false;
  }, [isAuthError, authExpiredMessage, isAuthenticated, checkUserAuth]);

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
        clearAuthBanner();
      } catch (err) {
        // Session-state persistence is best-effort; do not surface sticky auth banners for it.
        if (!isAuthError(err)) {
          console.error("Failed to persist planner session state:", err);
        }
      }
    }, 350);
  }, [clearAuthBanner, formData, initialView, isAuthError, modalOpen, sessionHydrated]);

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
              setFormData((prev) => ({
                ...prev,
                ...parsed,
                title: typeof parsed.title === "string" ? parsed.title : prev.title,
                description: typeof parsed.description === "string" ? parsed.description : prev.description,
                start: normalizeDateTimeLocalValue(parsed.start),
                end: normalizeDateTimeLocalValue(parsed.end),
                color: typeof parsed.color === "string" && parsed.color.trim() ? parsed.color : prev.color,
              }));
            }
          } catch {
            // Ignore invalid persisted drafts and continue with defaults.
          }
        }

        if (state.modalOpen === true) {
          setModalOpen(true);
        }
        clearAuthBanner();
      } catch (err) {
        // Hydration should not block planner usage; ignore auth noise from optional state endpoint.
        if (!isAuthError(err)) {
          console.error("Failed to load planner session state:", err);
        }
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
      if (authRetryTimeoutRef.current) {
        clearTimeout(authRetryTimeoutRef.current);
      }
    };
  }, [clearAuthBanner, isAuthError]);

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

  // ── Retry while auth-failed: attempt reload every 30s ─────────────────────
  useEffect(() => {
    if (!authFailed) return;
    const interval = setInterval(() => {
      const api = calendarRef.current?.getApi();
      if (!api) return;
      void (async () => {
        try {
          const data = await apiClient.requestJson(
            `/api/appointments?start=${encodeURIComponent(api.view.activeStart.toISOString())}&end=${encodeURIComponent(api.view.activeEnd.toISOString())}`
          );
          setEvents(Array.isArray(data) ? data : []);
          setLoadError("");
          clearAuthBanner();
        } catch {
          // Still failing — keep interval running.
        }
      })();
    }, 30_000);
    return () => clearInterval(interval);
  }, [authFailed, clearAuthBanner]);

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
      clearAuthBanner();
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
      clearAuthBanner();
      queueSessionSave({
        currentView: dateInfo?.view?.type,
        focusDateUtc: dateInfo?.startStr ?? null,
      });
    } catch (err) {
      if (handlePlannerAuthError(err)) {
        // Schedule one automatic retry after the refresh back-off window clears
        // so the calendar recovers silently if the token refreshes in time.
        if (authRetryTimeoutRef.current) clearTimeout(authRetryTimeoutRef.current);
        authRetryTimeoutRef.current = setTimeout(() => {
          authRetryTimeoutRef.current = null;
          void (async () => {
            try {
              const retryData = await apiClient.requestJson(
                `/api/appointments?start=${encodeURIComponent(dateInfo.startStr)}&end=${encodeURIComponent(dateInfo.endStr)}`
              );
              setEvents(Array.isArray(retryData) ? retryData : []);
              setLoadError("");
              clearAuthBanner();
            } catch {
              // Still failing — the persistent banner will guide the user.
            }
          })();
        }, 20_000);
        return;
      }
      setLoadError(err?.message || "Failed to load appointments.");
      console.error("Failed to load appointments:", err);
    }
  }, [clearAuthBanner, handlePlannerAuthError, queueSessionSave]);

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
      clearAuthBanner();
    } catch (err) {
      handlePlannerAuthError(err);
      changeInfo.revert();
    }
  };

  // ── Date select (drag to create slot) ─────────────────────────────────────
  const handleDateSelect = (selectInfo) => {
    setFormError("");
    setFormData({
      ...DEFAULT_FORM,
      start: toLocalInputFormat(selectInfo.start),
      end:   toLocalInputFormat(selectInfo.end),
    });
    setModalOpen(true);
  };

  // ── Click existing event ──────────────────────────────────────────────────
  const handleEventClick = (clickInfo) => {
    setFormError("");
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
    const title = typeof formData.title === "string" ? formData.title.trim() : "";
    if (!title) {
      setFormError("Title is required.");
      return;
    }
    if (!isValidDateInput(formData.start) || !isValidDateInput(formData.end)) {
      setFormError("Start and end times are required.");
      return;
    }

    const startDate = new Date(formData.start);
    const endDate = new Date(formData.end);
    if (endDate < startDate) {
      setFormError("End time must be after start time.");
      return;
    }

    const payload = {
      title,
      description:           typeof formData.description === "string" ? formData.description : "",
      startUtc:              localInputToUtcIso(formData.start),
      endUtc:                localInputToUtcIso(formData.end),
      reminderMinutesBefore: parseInt(formData.reminderMinutesBefore, 10),
      color:                 formData.color,
    };

    setFormError("");
    setSaving(true);

    const saveAppointment = async () => {
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
    };

    try {
      await saveAppointment();
      clearAuthBanner();
      setModalOpen(false);
      queueSessionSave({ modalOpen: false, draftJson: null });
      refreshCalendar();
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        const refreshed = await apiClient.auth.tryRefreshToken();
        if (refreshed) {
          try {
            await saveAppointment();
            clearAuthBanner();
            setModalOpen(false);
            queueSessionSave({ modalOpen: false, draftJson: null });
            refreshCalendar();
            return;
          } catch (retryErr) {
            if (handlePlannerAuthError(retryErr)) {
              setFormError("Session expired. Please sign in again.");
              return;
            }
            setFormError(retryErr?.message || "Failed to save appointment.");
            return;
          }
        }
      }
      if (handlePlannerAuthError(err)) {
        setFormError("Session expired. Please sign in again.");
        return;
      }
      setFormError(err?.message || "Failed to save appointment.");
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
      clearAuthBanner();
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

  const handleRetry = async () => {
    setRetrying(true);
    try {
      // Re-sync auth through the shared AuthContext first so both the planner
      // and the rest of the app agree on the session state.
      await checkUserAuth(false);
      await apiClient.auth.tryRefreshToken();
    } catch {
      // best-effort — refreshCalendar will expose any remaining error
    }
    clearAuthBanner();
    refreshCalendar();
    setRetrying(false);
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
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-start justify-between gap-3 ${
          authFailed
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-red-500/40 bg-red-500/10 text-red-200"
        }`}>
          <span>
            {authFailed && isAuthenticated
              ? "Reconnecting planner to your session…"
              : loadError}
          </span>
          {authFailed && (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRetry}
                disabled={retrying}
                className="h-7 px-2 py-0 text-xs border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${retrying ? "animate-spin" : ""}`} />
                Retry
              </Button>
              {/* Only show Sign in link if the AuthContext also says we're not authenticated */}
              {!isAuthenticated && (
                <a
                  href="/login"
                  className="underline underline-offset-2 font-medium hover:opacity-80 text-xs"
                >
                  Sign in
                </a>
              )}
            </div>
          )}
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
            noValidate
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

            {formError && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {formError}
              </div>
            )}

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
