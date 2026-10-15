import React from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TruthAlgorithmTab from "@/components/truthseeker/TruthAlgorithmTab";
import ChallengesTab from "@/components/truthseeker/ChallengesTab";
import ReputationTab from "@/components/truthseeker/ReputationTab";
import MusicStampTab from "@/components/truthseeker/MusicStampTab";
import { Sparkles, Gavel, Crown, Disc3 } from "lucide-react";

export default function TruthSeeker() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="font-heading text-4xl text-foreground mb-2 text-glow">
            Truth<span className="text-accent">Seeker</span>
          </h1>
          <p className="text-muted-foreground">
            Our integrity engine: AI-powered truth scoring, community
            challenges, and reputation tracking.
          </p>
        </div>
        <Tabs defaultValue="algorithm">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="algorithm" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Algorithm
            </TabsTrigger>
            <TabsTrigger value="challenges" className="flex items-center gap-2">
              <Gavel className="w-4 h-4" /> Challenges
            </TabsTrigger>
            <TabsTrigger value="reputation" className="flex items-center gap-2">
              <Crown className="w-4 h-4" /> Reputation
            </TabsTrigger>
            <TabsTrigger value="music" className="flex items-center gap-2">
              <Disc3 className="w-4 h-4" /> Music Stamp
            </TabsTrigger>
          </TabsList>
          <TabsContent value="algorithm">
            <TruthAlgorithmTab />
          </TabsContent>
          <TabsContent value="challenges">
            <ChallengesTab />
          </TabsContent>
          <TabsContent value="reputation">
            <ReputationTab />
          </TabsContent>
          <TabsContent value="music">
            <MusicStampTab />
          </TabsContent>
        </Tabs>
      </main>
      <Footer />
    </div>
  );
}