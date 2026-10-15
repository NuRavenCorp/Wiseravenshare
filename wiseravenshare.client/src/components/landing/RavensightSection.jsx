import React from "react";
import { motion } from "framer-motion";
import { Radio, Video, Newspaper, Mic2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const cameras = [
  { label: "Cam 01", sub: "Host" },
  { label: "Cam 02", sub: "Guest A" },
  { label: "Cam 03", sub: "Guest B" },
  { label: "Cam 04", sub: "B-Roll" },
];

const journo = [
  { q: "Who", desc: "The people at the center of the story" },
  { q: "What", desc: "The facts that define the event" },
  { q: "Where", desc: "The place it unfolded" },
  { q: "When", desc: "The moment it happened" },
  { q: "Why", desc: "The reason behind it" },
  { q: "How", desc: "The way it came to pass" },
];

export default function RavensightSection() {
  return (
    <section id="ravensight" className="relative py-28 md:py-36 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-accent/30 bg-accent/10 mb-6">
              <Radio className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs tracking-[0.2em] uppercase text-accent/90 font-medium">
                Ravensight
              </span>
            </div>
            <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground">
              The studio that sees
              <span className="italic text-primary text-glow"> from every angle</span>
            </h2>
            <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed">
              Ravensight is the creative engine within WiseRavenShare — a multi-camera podcast studio,
              a stage for amateur journalism, and a karaoke spotlight, all built for creators who reach
              across spaces and across the globe.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex gap-4">
                <Video className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-heading text-lg text-foreground">Four-Source Video Feed</h4>
                  <p className="text-sm text-muted-foreground font-light">
                    An array of four cameras, each on its own source — collaborate in real time from anywhere on earth.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Newspaper className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-heading text-lg text-foreground">Amateur Journalism</h4>
                  <p className="text-sm text-muted-foreground font-light">
                    Report items of interest. Truth filters and AI detection verify integrity before the story goes live.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Mic2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-heading text-lg text-foreground">Karaoke Stage</h4>
                  <p className="text-sm text-muted-foreground font-light">
                    Perform, sing, and share your voice with a community that celebrates every kind of creator.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="space-y-6"
          >
            <div className="p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Video Feed</span>
                <span className="flex items-center gap-1.5 text-xs text-accent">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Live
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {cameras.map((c) => (
                  <div
                    key={c.label}
                    className="aspect-video rounded-lg bg-gradient-to-br from-primary/15 to-background border border-primary/20 flex flex-col items-center justify-center gap-1 relative overflow-hidden"
                  >
                    <div className="absolute top-2 left-2 text-[10px] tracking-wider text-primary/70">{c.label}</div>
                    <Video className="w-6 h-6 text-primary/40" />
                    <span className="text-xs text-muted-foreground">{c.sub}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs tracking-[0.2em] uppercase text-muted-foreground">Journalism Form</span>
                <Newspaper className="w-4 h-4 text-primary/60" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {journo.map((j) => (
                  <div key={j.q} className="p-3 rounded-lg border border-border bg-background/50">
                    <div className="font-heading text-lg text-accent">{j.q}</div>
                    <div className="text-[11px] text-muted-foreground font-light leading-snug">{j.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}