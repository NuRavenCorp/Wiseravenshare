import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function KnowledgePage() {
  return (
    <Layout title="Knowledge" subtitle="RAG documents and semantic search">
      <Card title="Knowledge">
        <p style={{ color: 'var(--text-secondary)' }}>Knowledge page scaffold is ready for document CRUD/search wiring.</p>
      </Card>
    </Layout>
  );
}
