import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function IngestionPage() {
  return (
    <Layout title="Ingestion" subtitle="Feed external content into the LLM">
      <Card title="Ingestion jobs">
        <p style={{ color: 'var(--text-secondary)' }}>Ingestion UI scaffold is in place for job launch and progress tracking.</p>
      </Card>
    </Layout>
  );
}
