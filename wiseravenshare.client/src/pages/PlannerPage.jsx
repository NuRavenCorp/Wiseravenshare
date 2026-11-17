import React from "react";
import Navbar from "@/components/landing/Navbar";
import DailyPlanner from "@/components/dashboard/DailyPlanner";
import { Calendar } from "lucide-react";

export default function PlannerPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-3xl text-foreground text-glow">Daily Planner</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Schedule sessions, streams, deadlines, and personal events. Drag to move, drag the edge to resize.
            </p>
          </div>
        </div>
        <DailyPlanner />
      </div>
    </div>
  );
}
