import React from "react";
import { Link } from "react-router-dom";
import { Feather, ArrowLeft } from "lucide-react";

const legalLinks = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Cookie Policy", to: "/cookies" },
];

export default function LegalLayout({ title, subtitle, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <Feather className="w-5 h-5 text-primary" />
            <span className="font-display text-sm tracking-[0.2em]">
              WISE<span className="text-accent">RAVEN</span>SHARE
            </span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14">
        <h1 className="font-heading text-4xl md:text-5xl font-semibold mb-3 text-glow">{title}</h1>
        {subtitle && <p className="text-muted-foreground text-lg font-light mb-2">{subtitle}</p>}
        {lastUpdated && (
          <p className="text-xs text-muted-foreground/70 tracking-wide uppercase mb-10">
            Last updated: {lastUpdated}
          </p>
        )}
        <div className="prose-legal space-y-8">{children}</div>

        <div className="mt-16 pt-8 border-t border-border/40">
          <h3 className="text-xs tracking-[0.2em] uppercase text-accent/80 font-medium mb-4">Other Legal Documents</h3>
          <div className="flex flex-wrap gap-6">
            {legalLinks.map((l) => (
              <Link key={l.to} to={l.to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-4xl px-6 flex flex-col sm:flex-row justify-between gap-3">
          <p className="text-xs text-muted-foreground font-light">
            &copy; {new Date().getFullYear()} WiseRavenShare. Built on truth.
          </p>
          <p className="text-xs text-muted-foreground font-light tracking-wide">
            Integrity is the only currency that matters.
          </p>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="font-heading text-2xl font-semibold mb-3 text-foreground">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-3 font-light">{children}</div>
    </section>
  );
}