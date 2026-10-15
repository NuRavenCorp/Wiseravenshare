import React, { useState, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, Loader2, Check, RefreshCw } from "lucide-react";

export default function ImportPanel() {
  const [items, setItems] = useState({ facebook: [], instagram: [] });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(null);

  const fetchContent = useCallback(async () => {
    setLoading(true);
    setImported(null);
    try {
      const res = await apiClient.functions.invoke("SocialImport", { action: "fetch" });
      setItems(res.data);
      setSelected(new Set());
    } catch {
      setItems({ facebook: [], instagram: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const handleImport = async () => {
    const all = [...items.facebook, ...items.instagram];
    const chosen = all.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setImporting(true);
    try {
      const res = await apiClient.functions.invoke("SocialImport", { action: "import", items: chosen });
      setImported(res.data?.imported || 0);
      setSelected(new Set());
    } finally {
      setImporting(false);
    }
  };

  const allItems = [...items.facebook, ...items.instagram];

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-heading text-lg flex items-center gap-2">
            <Download className="w-5 h-5 text-primary" /> Import from Platforms
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchContent} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Fetch
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {allItems.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Click Fetch to pull recent posts from your connected platforms.
          </p>
        )}
        {allItems.map((item, idx) => (
          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/30">
            <Checkbox checked={selected.has(idx)} onCheckedChange={() => toggle(idx)} className="mt-1" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-accent uppercase">{item.platform}</span>
                {item.page_name && <span className="text-xs text-muted-foreground">· {item.page_name}</span>}
              </div>
              <p className="text-sm text-foreground line-clamp-2">{item.content}</p>
            </div>
          </div>
        ))}
        {allItems.length > 0 && (
          <Button onClick={handleImport} disabled={importing || selected.size === 0} className="w-full">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Import {selected.size > 0 ? selected.size : ""} to WiseRavenShare
          </Button>
        )}
        {imported !== null && (
          <p className="text-sm text-accent flex items-center gap-1"><Check className="w-4 h-4" /> Imported {imported} post(s)!</p>
        )}
      </CardContent>
    </Card>
  );
}