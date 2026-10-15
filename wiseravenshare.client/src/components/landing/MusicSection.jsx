import React from "react";
import { motion } from "framer-motion";
import { Music4, Bluetooth, Users2, Headphones, ArrowRight } from "lucide-react";
import { Image } from "@/components/ui/image";

const FEATHER_IMG =
  "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/0b40d5de1_generated_image.png";

const points = [
  {
    icon: Music4,
    title: "Proprietary Uploads",
    body: "Upload your original music — beats, tracks, full compositions — and keep ownership of every note.",
  },
  {
    icon: Bluetooth,
    title: "Instrument Sync",
    body: "Connect instruments via Bluetooth, or bring your recorded tracks and %tracks into perfect alignment.",
  },
  {
    icon: Users2,
    title: "Real-Time Jam Sessions",
    body: "Find creators, connect, and jam live — your sounds synced across distance as if you shared one room.",
  },
  {
    icon: Headphones,
    title: "Creator Library",
    body: "Photos, music, and videos live in your library, stored securely and ready for your next session.",
  },
];

export default function MusicSection() {
  return (
    <section id="music" className="relative py-28 md:py-36 bg-card/30 border-y border-border/40 overflow-hidden">
      <div className="absolute right-0 top-0 w-1/2 h-full opacity-20 pointer-events-none hidden lg:block">
        <Image src={FEATHER_IMG} alt="" fittingType="fill" className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl"
        >
          <span className="text-xs tracking-[0.3em] uppercase text-accent font-medium">The Stage</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground">
            Where music meets
            <span className="italic text-primary text-glow"> in real time</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed">
            The main page is a living stage for creators — upload your sound, connect your instruments,
            and jam with artists across the world as if distance never existed.
          </p>
        </motion.div>

        <div className="mt-14 grid sm:grid-cols-2 gap-5 max-w-3xl">
          {points.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="flex gap-4 p-6 rounded-2xl border border-border bg-background/60 backdrop-blur-sm hover:border-primary/40 transition-all duration-500"
            >
              <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <p.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-heading text-xl text-foreground mb-1.5">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed font-light">{p.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}