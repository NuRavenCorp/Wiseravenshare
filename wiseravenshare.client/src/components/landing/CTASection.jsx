import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Feather, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CTASection() {
  return (
    <section className="relative py-28 md:py-40 overflow-hidden">
      <div className="absolute inset-0 bg-grain pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8 }}
        className="relative mx-auto max-w-4xl px-6 text-center"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full border border-primary/30 bg-primary/10 mb-8 mx-auto">
          <Feather className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground">
          Take your perch in the
          <span className="italic text-accent text-glow-gold"> flock of truth</span>
        </h2>
        <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed max-w-2xl mx-auto">
          Join the creators building a social world worth believing in — where integrity is the currency,
          and every voice earns its place on the branch.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-8 text-base">
            <Link to="/register" className="flex items-center gap-2">
              Create Your Account <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full px-8 text-base border-border">
            <Link to="/login">I'm Already a Member</Link>
          </Button>
        </div>
      </motion.div>
    </section>
  );
}