import React from "react";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import TodaysVibe from "@/components/vibe/TodaysVibe";

export default function VibeSection() {
  return (
    <section id="vibe" className="relative py-20 bg-grain">
      <div className="mx-auto max-w-3xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-4">
              <Radio className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs tracking-[0.2em] uppercase text-primary/90 font-medium">
                Today's Vibe
              </span>
            </div>
            <h2 className="font-heading text-3xl md:text-4xl text-foreground">
              How is the flock <span className="italic text-accent text-glow-gold">feeling</span> today?
            </h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg mx-auto">
              The community's pulse in real time — share your mood and see what
              everyone else is feeling right now.
            </p>
          </div>
          <TodaysVibe />
        </motion.div>
      </div>
    </section>
  );
}