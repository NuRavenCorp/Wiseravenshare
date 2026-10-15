import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Users, Clock, BarChart3, Loader2, RefreshCw, TrendingUp } from "lucide-react";

const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtDur = (s) => {
  const sec = Math.round(Number(s || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export default function AdminGoogleAnalytics() {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingProps, setLoadingProps] = useState(true);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GetAnalyticsData", { mode: "listProperties" });
      setProperties(res.data.properties || []);
      if ((res.data.properties || []).length === 1) setSelected(res.data.properties[0].id);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load properties");
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!selected) return;
    setLoadingReport(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GetAnalyticsData", {
        mode: "runReport",
        propertyId: selected,
        days,
      });
      setReport(res.data);
    } catch (e) {
      setError(e.response?.data?.error || e.message || "Failed to load report");
    } finally {
      setLoadingReport(false);
    }
  }, [selected, days]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { if (selected) loadReport(); }, [loadReport]);

  const summary = report?.summary || {};
  const topPages = report?.topPages || [];

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Property + date range selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">GA4 Property</label>
          {loadingProps ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading properties…</div>
          ) : (
            <select
              value={selected || ""}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName} ({p.propertyId})</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 block">Date Range</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={loadReport} disabled={!selected || loadingReport}>
          <RefreshCw className={`w-4 h-4 ${loadingReport ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loadingReport && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Fetching traffic data…
        </div>
      )}

      {!loadingReport && report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 bg-card/50 border-border">
              <div className="flex items-center gap-2 text-muted-foreground mb-2"><Eye className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Page Views</span></div>
              <p className="font-heading text-2xl text-foreground">{fmtNum(summary.pageViews)}</p>
            </Card>
            <Card className="p-5 bg-card/50 border-border">
              <div className="flex items-center gap-2 text-muted-foreground mb-2"><BarChart3 className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Sessions</span></div>
              <p className="font-heading text-2xl text-foreground">{fmtNum(summary.sessions)}</p>
            </Card>
            <Card className="p-5 bg-card/50 border-border">
              <div className="flex items-center gap-2 text-muted-foreground mb-2"><Users className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Users</span></div>
              <p className="font-heading text-2xl text-foreground">{fmtNum(summary.users)}</p>
            </Card>
            <Card className="p-5 bg-card/50 border-border">
              <div className="flex items-center gap-2 text-muted-foreground mb-2"><Clock className="w-4 h-4" /><span className="text-xs uppercase tracking-wide">Avg Session</span></div>
              <p className="font-heading text-2xl text-foreground">{fmtDur(summary.avgSessionDuration)}</p>
            </Card>
          </div>

          {/* Top pages */}
          <Card className="p-6 bg-card/50 border-border">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h3 className="font-heading text-lg text-foreground">Most Popular Pages</h3>
              <span className="text-xs text-muted-foreground ml-auto">{report.range.start} → {report.range.end}</span>
            </div>
            {topPages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No page data for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="pb-2 pr-4 font-medium">Page</th>
                      <th className="pb-2 px-4 font-medium text-right">Views</th>
                      <th className="pb-2 px-4 font-medium text-right">Sessions</th>
                      <th className="pb-2 pl-4 font-medium text-right">Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topPages.map((p, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-secondary/30">
                        <td className="py-2.5 pr-4">
                          <p className="text-foreground truncate max-w-[280px]">{p.title || p.path}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[280px]">{p.path}</p>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-foreground">{fmtNum(p.pageViews)}</td>
                        <td className="py-2.5 px-4 text-right tabular-nums text-muted-foreground">{fmtNum(p.sessions)}</td>
                        <td className="py-2.5 pl-4 text-right tabular-nums text-muted-foreground">{fmtNum(p.users)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}