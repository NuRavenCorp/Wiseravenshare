import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ShieldCheck,
  Fingerprint,
  Clock,
  MapPin,
  Plus,
  X,
  BadgeCheck,
  AlertTriangle,
  Award,
  FileCheck2,
  ExternalLink,
} from "lucide-react";
import CertificateModal from "@/components/media/CertificateModal";

const CERT_TYPES = [
  { value: "ownership", label: "Ownership" },
  { value: "authenticity", label: "Authenticity" },
  { value: "licensing", label: "Licensing Rights" },
  { value: "original_creation", label: "Original Creation" },
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM",
  "NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA",
  "WV","WI","WY",
];

function badgeStyle(badge) {
  switch (badge) {
    case "verified":
      return { icon: BadgeCheck, className: "text-green-400 bg-green-500/10 border-green-500/30", label: "Verified" };
    case "flagged":
      return { icon: AlertTriangle, className: "text-orange-400 bg-orange-500/10 border-orange-500/30", label: "Flagged" };
    default:
      return { icon: Clock, className: "text-muted-foreground bg-secondary border-border", label: "Unverified" };
  }
}

export default function DRMManager() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [certRight, setCertRight] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    apiClient.auth.me().then((u) => setIsAdmin(u?.role === "admin")).catch(() => {});
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [certRes, assetRes] = await Promise.all([
        apiClient.entities.DigitalCertificate.filter({}, { sort: "-created_date", limit: 100 }),
        apiClient.entities.MediaAsset.filter({}, { sort: "-created_date", limit: 100 }),
      ]);
      setCertificates(certRes.items || []);
      setAssets(assetRes.items || []);
    } catch {
      toast({ title: "Failed to load certificates", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleIssue(data) {
    try {
      setIssuing(true);
      const res = await apiClient.functions.invoke("IssueDigitalCertificate", data);
      toast({
        title: "Certificate issued",
        description: `ID: ${res.data.certificate.certificate_id}`,
      });
      setShowForm(false);
      loadData();
    } catch (err) {
      toast({
        title: "Failed to issue certificate",
        description: err.response?.data?.error || err.message,
        variant: "destructive",
      });
    } finally {
      setIssuing(false);
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
            <ShieldCheck className="w-6 h-6 text-accent" /> Digital Rights Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Issue ownership certificates with automated metadata timestamps, authenticity badges,
            and state copyright authority verification.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Issue Certificate
          </Button>
        )}
      </div>

      {!isAdmin && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-lg p-3 bg-card/50">
          <ShieldCheck className="w-4 h-4 text-accent shrink-0" />
          Certificate issuance is an administrative function. Contact an admin to issue digital certificates.
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={FileCheck2} label="Total Certificates" value={certificates.length} />
        <StatCard
          icon={BadgeCheck}
          label="Verified"
          value={certificates.filter((c) => c.authenticity_badge === "verified").length}
          accent="green"
        />
        <StatCard
          icon={MapPin}
          label="States Covered"
          value={new Set(certificates.map((c) => c.state).filter(Boolean)).size}
          accent="accent"
        />
        <StatCard
          icon={Fingerprint}
          label="Hashed Files"
          value={certificates.filter((c) => c.file_hash).length}
          accent="purple"
        />
      </div>

      {certificates.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">
            No certificates issued yet. Click "Issue Certificate" to register ownership for a media file.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {certificates.map((cert) => (
            <CertificateCard
              key={cert.id}
              cert={cert}
              onViewCertificate={() =>
                setCertRight({
                  id: cert.id,
                  asset_title: cert.asset_title,
                  asset_type: cert.asset_type,
                  rights_holder_name: cert.rights_holder_name,
                  rights_type: cert.certificate_type,
                  license_type: cert.certificate_type,
                  territory: cert.state || "global",
                  registration_number: cert.certificate_id,
                  registration_date: cert.metadata_timestamp?.slice(0, 10),
                  usage_rights: [],
                })
              }
            />
          ))}
        </div>
      )}

      {showForm && (
        <IssueFormModal
          assets={assets}
          issuing={issuing}
          onIssue={handleIssue}
          onClose={() => setShowForm(false)}
        />
      )}

      {certRight && (
        <CertificateModal right={certRight} onClose={() => setCertRight(null)} />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent }) {
  const colorMap = {
    green: "text-green-400 bg-green-500/10",
    accent: "text-accent bg-accent/10",
    purple: "text-purple-400 bg-purple-500/10",
    default: "text-foreground bg-secondary",
  };
  const color = colorMap[accent] || colorMap.default;
  return (
    <div className="border border-border rounded-lg p-4 bg-card/50">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-heading text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CertificateCard({ cert, onViewCertificate }) {
  const badge = badgeStyle(cert.authenticity_badge);
  const BadgeIcon = badge.icon;
  const certTypeLabel =
    CERT_TYPES.find((t) => t.value === cert.certificate_type)?.label || cert.certificate_type;

  return (
    <div className="border border-border rounded-lg p-4 bg-card/50">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading text-lg text-foreground">
              {cert.asset_title || "Untitled Asset"}
            </h3>
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}
            >
              <BadgeIcon className="w-3 h-3" /> {badge.label}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
              {certTypeLabel}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5" />
              <strong className="text-foreground/70">Cert ID:</strong> {cert.certificate_id}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <strong className="text-foreground/70">Stamped:</strong>{" "}
              {cert.metadata_timestamp
                ? new Date(cert.metadata_timestamp).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "N/A"}
            </span>
            <span>
              <strong className="text-foreground/70">Holder:</strong> {cert.rights_holder_name}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              <strong className="text-foreground/70">Authority:</strong>{" "}
              {cert.copyright_authority || "U.S. Copyright Office"}
              {cert.authority_url && (
                <a
                  href={cert.authority_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary ml-1 inline-flex items-center"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </span>
            {cert.state && (
              <span>
                <strong className="text-foreground/70">State:</strong> {cert.state}
              </span>
            )}
          </div>

          {cert.file_hash && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Fingerprint className="w-3.5 h-3.5 text-accent" />
              <strong className="text-foreground/70">Fingerprint:</strong>
              <code className="font-mono text-foreground/60 truncate max-w-xs">{cert.file_hash}</code>
            </div>
          )}

          {cert.verification_notes && (
            <p className="text-xs text-muted-foreground italic">{cert.verification_notes}</p>
          )}
        </div>

        <div className="shrink-0">
          <Button size="sm" variant="outline" onClick={onViewCertificate} className="gap-1.5">
            <Award className="w-3.5 h-3.5" /> View Certificate
          </Button>
        </div>
      </div>
    </div>
  );
}

function IssueFormModal({ assets, issuing, onIssue, onClose }) {
  const [form, setForm] = useState({
    media_asset_id: "",
    rights_holder_name: "",
    rights_holder_email: "",
    certificate_type: "ownership",
    state: "",
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.media_asset_id || !form.rights_holder_name) return;
    onIssue(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto border border-border rounded-lg bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl text-foreground">Issue Digital Certificate</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="mb-1.5 block">Media Asset *</Label>
            <select
              value={form.media_asset_id}
              onChange={(e) => setForm({ ...form, media_asset_id: e.target.value })}
              required
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Select an asset...</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title || "Untitled"} ({a.asset_type})
                </option>
              ))}
            </select>
            {assets.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No media assets found. Upload media first.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Rights Holder Name *</Label>
              <Input
                value={form.rights_holder_name}
                onChange={(e) => setForm({ ...form, rights_holder_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Holder Email</Label>
              <Input
                type="email"
                value={form.rights_holder_email}
                onChange={(e) => setForm({ ...form, rights_holder_email: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Certificate Type</Label>
              <select
                value={form.certificate_type}
                onChange={(e) => setForm({ ...form, certificate_type: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                {CERT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">State (for authority)</Label>
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              >
                <option value="">Federal (U.S. Copyright Office)</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={issuing} className="gap-2">
              {issuing ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Issuing...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" /> Issue & Verify
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}