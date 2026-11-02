import React from 'react';
import { Layout } from '../components/common/Layout';
import { PromptInputCard } from '../components/common/PromptInputCard';

export default function CraftPage() {
  return (
    <Layout title="Craft Intelligence" subtitle="Learn the disciplines from the platform and the world">
      <PromptInputCard
        section="craft"
        title="Craft prompt input"
        subtitle="Submit prompts for craft coaching and domain skill refinement."
        placeholder="Describe the craft principle, workflow, or coaching prompt..."
      />
    </Layout>
  );
}
