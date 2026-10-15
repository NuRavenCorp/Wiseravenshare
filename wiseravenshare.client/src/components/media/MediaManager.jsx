import React, { useState, useRef } from "react";
import { Upload, Trash2, Loader2, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

export default function MediaManager({
  items,
  onUpload,
  onDelete,
  accept,
  label,
  uploading,
  emptyText,
  multiple = true,
}) {
  const [confirmIdx, setConfirmIdx] = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) await onUpload(files);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        {label && <span className="text-sm font-medium text-foreground">{label}</span>}
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload{multiple ? " (multiple)" : ""}
        </Button>
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={handleFile} className="hidden" />
      </div>

      {items.length === 0 && !uploading && (
        <p className="text-sm text-muted-foreground text-center py-4">
          {emptyText || "No media uploaded yet."}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {items.map((item, idx) => (
          <div
            key={idx}
            className="relative group rounded-lg overflow-hidden border border-border aspect-video bg-muted/20"
          >
            {item.type === "video" ? (
              <video src={item.url} className="w-full h-full object-cover" muted />
            ) : item.type === "music" ? (
              <div className="flex flex-col items-center justify-center h-full gap-1 px-2">
                <Music className="w-6 h-6 text-primary" />
                <span className="text-xs text-muted-foreground truncate max-w-full">{item.title || "Track"}</span>
              </div>
            ) : (
              <img src={item.url} alt="" className="w-full h-full object-cover" />
            )}
            <button
              onClick={() => setConfirmIdx(idx)}
              className="absolute top-1 right-1 bg-background/80 rounded-full p-1.5 hover:bg-destructive/80 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <AlertDialog open={confirmIdx !== null} onOpenChange={(o) => !o && setConfirmIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this media?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The file will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(confirmIdx);
                setConfirmIdx(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}