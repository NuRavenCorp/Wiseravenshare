import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function LearningPage() {
  return (
    <Layout title="Learning" subtitle="Sample review, batch management, fine-tuning">
      <Card title="Learning">
        <p style={{ color: 'var(--text-secondary)' }}>Learning pipeline pages are scaffolded and route-ready.</p>
      </Card>
    </Layout>
  );
}
