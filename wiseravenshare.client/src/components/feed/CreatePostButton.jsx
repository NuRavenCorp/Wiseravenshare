import React, { useState, useEffect } from "react";
import { Feather, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import PostComposer from "@/components/feed/PostComposer";
import { useAuth } from "@/lib/AuthContext";

export default function CreatePostButton() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-5 py-3 shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all hover:scale-105"
        aria-label="Create Post"
      >
        <Feather className="w-5 h-5" />
        <span className="text-sm font-medium hidden sm:inline">Create Post</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Feather className="w-5 h-5 text-primary" />
              Create a Post
            </DialogTitle>
          </DialogHeader>
          <PostComposer onPosted={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}