import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Loader2, GripVertical, Clock, CheckCircle, AlertCircle, Headphones } from "lucide-react";

const STAGES = [
  { id: "backlog", label: "Backlog", color: "border-slate-500/40 bg-slate-500/5", dot: "bg-slate-400" },
  { id: "recording", label: "Recording", color: "border-red-500/40 bg-red-500/5", dot: "bg-red-400" },
  { id: "editing", label: "Editing", color: "border-amber-500/40 bg-amber-500/5", dot: "bg-amber-400" },
  { id: "review", label: "Review", color: "border-blue-500/40 bg-blue-500/5", dot: "bg-blue-400" },
  { id: "published", label: "Published", color: "border-emerald-500/40 bg-emerald-500/5", dot: "bg-emerald-400" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.id, s]));

export default function KanbanBoard() {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState(null);

  const load = useCallback(async () => {
    try {
      const page = await apiClient.entities.Podcast.filter({}, { sort: "-episode_number", limit: 100 });
      setPodcasts(page.items || []);
    } catch (e) {
      console.error("Kanban load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = STAGES.reduce((acc, s) => {
    acc[s.id] = podcasts.filter((p) => (p.board_stage || "backlog") === s.id);
    return acc;
  }, {});

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const podcast = podcasts.find((p) => p.id === draggableId);
    if (!podcast) return;

    const newStage = destination.droppableId;

    // Optimistic update
    setPodcasts((prev) =>
      prev.map((p) => (p.id === draggableId ? { ...p, board_stage: newStage } : p))
    );
    setMoving(draggableId);

    try {
      await apiClient.entities.Podcast.update(draggableId, { board_stage: newStage });
      // If moved to published, also update status
      if (newStage === "published" && podcast.status !== "published") {
        await apiClient.entities.Podcast.update(draggableId, { status: "published" });
      }
    } catch (e) {
      console.error("Kanban move error:", e);
      // Revert on failure
      setPodcasts((prev) =>
        prev.map((p) => (p.id === draggableId ? { ...p, board_stage: source.droppableId } : p))
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
          Drag episodes across stages to track production progress.
        </p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 min-h-[60vh]">
          {STAGES.map((stage) => (
            <div key={stage.id} className="flex flex-col min-w-[240px] w-[240px]">
              {/* Column header */}
              <div className={`rounded-t-lg border-b-2 ${stage.color} px-3 py-2.5 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
                  <span className="text-sm font-medium text-foreground">{stage.label}</span>
                </div>
                <span className="text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
                  {grouped[stage.id].length}
                </span>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={stage.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 rounded-b-lg border border-t-0 border-border/60 p-2 space-y-2 transition-colors ${
                      snapshot.isDraggingOver ? "bg-primary/5" : "bg-background/40"
                    }`}
                  >
                    {grouped[stage.id].length === 0 && !provided.placeholder && (
                      <p className="text-xs text-muted-foreground/50 text-center py-6">Drop here</p>
                    )}
                    {grouped[stage.id].map((pod, idx) => (
                      <Draggable key={pod.id} draggableId={pod.id} index={idx}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`rounded-lg border border-border bg-card p-3 cursor-grab active:cursor-grabbing transition-shadow ${
                              snap.isDragging ? "shadow-lg border-primary/40" : "hover:border-primary/20"
                            } ${moving === pod.id ? "opacity-50" : ""}`}
                          >
                            <div className="flex items-start gap-2">
                              <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-foreground leading-snug truncate">
                                  {pod.title}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {pod.subject_matter}
                                </p>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-[10px] text-muted-foreground bg-secondary/60 px-1.5 py-0.5 rounded">
                                    Ep {pod.episode_number}
                                  </span>
                                  {pod.is_premium && (
                                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                      <AlertCircle className="w-2.5 h-2.5" /> Premium
                                    </span>
                                  )}
                                  {pod.episode_media_uri && (
                                    <Headphones className="w-3 h-3 text-emerald-400" />
                                  )}
                                </div>
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
          ))}
        </div>
      </DragDropContext>

      {podcasts.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">
            No podcast episodes yet. Launch an episode from the Podcasts tab to populate the board.
          </p>
        </div>
      )}
    </div>
  );
}