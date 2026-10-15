import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Loader2, Folder, File as FileIcon, ChevronLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const PROVIDER_NAME = { googledrive: "Google Drive", dropbox: "Dropbox" };

export default function CloudBrowser({ provider, onClose, onImported }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState(null);
  const [history, setHistory] = useState([]);
  const { toast } = useToast();

  const load = async (id) => {
    setLoading(true);
    try {
      const res = await apiClient.functions.invoke("CloudMediaTransfer", {
        action: "list",
        provider,
        folderId: id,
      });
      setFiles(res.data.files || []);
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