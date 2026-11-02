import React from 'react';
import { Layout } from '../components/common/Layout';
import { PromptInputCard } from '../components/common/PromptInputCard';

export default function LearningPage() {
  return (
    <Layout title="Learning" subtitle="Sample review, batch management, fine-tuning">
      <PromptInputCard
        section="learning"
        title="Learning prompt input"
        subtitle="Submit learning prompts for review and pipeline curation."
        placeholder="Describe the learning rule, correction, or training prompt..."
      />
    </Layout>
  );
}
