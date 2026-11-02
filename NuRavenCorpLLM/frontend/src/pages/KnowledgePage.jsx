import React from 'react';
import { Layout } from '../components/common/Layout';
import { PromptInputCard } from '../components/common/PromptInputCard';

export default function KnowledgePage() {
  return (
    <Layout title="Knowledge" subtitle="RAG documents and semantic search">
      <PromptInputCard
        section="knowledge"
        title="Knowledge prompt input"
        subtitle="Submit prompts for knowledge capture and retrieval tuning."
        placeholder="Describe the knowledge update, fact set, or retrieval need..."
      />
    </Layout>
  );
}
