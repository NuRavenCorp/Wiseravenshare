import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Scale, Swords, Eye } from "lucide-react";

const pillars = [
  {
    icon: ShieldCheck,
    title: "The Truth Integer",
    body: "Every claim, post, and story is filtered through integrity algorithms that assign a numeric truth score — a beacon of credibility the community can see and trust.",
  },
  {
    icon: Swords,
    title: "Challenge for Integrity",
    body: "Disagree with a claim? Challenge it. Disputes surface evidence, invite community review, and let the truth emerge through open, transparent scrutiny.",
  },
  {
    icon: Eye,
    title: "AI Detection",
    body: "Our filters detect manipulated media, AI-generated content, and misleading claims — so what you see is what's real, and creators are held to their word.",
  },
  {
    icon: Scale,
    title: "Symbiotic Sharing",
    body: "We form honest bridges to YouTube and Meta — sharing content with integrity intact, so your truth travels across platforms without losing its soul.",
  },
];

export default function MissionSection() {
  return (
    <section id="mission" className="relative py-28 md:py-36 overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="max-w-3xl"
        >
          <span className="text-xs tracking-[0.3em] uppercase text-accent font-medium">The Mission</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground">
            A platform measured by the
            <span className="italic text-primary text-glow"> light of honesty</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed">
            In a world drowning in noise, WiseRavenShare returns the creator's voice to its rightful perch —
            elevated by evidence, guarded by community, and bound to the truth.
          </p>
        </motion.div>

        <motion.blockquote
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-12 max-w-3xl border-l-2 border-accent/50 pl-6"
        >
          <p className="font-heading text-2xl md:text-3xl italic text-foreground/90 leading-snug">
            "Every action taken based on a lie is a wasted action and time stolen."
          </p>
          <footer className="mt-3 text-sm tracking-[0.2em] uppercase text-accent/80 font-medium">
            — Arnold Spence Jr
          </footer>
        </motion.blockquote>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {pillars.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="group relative p-7 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-primary/40 transition-all duration-500"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500">
                <p.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-heading text-2xl text-foreground mb-3">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed font-light">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}