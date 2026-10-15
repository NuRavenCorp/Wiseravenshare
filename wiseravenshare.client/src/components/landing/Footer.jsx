import React from "react";
import { Link } from "react-router-dom";
import { Feather } from "lucide-react";

const cols = [
  { title: "Platform", links: ["The Feed", "Ravensight", "Music & Jams", "Karaoke", "Journalism"] },
  { title: "Creators", links: ["Your Library", "Jam Sessions", "Truth Score", "Partials (%)"] },
  { title: "Company", links: ["Our Mission", "Integrity Pledge", "Community", "Contact"] },
];

const legalLinks = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms of Service", to: "/terms" },
  { label: "Cookie Policy", to: "/cookies" },
];

export default function Footer() {
  return (
    <footer className="relative border-t border-border/60 py-16 bg-background">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid md:grid-cols-4 gap-10">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <Feather className="w-6 h-6 text-primary" />
              <span className="font-display text-sm tracking-[0.2em] text-foreground">
                WISE<span className="text-accent">RAVEN</span>SHARE
              </span>
            </div>
            <p className="text-sm text-muted-foreground font-light leading-relaxed">
              A creator's social platform built on truth and integrity.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="text-xs tracking-[0.2em] uppercase text-accent/80 font-medium mb-4">{c.title}</h4>
              <ul className="space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#top" className="text-sm text-muted-foreground hover:text-foreground transition-colors font-light">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-border/40 flex flex-col sm:flex-row justify-between gap-4">
          <p className="text-xs text-muted-foreground font-light">
            &copy; {new Date().getFullYear()} WiseRavenShare. Built on truth.
          </p>
          <div className="flex flex-wrap gap-5">
            {legalLinks.map((l) => (
              <Link key={l.to} to={l.to} className="text-xs text-muted-foreground hover:text-foreground transition-colors font-light">
                {l.label}
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground font-light tracking-wide">
            Integrity is the only currency that matters.
          </p>
        </div>
      </div>
    </footer>
  );
}