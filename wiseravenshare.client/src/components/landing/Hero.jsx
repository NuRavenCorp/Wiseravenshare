import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";

const HERO_IMG =
  "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/4c7a4704c_singularity.jpg";

export default function Hero() {
  return (
    <section id="top" className="relative min-h-screen flex items-center overflow-hidden bg-grain">
      <div className="absolute inset-0 z-0">
        <Image
          src={HERO_IMG}
          alt="A mystical raven in flight through cosmic violet mist"
          fittingType="fill"
          className="w-full h-full object-cover opacity-55"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-background/40" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6 pt-32 pb-20 w-full">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs tracking-[0.2em] uppercase text-primary/90 font-medium">
              Built on Truth &amp; Integrity
            </span>
          </div>

          <h1 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[1.05] font-medium text-foreground">
            Where creators soar
            <br />
            <span className="italic text-accent text-glow-gold">on the wings</span> of truth
          </h1>

          <p className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed font-light">
            WiseRavenShare is a creator's social platform where every post carries an integrity score,
            every voice can be challenged, and every story is measured against the light of honesty.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 text-base">
              <a href="#features" className="flex items-center gap-2">
                Explore the Platform <ArrowRight className="w-4 h-4" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full px-8 text-base border-border bg-background/40 backdrop-blur-sm"
            >
              <a href="#mission" className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-accent" /> Our Mission
              </a>
            </Button>
          </div>
        </motion.div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-muted-foreground">
        <span className="text-xs tracking-[0.3em] uppercase">Scroll</span>
        <div className="w-px h-12 bg-gradient-to-b from-primary/60 to-transparent" />
      </div>
    </section>
  );
}