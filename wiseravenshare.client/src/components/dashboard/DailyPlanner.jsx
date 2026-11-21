import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  Bell,
  X,
  Loader2,
  Calendar,
  Clock,
  Trash2,
  Save,
  RefreshCw,
  Plus,
  Search,
  CalendarDays,
  Edit3,
  ListFilter
} from "lucide-react";
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
  if (!value || typeof value !== "string" || !value.trim()) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  return toLocalInputFormat(parsed);
}

function formatAppointmentTime(startStr, endStr) {
  if (!startStr) return "";
  const start = new Date(startStr);
  const end = endStr ? new Date(endStr) : null;
  const now = new Date();

  const isToday =
    start.getDate() === now.getDate() &&
    start.getMonth() === now.getMonth() &&
    start.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    start.getDate() === tomorrow.getDate() &&
    start.getMonth() === tomorrow.getMonth() &&
    start.getFullYear() === tomorrow.getFullYear();

  const timeFormatter = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
  const timeRange = end
    ? `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`
    : timeFormatter.format(start);

  if (isToday) {
    return `Today • ${timeRange}`;
  }
  if (isTomorrow) {
    return `Tomorrow • ${timeRange}`;
  }

  const dateFormatter = new Intl.DateTimeFormat([], { weekday: "short", month: "short", day: "numeric" });
  return `${dateFormatter.format(start)} • ${timeRange}`;
}

const COLOR_PRESETS = [
  "#3788d8", // Blue (default)
  "#10b981", // Emerald
  "#8b5cf6", // Violet
  "#f59e0b", // Amber
  "#ef4444", // Rose/Red
  "#06b6d4", // Cyan
  "#ec4899", // Pink
];

const REMINDER_OPTIONS = [
  { value: 0,   label: "At time of event" },
  { value: 5,   label: "5 minutes before" },
  { value: 15,  label: "15 minutes before (default)" },
  { value: 30,  label: "30 minutes before" },
  { value: 60,  label: "1 hour before" },
  { value: 120, label: "2 hours before" },
  { value: 1440, label: "1 day before" },
];

const DEFAULT_FORM = {
  id:                    null,
  title:                 "",
  description:           "",
  start:                 "",
  end:                   "",
  reminderMinutesBefore: 15,
  color:                 "#3788d8",
};

// ─── DailyPlanner ─────────────────────────────────────────────────────────────

export default function DailyPlanner() {
  const { isAuthenticated, isLoadingAuth, checkUserAuth, user } = useAuth();

  const calendarRef = useRef(null);
  const sessionSaveTimeoutRef = useRef(null);

  const storageKey = `wiseravenshare_appointments_${user?.email || user?.id || "default"}`;

  const [events, setEvents]                   = useState([]);
  const [activeAlert, setActiveAlert]         = useState(null);
  const [loadError, setLoadError]             = useState("");
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [initialView, setInitialView]         = useState("timeGridDay");
  const [initialDate, setInitialDate]         = useState(null);
  const [modalOpen, setModalOpen]             = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [formData, setFormData]               = useState(DEFAULT_FORM);
  const [formError, setFormError]             = useState("");

  // Running list filter and search state
  const [listFilter, setListFilter]           = useState("upcoming"); // "upcoming" | "today" | "all"
  const [listSearch, setListSearch]           = useState("");

  // ── Sync to local cache so appointments survive offline / page navigation ─
  const syncLocalAppointments = useCallback((items) => {
    if (typeof window === "undefined" || !Array.isArray(items)) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (err) {
      console.warn("Failed to cache planner appointments locally:", err);
    }
  }, [storageKey]);

  // ── Immediate local hydration on mount or user change ────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEvents(parsed);
        }
      }
    } catch {
      // Ignore cache parse errors
    }
  }, [storageKey]);

  const queueSessionSave = useCallback((overrides = {}) => {
    if (!sessionHydrated || !isAuthenticated) return;

    const api = calendarRef.current?.getApi();
    const currentView = overrides.currentView ?? api?.view?.type ?? initialView;
    const focusDateUtc = overrides.focusDateUtc ?? api?.view?.activeStart?.toISOString() ?? null;
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
      : hasDraft
        ? JSON.stringify(formData)
        : null;

    if (sessionSaveTimeoutRef.current) {
      clearTimeout(sessionSaveTimeoutRef.current);
    }

    sessionSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await apiClient.requestJson("/api/planner/session-state", {
          method: "PUT",
          body: JSON.stringify({
            currentView,
            focusDateUtc,
            draftJson,
            modalOpen: modalIsOpen,
          }),
        });
      } catch (err) {
        console.warn("Failed to persist planner session state:", err?.message);
      }
    }, 350);
  }, [formData, initialView, isAuthenticated, modalOpen, sessionHydrated]);

  // ── Hydrate session state once authenticated ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      setSessionHydrated(false);
      return;
    }

    let mounted = true;
    const loadSessionState = async () => {
      try {
        const state = await apiClient.requestJson("/api/planner/session-state");
        if (!mounted || !state) return;

        const nextView = typeof state.currentView === "string" && state.currentView.trim()
          ? state.currentView.trim()
          : "timeGridDay";
        setInitialView(nextView);

        if (state.focusDateUtc) {
          const parsedFocusDate = new Date(state.focusDateUtc);
          if (!Number.isNaN(parsedFocusDate.getTime())) {
            setInitialDate(parsedFocusDate);
          }
        }

        if (state.draftJson && typeof state.draftJson === "string") {
          try {
            const parsedDraft = JSON.parse(state.draftJson);
            if (parsedDraft && typeof parsedDraft === "object") {
              setFormData({
                id: parsedDraft.id || null,
                title: parsedDraft.title || "",
                description: parsedDraft.description || "",
                start: normalizeDateTimeLocalValue(parsedDraft.start),
                end: normalizeDateTimeLocalValue(parsedDraft.end),
                reminderMinutesBefore: Number(parsedDraft.reminderMinutesBefore) || 15,
                color: parsedDraft.color || "#3788d8",
              });
            }
          } catch {
            // Ignore corrupted draft
          }
        }

        if (state.modalOpen === true) {
          setModalOpen(true);
        }
      } catch (err) {
        console.warn("Planner session hydration notice:", err?.message);
      } finally {
        if (mounted) setSessionHydrated(true);
      }
    };

    loadSessionState();
    return () => { mounted = false; };
  }, [isAuthenticated]);

  // ── Fetch all appointments so running list & calendar are always complete ─
  const loadAppointments = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await apiClient.requestJson("/api/planner?all=true");
      if (Array.isArray(data)) {
        setEvents(data);
        syncLocalAppointments(data);
      }
      setLoadError("");
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
        return;
      }
      setLoadError(err?.message || "Failed to load appointments.");
    }
  }, [checkUserAuth, isAuthenticated, syncLocalAppointments]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAppointments();
    }
  }, [isAuthenticated, loadAppointments]);

  // Request browser notification permission once mounted
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Reminder alert polling (every 30 seconds) ──────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkReminders = () => {
      const now = Date.now();
      for (const ev of events) {
        if (ev.extendedProps?.alertDismissed) continue;
        const startMs = new Date(ev.start).getTime();
        const reminderMinutes = ev.extendedProps?.reminderMinutesBefore ?? 15;
        const alertMs = startMs - reminderMinutes * 60 * 1000;

        if (now >= alertMs && now < startMs) {
          setActiveAlert(ev);
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(`Upcoming: ${ev.title}`, {
                body: `Starts in ${reminderMinutes} minute${reminderMinutes === 1 ? "" : "s"} at ${new Date(ev.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
                icon: "/favicon.ico",
              });
            } catch {
              // Notification errors silently handled
            }
          }
          break;
        }
      }
    };

    checkReminders();
    const timer = setInterval(checkReminders, 30_000);
    return () => clearInterval(timer);
  }, [events, isAuthenticated]);

  const dismissAlert = async (id) => {
    setActiveAlert(null);
    try {
      await apiClient.requestJson(`/api/planner/${id}/dismiss-alert`, { method: "PATCH" });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
      }
    }
  };

  // ── Record view state when calendar dates change ────────────────────────
  const handleDatesSet = useCallback((dateInfo) => {
    if (!isAuthenticated) return;
    queueSessionSave({
      currentView: dateInfo?.view?.type,
      focusDateUtc: dateInfo?.startStr ?? null,
    });
  }, [isAuthenticated, queueSessionSave]);

  // ── Jump calendar view to a specific event's date ─────────────────────────
  const handleJumpToEvent = useCallback((item) => {
    if (!item?.start) return;
    const api = calendarRef.current?.getApi();
    if (api) {
      api.gotoDate(new Date(item.start));
    }
  }, []);

  // ── Drag-drop / resize ────────────────────────────────────────────────────
  const handleEventChange = async (changeInfo) => {
    const ev = changeInfo.event;
    const payload = {
      title:                 ev.title,
      description:           ev.extendedProps?.description ?? "",
      startUtc:              ev.start.toISOString(),
      endUtc:                (ev.end ?? ev.start).toISOString(),
      reminderMinutesBefore: ev.extendedProps?.reminderMinutesBefore ?? 15,
      color:                 ev.backgroundColor ?? "#3788d8",
    };
    try {
      await apiClient.requestJson(`/api/planner/${ev.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setEvents((prev) => {
        const next = prev.map((item) =>
          item.id === ev.id
            ? {
                ...item,
                title: payload.title,
                start: payload.startUtc,
                end: payload.endUtc,
                backgroundColor: payload.color,
                borderColor: payload.color,
                extendedProps: {
                  ...item.extendedProps,
                  description: payload.description,
                  reminderMinutesBefore: payload.reminderMinutesBefore,
                },
              }
            : item
        );
        syncLocalAppointments(next);
        return next;
      });
      setLoadError("");
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
      } else {
        setLoadError(err?.message || "Failed to update appointment.");
      }
      changeInfo.revert();
    }
  };

  // ── Date select (drag to create slot on calendar) ──────────────────────────
  const handleDateSelect = (selectInfo) => {
    setFormError("");
    setFormData({
      ...DEFAULT_FORM,
      start: toLocalInputFormat(selectInfo.start),
      end:   toLocalInputFormat(selectInfo.end),
    });
    setModalOpen(true);
  };

  // ── Click existing event on calendar ──────────────────────────────────────
  const handleEventClick = (clickInfo) => {
    setFormError("");
    const ev = clickInfo.event;
    setFormData({
      id:                    ev.id,
      title:                 ev.title,
      description:           ev.extendedProps?.description ?? "",
      start:                 toLocalInputFormat(ev.start),
      end:                   toLocalInputFormat(ev.end ?? ev.start),
      reminderMinutesBefore: ev.extendedProps?.reminderMinutesBefore ?? 15,
      color:                 ev.backgroundColor ?? "#3788d8",
    });
    setModalOpen(true);
  };

  // ── Open Create Modal with default round times ─────────────────────────────
  const handleOpenCreateModal = (presetDate = null) => {
    setFormError("");
    const base = presetDate ? new Date(presetDate) : new Date();
    const start = new Date(base);
    start.setMinutes(start.getMinutes() >= 30 ? 60 : 30, 0, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    setFormData({
      ...DEFAULT_FORM,
      start: toLocalInputFormat(start),
      end:   toLocalInputFormat(end),
    });
    setModalOpen(true);
  };

  // ── Open Edit from Sidebar List ───────────────────────────────────────────
  const handleOpenEditFromList = (item) => {
    setFormError("");
    setFormData({
      id:                    item.id,
      title:                 item.title,
      description:           item.extendedProps?.description ?? "",
      start:                 toLocalInputFormat(item.start),
      end:                   toLocalInputFormat(item.end ?? item.start),
      reminderMinutesBefore: item.extendedProps?.reminderMinutesBefore ?? 15,
      color:                 item.backgroundColor ?? item.borderColor ?? "#3788d8",
    });
    setModalOpen(true);
  };

  // ── Delete from Sidebar List ──────────────────────────────────────────────
  const handleDeleteFromList = async (e, evId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this appointment?")) return;
    try {
      await apiClient.requestJson(`/api/planner/${evId}`, { method: "DELETE" });
      setEvents((prev) => {
        const next = prev.filter((ev) => ev.id !== evId);
        syncLocalAppointments(next);
        return next;
      });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
      } else {
        alert(err?.message || "Failed to delete appointment.");
      }
    }
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

    try {
      if (formData.id) {
        await apiClient.requestJson(`/api/planner/${formData.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setEvents((prev) => {
          const next = prev.map((ev) =>
            ev.id === formData.id
              ? {
                  ...ev,
                  title: payload.title,
                  start: payload.startUtc,
                  end: payload.endUtc,
                  backgroundColor: payload.color,
                  borderColor: payload.color,
                  extendedProps: {
                    ...ev.extendedProps,
                    description: payload.description,
                    reminderMinutesBefore: payload.reminderMinutesBefore,
                  },
                }
              : ev
          );
          syncLocalAppointments(next);
          return next;
        });
      } else {
        const created = await apiClient.requestJson("/api/planner", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (created?.id) {
          setEvents((prev) => {
            const next = [...prev.filter((ev) => ev.id !== created.id), created];
            syncLocalAppointments(next);
            return next;
          });
        } else {
          // If response format was alternative, re-fetch
          loadAppointments();
        }
      }
      setModalOpen(false);
      queueSessionSave({ modalOpen: false, draftJson: null });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
        setFormError("Session expired. Please sign in again.");
      } else {
        setFormError(err?.message || "Failed to save appointment.");
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Delete from Modal ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!formData.id || !window.confirm("Delete this appointment?")) return;
    setDeleting(true);
    try {
      await apiClient.requestJson(`/api/planner/${formData.id}`, { method: "DELETE" });
      setModalOpen(false);
      queueSessionSave({ modalOpen: false, draftJson: null });
      setEvents((prev) => {
        const next = prev.filter((ev) => ev.id !== formData.id);
        syncLocalAppointments(next);
        return next;
      });
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) {
        checkUserAuth(false);
      } else {
        alert(err?.message || "Failed to delete appointment.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const refreshCalendar = () => {
    loadAppointments();
  };

  // ── Filtered running list memo ────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return events
      .filter((ev) => {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end ?? ev.start);

        // Filter by tab
        if (listFilter === "upcoming" && evEnd < now) {
          return false;
        }
        if (listFilter === "today" && (evEnd < startOfToday || evStart > endOfToday)) {
          return false;
        }

        // Filter by search keyword
        if (listSearch.trim()) {
          const q = listSearch.toLowerCase();
          const matchTitle = (ev.title ?? "").toLowerCase().includes(q);
          const matchDesc = (ev.extendedProps?.description ?? "").toLowerCase().includes(q);
          if (!matchTitle && !matchDesc) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }, [events, listFilter, listSearch]);

  // ── Auth Loading State ────────────────────────────────────────────────────
  if (isLoadingAuth) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Connecting to your WiseRavenShare session…</span>
      </div>
    );
  }

  // ── Unauthenticated State (Unified Prompt) ────────────────────────────────
  if (!isAuthenticated) {
    const returnPath = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/planner";
    return (
      <div className="rounded-xl border border-border bg-card p-8 flex flex-col items-center justify-center gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Calendar className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground text-base">Sign In Required</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Sign in to WiseRavenShare to view, schedule, and sync your planner sessions.
          </p>
        </div>
        <Button asChild size="sm">
          <a href={`/login?returnTo=${encodeURIComponent(returnPath)}`}>
            Sign In to WiseRavenShare
          </a>
        </Button>
      </div>
    );
  }

  // ── Session Hydration State ───────────────────────────────────────────────
  if (!sessionHydrated) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
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

      {/* Operational error banner */}
      {loadError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center justify-between gap-3">
          <span>{loadError}</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={refreshCalendar}
              className="h-7 px-2.5 py-0 text-xs border-red-500/50 text-red-200 hover:bg-red-500/20"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Reload
            </Button>
            <button
              type="button"
              onClick={() => setLoadError("")}
              className="text-red-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Grid: Calendar (left/center) + Running List (sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* ── Left / Center Column: Calendar ────────────────────────────── */}
        <div className="lg:col-span-3 min-w-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Calendar Planner</h2>
            </div>
            <Button
              size="sm"
              onClick={() => handleOpenCreateModal()}
              className="gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>New Appointment</span>
            </Button>
          </div>

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
              height="78vh"
              eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
            />
          </div>
        </div>

        {/* ── Right Column: Running Appointments List ──────────────────── */}
        <div className="lg:col-span-1 rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <ListFilter className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Appointments</h3>
              <span className="px-2 py-0.5 text-[11px] rounded-full bg-primary/10 text-primary font-medium">
                {events.length}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenCreateModal()}
              className="h-7 px-2.5 text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </Button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setListFilter("upcoming")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                listFilter === "upcoming"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              Upcoming
            </button>
            <button
              type="button"
              onClick={() => setListFilter("today")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                listFilter === "today"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setListFilter("all")}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                listFilter === "all"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Filter by title…"
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Scrollable list */}
          <div className="space-y-2 overflow-y-auto max-h-[62vh] pr-1">
            {filteredEvents.length === 0 ? (
              <div className="py-8 px-4 text-center space-y-2 rounded-lg border border-dashed border-border/70">
                <Calendar className="w-8 h-8 text-muted-foreground/60 mx-auto" />
                <p className="text-xs text-muted-foreground font-medium">No appointments found</p>
                <p className="text-[11px] text-muted-foreground/80">
                  {listFilter === "upcoming"
                    ? "You have no upcoming sessions."
                    : listFilter === "today"
                      ? "Nothing scheduled for today."
                      : "No scheduled sessions."}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleOpenCreateModal()}
                  className="mt-2 text-xs h-7"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Schedule One
                </Button>
              </div>
            ) : (
              filteredEvents.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    handleJumpToEvent(item);
                    handleOpenEditFromList(item);
                  }}
                  className="group relative rounded-lg border border-border/80 bg-background/60 p-3 hover:bg-muted/50 hover:border-primary/50 transition-all cursor-pointer space-y-1.5 shadow-sm"
                  style={{
                    borderLeftWidth: "4px",
                    borderLeftColor: item.backgroundColor || "#3788d8",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-xs text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {item.title}
                    </span>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleJumpToEvent(item);
                        }}
                        className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-muted"
                        title="Focus on calendar"
                      >
                        <Calendar className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditFromList(item);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted"
                        title="Edit appointment"
                      >
                        <Edit3 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteFromList(e, item.id)}
                        className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10"
                        title="Delete appointment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                    <span>{formatAppointmentTime(item.start, item.end)}</span>
                  </div>

                  {item.extendedProps?.description && (
                    <p className="text-[11px] text-muted-foreground/80 line-clamp-2 italic">
                      {item.extendedProps.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
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
