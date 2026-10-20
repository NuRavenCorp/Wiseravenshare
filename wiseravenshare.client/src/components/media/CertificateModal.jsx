import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, Award, Download, Scroll, ShieldCheck, Stamp } from "lucide-react";
import { useBrandLogo } from "@/lib/branding";

const CERT_TYPES = {
  ownership: {
    title: "Certificate of Ownership",
    icon: ShieldCheck,
    body: (r) => `This certifies that ${r.rights_holder_name} is the sole and rightful owner of the ${r.asset_type || "media"} work titled "${r.asset_title || "Untitled"}". This ownership is registered under WiseRavenShare and confers all rights associated with the work, including but not limited to reproduction, distribution, and derivative works.`,
  },
  authenticity: {
    title: "Certificate of Authenticity",
    icon: Stamp,
    body: (r) => `This certifies that the ${r.asset_type || "media"} work titled "${r.asset_title || "Untitled"}" is an authentic original creation by ${r.rights_holder_name}, registered and verified through the WiseRavenShare platform. The work bears registration number ${r.registration_number || "N/A"} and is recognized as genuine as of the date issued.`,
  },
  licensing: {
    title: "Certificate of Licensing Rights",
    icon: Scroll,
    body: (r) => `This certifies that ${r.rights_holder_name} holds ${r.license_type.replace(/_/g, " ")} licensing rights to the ${r.asset_type || "media"} work titled "${r.asset_title || "Untitled"}". The license is ${r.rights_type.replace(/_/g, " ")} and covers the territory of ${r.territory || "global"}.${r.usage_rights && r.usage_rights.length > 0 ? ` Permitted uses include: ${r.usage_rights.map((u) => u.replace(/_/g, " ")).join(", ")}.` : ""}`,
  },
  original_creation: {
    title: "Certificate of Original Creation",
    icon: Award,
    body: (r) => `This certifies that the ${r.asset_type || "media"} work titled "${r.asset_title || "Untitled"}" is an original creation by ${r.rights_holder_name}, first registered on WiseRavenShare on ${r.registration_date || "the date of issuance"}. The creator asserts that this work is original and not a copy or derivative of any other copyrighted material.`,
  },
};

export default function CertificateModal({ right, onClose }) {
  const logoUrl = useBrandLogo();
  const [certType, setCertType] = useState("ownership");
  const certRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  const config = CERT_TYPES[certType];
  const Icon = config.icon;
  const certId = `WRS-${right.id?.slice(-8).toUpperCase() || "XXXXXXXX"}`;
  const issuedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  async function handleDownload() {
    if (!certRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).jsPDF || (await import("jspdf")).default;
      const canvas = await html2canvas(certRef.current, {
        scale: 2,
        backgroundColor: "#0a070d",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 2, canvas.height / 2] });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
      pdf.save(`${certType}_${right.asset_title || "certificate"}.pdf`);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-border rounded-lg bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-xl text-foreground">Generate Certificate</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(CERT_TYPES).map(([key, val]) => {
            const CIcon = val.icon;
            return (
              <button
                key={key}
                onClick={() => setCertType(key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  certType === key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                <CIcon className="w-4 h-4" /> {val.title}
              </button>
            );
          })}
        </div>

        <div
          ref={certRef}
          className="relative overflow-hidden rounded-lg border-2 border-accent/30 p-10"
          style={{
            background: "linear-gradient(135deg, #0a070d 0%, #1a1025 50%, #0a070d 100%)",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}
        >
          {/* Decorative border */}
          <div className="absolute inset-2 border border-accent/20 rounded-lg pointer-events-none" />
          <div className="absolute inset-3 border border-accent/10 rounded-lg pointer-events-none" />

          {/* Corner flourishes */}
          <div className="absolute top-4 left-4 w-12 h-12 border-l-2 border-t-2 border-accent/40 rounded-tl-lg" />
          <div className="absolute top-4 right-4 w-12 h-12 border-r-2 border-t-2 border-accent/40 rounded-tr-lg" />
          <div className="absolute bottom-4 left-4 w-12 h-12 border-l-2 border-b-2 border-accent/40 rounded-bl-lg" />
          <div className="absolute bottom-4 right-4 w-12 h-12 border-r-2 border-b-2 border-accent/40 rounded-br-lg" />

          <div className="relative text-center px-6">
            <img src={logoUrl} alt="WiseRavenShare" className="w-16 h-16 mx-auto mb-3 rounded-full" />
            <p className="text-xs tracking-[0.3em] text-accent uppercase mb-1" style={{ fontFamily: "'Cinzel', serif" }}>
              WiseRavenShare
            </p>
            <div className="w-24 h-px bg-accent/40 mx-auto mb-6" />

            <div className="flex items-center justify-center gap-2 mb-4">
              <Icon className="w-8 h-8 text-accent" />
              <h2 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Cinzel', serif" }}>
                {config.title}
              </h2>
            </div>

            <div className="w-32 h-px bg-accent/30 mx-auto mb-6" />

            <p className="text-sm text-muted-foreground mb-1" style={{ fontFamily: "'Inter', sans-serif" }}>
              Certificate ID: {certId}
            </p>
            <p className="text-sm text-muted-foreground mb-6" style={{ fontFamily: "'Inter', sans-serif" }}>
              Issued on {issuedDate}
            </p>

            <p className="text-lg text-foreground/90 leading-relaxed mb-8 max-w-xl mx-auto" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {config.body(right)}
            </p>

            <div className="flex justify-around items-end mt-10">
              <div className="text-center">
                <div className="w-32 h-px bg-foreground/40 mb-2 mx-auto" />
                <p className="text-sm text-foreground/70" style={{ fontFamily: "'Inter', sans-serif" }}>
                  {right.rights_holder_name}
                </p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>Rights Holder</p>
              </div>

              <div className="flex flex-col items-center">
                <div className="w-20 h-20 rounded-full border-2 border-accent/50 flex items-center justify-center mb-2 bg-accent/5">
                  <Stamp className="w-10 h-10 text-accent/70" />
                </div>
                <p className="text-xs text-accent tracking-widest" style={{ fontFamily: "'Cinzel', serif" }}>VERIFIED</p>
              </div>

              <div className="text-center">
                <div className="w-32 h-px bg-foreground/40 mb-2 mx-auto" />
                <p className="text-sm text-foreground/70" style={{ fontFamily: "'Inter', sans-serif" }}>WiseRavenShare</p>
                <p className="text-xs text-muted-foreground" style={{ fontFamily: "'Inter', sans-serif" }}>Platform Authority</p>
              </div>
            </div>

            {right.registration_number && (
              <p className="text-xs text-muted-foreground mt-6" style={{ fontFamily: "'Inter', sans-serif" }}>
                Registration No. {right.registration_number}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleDownload} disabled={downloading} className="gap-2">
            <Download className="w-4 h-4" /> {downloading ? "Generating..." : "Download PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}