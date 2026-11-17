import React from "react";
import { Link } from "react-router-dom";
import { Calendar, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Lightweight dashboard card that links to the full /planner page. */
export default function PlannerSection() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-4 text-center">
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
        <Calendar className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">Daily Planner</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">
          Schedule sessions, streams, and deadlines. Drag, drop, and resize events.
          Browser alerts remind you before each appointment.
        </p>
      </div>
      <Button asChild size="sm" className="gap-1.5">
        <Link to="/planner">
          Open Planner <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </Button>
    </div>
  );
}
