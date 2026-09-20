import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function ModelsPage() {
  return (
    <Layout title="Models" subtitle="Providers, models, routes, and usage">
      <Card title="Models">
        <p style={{ color: 'var(--text-secondary)' }}>Models and provider panels are scaffolded.</p>
      </Card>
    </Layout>
  );
}
