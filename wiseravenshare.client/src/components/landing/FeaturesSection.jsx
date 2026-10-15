import React from "react";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Heart,
  Hash,
  Users,
  Radio,
  Mic2,
  Newspaper,
  Music4,
  Video,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import PostsFeed from "@/components/feed/PostsFeed";

const features = [
  {
    icon: MessageCircle,
    title: "The Social Feed",
    body: "Posts, likes, comments, shares, and hashtags — the social fabric you expect, woven with integrity at every thread.",
    tag: "Core Social",
    to: "/social",
  },
  {
    icon: Hash,
    title: "Partials (%)",
    body: "Express nuance with partials — %human, %truth, %real — any tag that denotes part of something, giving language to the in-between.",
    tag: "Unique",
    to: "/social",
  },
  {
    icon: Users,
    title: "Follow &amp; Block",
    body: "Curate your flock. Follow creators who earn your trust, unfollow those who don't, and block what has no place in your sky.",
    tag: "Social",
    to: "/social",
  },
  {
    icon: Radio,
    title: "Ravensight Podcasts",
    body: "Multi-camera podcast studio with a four-source video feed array — collaborate across rooms, across cities, across the globe.",
    tag: "Ravensight",
    to: "/podcasts",
  },
  {
    icon: Newspaper,
    title: "Amateur Journalism",
    body: "Anyone can report. Stories run through truth filters and AI detection, then fill the who, what, where, when, why, and how.",
    tag: "Ravensight",
    to: "/journalism",
  },
  {
    icon: Music4,
    title: "Music &amp; Jam Sessions",
    body: "Upload proprietary tracks, connect instruments via Bluetooth, sync recorded tracks, and jam in real time with creators worldwide.",
    tag: "Creator",
    to: "/media",
  },
  {
    icon: Mic2,
    title: "Karaoke",
    body: "Step into the Ravensight karaoke stage — sing, perform, and share your voice with a community that celebrates every creator.",
    tag: "Ravensight",
    to: "/media",
  },
  {
    icon: Video,
    title: "Creator Library",
    body: "Photos, music, and videos stored securely in your library — ready to share, perform, or weave into your next creation.",
    tag: "Storage",
    to: "/media",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="relative py-28 md:py-36 bg-card/30 border-y border-border/40">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-3xl mx-auto"
        >
          <span className="text-xs tracking-[0.3em] uppercase text-accent font-medium">The Universe</span>
          <h2 className="mt-4 font-heading text-4xl md:text-5xl lg:text-6xl leading-tight text-foreground">
            One platform,
            <span className="italic text-primary text-glow"> many wings</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground font-light leading-relaxed">
            From the social feed to the podcast studio, from live jam sessions to citizen journalism —
            every feature exists to lift the honest creator higher.
          </p>
        </motion.div>

        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => (
            <Link
              key={f.title}
              to={f.to}
              className="group relative block p-6 rounded-2xl border border-border bg-background/60 backdrop-blur-sm hover:border-primary/40 hover:bg-card/60 transition-all duration-500"
            >
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-500">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] tracking-[0.15em] uppercase text-accent/70 font-medium">
                    {f.tag}
                  </span>
                </div>
                <h3
                  className="font-heading text-xl text-foreground mb-2.5"
                  dangerouslySetInnerHTML={{ __html: f.title }}
                />
                <p
                  className="text-sm text-muted-foreground leading-relaxed font-light"
                  dangerouslySetInnerHTML={{ __html: f.body }}
                />
                <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  Explore <ArrowRight className="w-3 h-3" />
                </span>
              </motion.div>
            </Link>
          ))}
            </div>

            <div className="mt-24">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="text-center max-w-2xl mx-auto mb-10"
            >
              <span className="text-xs tracking-[0.3em] uppercase text-accent font-medium">Live from the Flock</span>
              <h3 className="mt-3 font-heading text-3xl md:text-4xl text-foreground">Recent Posts</h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Like, comment, follow, and block — the social fabric of WiseRavenShare, woven with integrity.
              </p>
            </motion.div>
            <PostsFeed />
            </div>
            </div>
            </section>
            );
            }