import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import {
  Loader2, GripVertical, Eye, ShieldCheck, XCircle, MapPin,
  ExternalLink, Newspaper,
} from "lucide-react";

const COLUMNS = [
  {
    id: "under_review",
    label: "Under Review",
    color: "border-amber-500/40 bg-amber-500/5",
    dot: "bg-amber-400",
    icon: Eye,
    iconColor: "text-amber-300",
  },
  {
    id: "verified",
    label: "Verified",
    color: "border-emerald-500/40 bg-emerald-500/5",
    dot: "bg-emerald-400",
    icon: ShieldCheck,
    iconColor: "text-emerald-300",
  },
  {
    id: "rejected",
    label: "Rejected",
    color: "border-red-500/40 bg-red-500/5",
    dot: "bg-red-400",
    icon: XCircle,
    iconColor: "text-red-300",
  },
];

const COLUMN_MAP = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));

function scoreColor(score) {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-accent";
  if (score >= 25) return "text-amber-400";
  return "text-red-400";
}

export default function JournalismBoard() {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const load = useCallback(async () => {
    try {
      const page = await apiClient.entities.JournalismReport.filter(
        { verification_status: { $in: ["under_review", "verified", "rejected"] } },
        { sort: "-created_date", limit: 100 }
      );
      setReports(page.items || []);
    } catch (e) {
      toast({ title: "Failed to load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
    apiClient.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        try { setCurrentUser(await apiClient.auth.me()); } catch { /* skip */ }
      }
    });
  }, [load]);

  const grouped = COLUMNS.reduce((acc, c) => {
    acc[c.id] = reports.filter((r) => (r.verification_status || "under_review") === c.id);
    return acc;
  }, {});

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const report = reports.find((r) => r.id === draggableId);
    if (!report) return;
    const newStatus = destination.droppableId;

    // Optimistic update
    setReports((prev) =>
      prev.map((r) => (r.id === draggableId ? { ...r, verification_status: newStatus } : r))
    );
    setMoving(draggableId);

    try {
      await apiClient.entities.JournalismReport.update(draggableId, {
        verification_status: newStatus,
        reviewer_id: currentUser?.id,
        reviewer_name: currentUser?.full_name || currentUser?.email,
        reviewed_at: new Date().toISOString(),
      });
      toast({ title: `Moved to ${COLUMN_MAP[newStatus].label}` });
    } catch (e) {
      toast({ title: "Move failed", description: e.message, variant: "destructive" });
      // Revert
      setReports((prev) =>
        prev.map((r) => (r.id === draggableId ? { ...r, verification_status: source.droppableId } : r))
      );
    } finally {
      setMoving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Drag reports between columns to update verification status.
        </p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[50vh]">
          {COLUMNS.map((col) => {
            const ColIcon = col.icon;
            return (
              <div key={col.id} className="flex flex-col min-w-[260px] w-[260px]">
                {/* Column header */}
                <div className={`rounded-t-lg border-b-2 ${col.color} px-3 py-2.5 flex items-center justify-between`}>
                  <div className="flex items-center gap-2">
                    <ColIcon className={`w-4 h-4 ${col.iconColor}`} />
                    <span className="text-sm font-medium text-foreground">{col.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                    {grouped[col.id].length}
                  </span>
                </div>

                {/* Droppable area */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 rounded-b-lg border border-t-0 border-border/60 p-2 space-y-2 transition-colors ${
                        snapshot.isDraggingOver ? "bg-primary/5" : "bg-background/40"
                      }`}
                    >
                      {grouped[col.id].length === 0 && !provided.placeholder && (
                        <p className="text-xs text-muted-foreground/50 text-center py-6">Drop here</p>
                      )}
                      {grouped[col.id].map((r, idx) => (
                        <Draggable key={r.id} draggableId={r.id} index={idx}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing transition-shadow ${
                                snap.isDragging ? "shadow-lg border-primary/40" : "hover:border-primary/20"
                              } ${moving === r.id ? "opacity-50" : ""}`}
                            >
                              <div className="flex items-start gap-2">
                                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                                    {r.headline || r.description?.slice(0, 80) || "Untitled report"}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {r.region && (
                                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                        <MapPin className="w-2.5 h-2.5" /> {r.region}
                                      </span>
                                    )}
                                    {typeof r.truth_score === "number" && (
                                      <span className={`text-[10px] font-medium ${scoreColor(r.truth_score)}`}>
                                        Truth {r.truth_score}
                                      </span>
                                    )}
                                    {r.post_id && (
                                      <a
                                        href={`/?post=${r.post_id}`}
                                        target="_blank"
                                        rel="noopener"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-muted-foreground hover:text-primary transition-colors"
                                        title="View original post"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                  {r.reviewer_name && (
                                    <p className="text-[10px] text-muted-foreground/70 mt-1.5 truncate">
                                      by {r.reviewer_name}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {reports.length === 0 && (
        <div className="text-center py-16">
          <Newspaper className="w-8 h-8 mx-auto mb-3 opacity-40 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No journalism reports yet. Submit a report from the Journalism page to populate the board.
          </p>
        </div>
      )}
    </div>
  );
}