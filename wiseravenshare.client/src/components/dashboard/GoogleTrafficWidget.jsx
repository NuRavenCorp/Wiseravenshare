import React, { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Eye, Users, BarChart3, Clock, TrendingUp, Loader2 } from "lucide-react";

const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtDur = (s) => {
  const sec = Math.round(Number(s || 0));
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
};

export default function GoogleTrafficWidget() {
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingProps, setLoadingProps] = useState(true);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);

  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    setError(null);
    try {
      const res = await apiClient.functions.invoke("GetAnalyticsData", { mode: "listProperties" });
      const props = res.data.properties || [];
      setProperties(props);
      if (props.length === 1) {
        setSelected(props[0].id);
      } else if (props.length > 1) {
        const wrs = props.find((p) => p.displayName?.toLowerCase().includes("wiseraven"));
        if (wrs) setSelected(wrs.id);
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || "";
      if (e?.response?.status === 403 || msg.includes("Forbidden")) {
        setForbidden(true);
      } else {
        setError(msg || "Failed to load properties");
      }
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
      setError(e?.response?.data?.error || e?.message || "Failed to load report");
    } finally {
      setLoadingReport(false);
    }
  }, [selected, days]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { if (selected) loadReport(); }, [loadReport]);

  if (forbidden) return null;

  const summary = report?.summary || {};
  const topPages = report?.topPages || [];

  return (
    <div className="p-5 rounded-xl border border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h3 className="font-heading text-lg text-foreground">Visitor Traffic</h3>
        <span className="text-xs text-muted-foreground ml-auto">via Google Analytics</span>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex-1 min-w-[180px]">
          {loadingProps ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading properties…
            </div>
          ) : (
            <select
              value={selected || ""}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Select property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.displayName}</option>
              ))}
            </select>
          )}
        </div>
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

      {error && <p className="text-sm text-destructive mb-3">{error}</p>}

      {loadingReport && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Fetching traffic data…
        </div>
      )}

      {!loadingReport && report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { icon: Eye, label: "Page Views", value: fmtNum(summary.pageViews) },
              { icon: BarChart3, label: "Sessions", value: fmtNum(summary.sessions) },
              { icon: Users, label: "Users", value: fmtNum(summary.users) },
              { icon: Clock, label: "Avg Session", value: fmtDur(summary.avgSessionDuration) },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="p-3 rounded-lg border border-border bg-card">
                  <Icon className="w-4 h-4 text-muted-foreground mb-1.5" />
                  <p className="text-xl font-heading text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              );
            })}
          </div>

          {topPages.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-card">
              <h4 className="text-sm font-medium text-foreground mb-3">Most Popular Pages</h4>
              <div className="space-y-2">
                {topPages.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate">{p.title || p.path}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.path}</p>
                    </div>
                    <span className="text-muted-foreground ml-3 tabular-nums shrink-0">{fmtNum(p.pageViews)} views</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}