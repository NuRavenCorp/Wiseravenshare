import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Folder, File as FileIcon, ChevronLeft, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const PROVIDER_NAME = { googledrive: "Google Drive", dropbox: "Dropbox" };

export default function CloudBrowser({ provider, onClose, onImported }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState(null);
  const [history, setHistory] = useState([]);
  const [inclusionMethods, setInclusionMethods] = useState([]);
  const [sharedUrl, setSharedUrl] = useState("");
  const [importMode, setImportMode] = useState("auto");
  const [importingLink, setImportingLink] = useState(false);
  const { toast } = useToast();

  const load = async (id) => {
    setLoading(true);
    try {
      const res = await apiClient.functions.invoke("CloudMediaTransfer", {
        action: "list",
        provider,
        folderId: id,
      });
      setFiles(res.data?.files || []);
      setInclusionMethods(
        Array.isArray(res.data?.inclusionMethods)
          ? res.data.inclusionMethods
          : Array.isArray(res.data?.methods)
            ? res.data.methods.map((method, index) =>
                typeof method === "string" ? { id: `method-${index}`, label: method } : method)
            : []
      );
    } catch (e) {
      toast({ title: "Could not browse files", description: e?.message, variant: "destructive" });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(null);
  }, []);

  const openFolder = (f) => {
    setHistory((h) => [...h, f.id]);
    load(f.id);
  };
  const goBack = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    load(prev || null);
  };

  const handleImport = async (f) => {
    setImportingId(f.id);
    try {
      await apiClient.functions.invoke("CloudMediaTransfer", {
        action: "import",
        provider,
        fileId: f.id,
        fileName: f.name,
      });
      toast({ title: "Imported to library", description: f.name });
      onImported?.();
    } catch (e) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    } finally {
      setImportingId(null);
    }
  };

  const handleImportSharedLink = async () => {
    const url = sharedUrl.trim();
    if (!url) {
      toast({ title: "Dropbox link required", description: "Paste a Dropbox or direct media link first.", variant: "destructive" });
      return;
    }

    setImportingLink(true);
    try {
      const res = await apiClient.functions.invoke("CloudMediaTransfer", {
        action: "include",
        provider,
        sharedUrl: url,
        mediaType: importMode,
      });
      const title = res?.data?.title || "Imported to library";
      const description = res?.data?.message || "The media file is now available in your WiseRavenShare library.";
      toast({ title, description });
      setSharedUrl("");
      await onImported?.();
      await load(null);
    } catch (e) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    } finally {
      setImportingLink(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <Button variant="ghost" size="icon" onClick={goBack}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <h3 className="font-heading text-lg text-foreground">{PROVIDER_NAME[provider]}</h3>
          </div>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close ✕
          </button>
        </div>
        <div className="border-b border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Add Dropbox media by link and choose how to include it in WiseRavenShare.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={sharedUrl}
              onChange={(e) => setSharedUrl(e.target.value)}
              placeholder="Paste Dropbox shared link or direct media URL"
              className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            />
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
              aria-label="Media type"
            >
              <option value="auto">Auto detect</option>
              <option value="music">Music</option>
              <option value="video">Video</option>
              <option value="photo">Photo</option>
            </select>
            <Button size="sm" onClick={handleImportSharedLink} disabled={importingLink}>
              {importingLink ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              Include
            </Button>
          </div>
          {inclusionMethods.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {inclusionMethods.map((method) => method.label || method.id).join(" • ")}
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No files here.</p>
          ) : (
            <div className="space-y-1">
              {files.map((f) => (
                <div key={f.id} className="flex items-center gap-3 p-2 rounded hover:bg-secondary/50">
                  {f.isFolder ? (
                    <Folder className="w-4 h-4 text-primary" />
                  ) : (
                    <FileIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                  {f.isFolder ? (
                    <button onClick={() => openFolder(f)} className="flex-1 text-left text-sm text-foreground truncate">
                      {f.name}
                    </button>
                  ) : (
                    <span className="flex-1 text-sm text-foreground truncate">{f.name}</span>
                  )}
                  {!f.isFolder && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={importingId === f.id}
                      onClick={() => handleImport(f)}
                    >
                      {importingId === f.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Import
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}