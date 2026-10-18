import React from "react";
import { Calendar } from "lucide-react";
import PostCard from "./PostCard";

const formatDateGroup = (dateStr) => {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
};

export default function PostTimeline({ posts, currentUser, onAuthRequired, onHashtagClick, onBlocked, blockedIds }) {
  if (!posts || posts.length === 0) return null;

  const groups = {};
  posts.forEach((post) => {
    const day = new Date(post.created_date).toDateString();
    if (!groups[day]) groups[day] = [];
    groups[day].push(post);
  });

  const sortedDays = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  return (
    <div className="relative">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />
      <div className="space-y-8">
        {sortedDays.map((day) => (
          <div key={day} className="relative">
            <div className="flex items-center gap-3 mb-4 sticky top-0 z-10 py-2 bg-background/80 backdrop-blur-sm">
              <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0 relative z-10">
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <span className="font-heading text-sm text-foreground tracking-wide">{formatDateGroup(day)}</span>
              <span className="text-xs text-muted-foreground">· {groups[day].length} {groups[day].length === 1 ? "post" : "posts"}</span>
            </div>
            <div className="space-y-5 pl-12">
              {groups[day].map((post) => (
                <div key={post.id} className="relative">
                  <div className="absolute -left-[2.25rem] top-6 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background shadow-[0_0_8px_hsl(265_70%_60%/0.4)]" />
                  <PostCard post={post} currentUser={currentUser} blockedIds={blockedIds} onHashtagClick={onHashtagClick} onBlocked={onBlocked} onAuthRequired={onAuthRequired} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
