import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Shield, FileWarning, Plus, X, Scale, Gavel, CheckCircle2, AlertTriangle, Award } from "lucide-react";
import CertificateModal from "@/components/media/CertificateModal";

const RIGHTS_TYPES = ["original_work", "licensed", "assignment", "public_domain", "fair_use"];
const LICENSE_TYPES = ["exclusive", "non_exclusive", "creative_commons", "royalty_free", "custom"];
const REPORT_TYPES = ["infringement", "dmca_takedown", "dispute", "counter_notice"];
const USAGE_OPTIONS = ["streaming", "download", "broadcast", "sync_licensing", "derivative_works", "distribution"];

function statusColor(status) {
  const map = {
    active: "text-green-400",
    expired: "text-yellow-400",
    disputed: "text-orange-400",
    revoked: "text-red-400",
    submitted: "text-blue-400",
    under_review: "text-yellow-400",
    action_taken: "text-green-400",
    dismissed: "text-muted-foreground",
    restored: "text-green-400",
  };
  return map[status] || "text-muted-foreground";
}

export default function RightsManager() {
  const { toast } = useToast();
  const [assets, setAssets] = useState([]);
  const [rights, setRights] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("registry");
  const [showRightForm, setShowRightForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showCertForm, setShowCertForm] = useState(false);
  const [certRight, setCertRight] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [assetRes, rightsRes, reportsRes] = await Promise.all([
        apiClient.entities.MediaAsset.filter({ is_proprietary: true }, { sort: "-created_date", limit: 100 }),
        apiClient.entities.MediaRight.filter({}, { sort: "-created_date", limit: 100 }),
        apiClient.entities.CopyrightReport.filter({}, { sort: "-created_date", limit: 100 }),
      ]);
      setAssets(assetRes.items || []);
      setRights(rightsRes.items || []);
      setReports(reportsRes.items || []);
    } catch (err) {
      toast({ title: "Failed to load rights data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRight(data) {
    try {
      await apiClient.entities.MediaRight.create(data);
      toast({ title: "Rights registered successfully" });
      setShowRightForm(false);
      setSelectedAsset(null);
      loadData();
    } catch (err) {
      toast({ title: err.message || "Failed to register rights", variant: "destructive" });
    }
  }

  async function handleSaveReport(data) {
    try {
      await apiClient.entities.CopyrightReport.create(data);
      toast({ title: "Infringement report filed" });
      setShowReportForm(false);
      setSelectedAsset(null);
      loadData();
    } catch (err) {
      toast({ title: err.message || "Failed to file report", variant: "destructive" });
    }
  }

  async function updateReportStatus(report, status, action, notes) {
    try {
      await apiClient.entities.CopyrightReport.update(report.id, {
        status,
        action_taken: action,
        resolution_notes: notes,
        resolved_at: new Date().toISOString(),
      });
      toast({ title: "Report updated" });
      loadData();
    } catch (err) {
      toast({ title: err.message || "Update failed", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl text-foreground flex items-center gap-2">
            <Scale className="w-6 h-6 text-accent" /> Media Rights & Copyright
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Register ownership, track licensing, and manage infringement cases for proprietary media.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { setSelectedAsset(null); setShowRightForm(true); }} variant="outline" className="gap-2">
            <Plus className="w-4 h-4" /> Register Rights
          </Button>
          <Button onClick={() => { setSelectedAsset(null); setShowReportForm(true); }} className="gap-2 bg-destructive hover:bg-destructive/90">
            <FileWarning className="w-4 h-4" /> Report Infringement
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border">
        <button
          onClick={() => setView("registry")}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            view === "registry" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Shield className="w-4 h-4 inline mr-2" /> Rights Registry ({rights.length})
        </button>
        <button
          onClick={() => setView("reports")}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            view === "reports" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Gavel className="w-4 h-4 inline mr-2" /> Infringement Cases ({reports.length})
        </button>
      </div>

      {view === "registry" && (
        <RightsList
          rights={rights}
          onReport={(r) => { setSelectedAsset(r); setShowReportForm(true); }}
          onCertificate={(r) => { setCertRight(r); setShowCertForm(true); }}
        />
      )}

      {view === "reports" && (
        <ReportsList reports={reports} onUpdate={updateReportStatus} />
      )}

      {showRightForm && (
        <RightFormModal
          assets={assets}
          selectedAsset={selectedAsset}
          onSave={handleSaveRight}
          onClose={() => { setShowRightForm(false); setSelectedAsset(null); }}
        />
      )}

      {showReportForm && (
        <ReportFormModal
          assets={assets}
          selectedAsset={selectedAsset}
          rights={rights}
          onSave={handleSaveReport}
          onClose={() => { setShowReportForm(false); setSelectedAsset(null); }}
        />
      )}

      {showCertForm && certRight && (
        <CertificateModal right={certRight} onClose={() => { setShowCertForm(false); setCertRight(null); }} />
      )}
    </div>
  );
}

function RightsList({ rights, onReport, onCertificate }) {
  if (rights.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-lg">
        <Shield className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No rights registered yet. Click "Register Rights" to claim ownership on proprietary media.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {rights.map((r) => (
        <div key={r.id} className="border border-border rounded-lg p-4 bg-card/50">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-heading text-lg text-foreground">{r.asset_title || "Untitled Asset"}</h3>
                <span className={`text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span><strong className="text-foreground/70">Holder:</strong> {r.rights_holder_name}</span>
                <span><strong className="text-foreground/70">Type:</strong> {r.rights_type.replace(/_/g, " ")}</span>
                <span><strong className="text-foreground/70">License:</strong> {r.license_type.replace(/_/g, " ")}</span>
                {r.registration_number && <span><strong className="text-foreground/70">Reg #:</strong> {r.registration_number}</span>}
                {r.territory && <span><strong className="text-foreground/70">Territory:</strong> {r.territory}</span>}
                {r.expiry_date && <span><strong className="text-foreground/70">Expires:</strong> {r.expiry_date}</span>}
              </div>
              {r.usage_rights && r.usage_rights.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.usage_rights.map((u) => (
                    <span key={u} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                      {u.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}
              {r.notes && <p className="text-sm text-muted-foreground mt-2">{r.notes}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => onCertificate(r)} className="text-accent hover:text-accent gap-1.5">
                <Award className="w-3.5 h-3.5" /> Certificate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onReport(r)} className="text-destructive hover:text-destructive gap-1.5">
                <FileWarning className="w-3.5 h-3.5" /> Report
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsList({ reports, onUpdate }) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-border rounded-lg">
        <Gavel className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No infringement cases filed. Use "Report Infringement" to open a case.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      {reports.map((rep) => (
        <div key={rep.id} className="border border-border rounded-lg p-4 bg-card/50">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-heading text-lg text-foreground">{rep.asset_title || "Asset"}</h3>
                <span className={`text-xs font-medium ${statusColor(rep.status)}`}>{rep.status.replace(/_/g, " ")}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {rep.report_type.replace(/_/g, " ")} by {rep.reporter_name}
              </p>
            </div>
            {rep.action_taken !== "none" && (
              <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                Action: {rep.action_taken}
              </span>
            )}
          </div>
          {rep.infringement_summary && <p className="text-sm text-foreground/80 mb-2">{rep.infringement_summary}</p>}
          {rep.original_work_title && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong className="text-foreground/70">Original work:</strong> {rep.original_work_title}
              {rep.original_work_url && <a href={rep.original_work_url} target="_blank" rel="noreferrer" className="text-primary ml-1 underline">view</a>}
            </p>
          )}
          {rep.resolution_notes && (
            <div className="mt-2 p-2 rounded bg-secondary/30 text-sm text-foreground/70">
              <strong>Resolution:</strong> {rep.resolution_notes}
            </div>
          )}
          {rep.status === "submitted" || rep.status === "under_review" ? (
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => onUpdate(rep, "under_review", "none", "Case opened for investigation.")}>
                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Review
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onUpdate(rep, "action_taken", "takedown", "Content removed due to confirmed infringement.")}>
                <Gavel className="w-3.5 h-3.5 mr-1" /> Takedown
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdate(rep, "dismissed", "dismissed", "No infringement found.")}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border rounded-lg bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AssetPicker({ assets, value, onChange }) {
  return (
    <div>
      <Label className="mb-1.5 block">Proprietary Asset</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
      >
        <option value="">Select an asset...</option>
        {assets.map((a) => (
          <option key={a.id} value={a.id}>{a.title || "Untitled"} ({a.asset_type})</option>
        ))}
      </select>
      {assets.length === 0 && (
        <p className="text-xs text-muted-foreground mt-1">No proprietary assets found. Mark media as proprietary first.</p>
      )}
    </div>
  );
}

function RightFormModal({ assets, selectedAsset, onSave, onClose }) {
  const [form, setForm] = useState({
    media_asset_id: "",
    asset_title: "",
    rights_holder_name: "",
    rights_holder_email: "",
    rights_type: "original_work",
    license_type: "exclusive",
    registration_number: "",
    registration_date: "",
    territory: "global",
    usage_rights: [],
    expiry_date: "",
    notes: "",
  });

  function toggleUsage(u) {
    setForm((f) => ({
      ...f,
      usage_rights: f.usage_rights.includes(u) ? f.usage_rights.filter((x) => x !== u) : [...f.usage_rights, u],
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.media_asset_id || !form.rights_holder_name) return;
    const asset = assets.find((a) => a.id === form.media_asset_id);
    onSave({ ...form, asset_title: asset?.title || "", asset_type: asset?.asset_type || "music" });
  }

  return (
    <ModalShell title="Register Media Rights" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <AssetPicker assets={assets} value={form.media_asset_id} onChange={(v) => setForm({ ...form, media_asset_id: v })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Rights Holder Name *</Label>
            <Input value={form.rights_holder_name} onChange={(e) => setForm({ ...form, rights_holder_name: e.target.value })} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Holder Email</Label>
            <Input type="email" value={form.rights_holder_email} onChange={(e) => setForm({ ...form, rights_holder_email: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Rights Type</Label>
            <select value={form.rights_type} onChange={(e) => setForm({ ...form, rights_type: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
              {RIGHTS_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">License Type</Label>
            <select value={form.license_type} onChange={(e) => setForm({ ...form, license_type: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
              {LICENSE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Registration Number</Label>
            <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Registration Date</Label>
            <Input type="date" value={form.registration_date} onChange={(e) => setForm({ ...form, registration_date: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Territory</Label>
            <Input value={form.territory} onChange={(e) => setForm({ ...form, territory: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Expiry Date</Label>
            <Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Usage Rights</Label>
          <div className="flex flex-wrap gap-2">
            {USAGE_OPTIONS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => toggleUsage(u)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  form.usage_rights.includes(u)
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {u.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Register Rights</Button>
        </div>
      </form>
    </ModalShell>
  );
}

function ReportFormModal({ assets, selectedAsset, rights, onSave, onClose }) {
  const [form, setForm] = useState({
    media_asset_id: selectedAsset?.media_asset_id || selectedAsset?.id || "",
    asset_title: selectedAsset?.asset_title || selectedAsset?.title || "",
    reporter_name: "",
    reporter_email: "",
    report_type: "infringement",
    infringement_summary: "",
    original_work_title: "",
    original_work_url: "",
    notes: "",
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.media_asset_id || !form.reporter_name) return;
    const asset = assets.find((a) => a.id === form.media_asset_id);
    onSave({ ...form, asset_title: asset?.title || form.asset_title });
  }

  return (
    <ModalShell title="Report Copyright Infringement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <AssetPicker assets={assets} value={form.media_asset_id} onChange={(v) => setForm({ ...form, media_asset_id: v })} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Your Name *</Label>
            <Input value={form.reporter_name} onChange={(e) => setForm({ ...form, reporter_name: e.target.value })} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Your Email</Label>
            <Input type="email" value={form.reporter_email} onChange={(e) => setForm({ ...form, reporter_email: e.target.value })} />
          </div>
        </div>
        <div>
          <Label className="mb-1.5 block">Report Type</Label>
          <select value={form.report_type} onChange={(e) => setForm({ ...form, report_type: e.target.value })} className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground">
            {REPORT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <div>
          <Label className="mb-1.5 block">Infringement Summary *</Label>
          <Textarea value={form.infringement_summary} onChange={(e) => setForm({ ...form, infringement_summary: e.target.value })} rows={3} required placeholder="Describe the alleged infringement..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Original Work Title</Label>
            <Input value={form.original_work_title} onChange={(e) => setForm({ ...form, original_work_title: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Original Work URL</Label>
            <Input value={form.original_work_url} onChange={(e) => setForm({ ...form, original_work_url: e.target.value })} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="destructive">File Report</Button>
        </div>
      </form>
    </ModalShell>
  );
}