import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function CraftPage() {
  return (
    <Layout title="Craft Intelligence" subtitle="Learn the disciplines from the platform and the world">
      <Card title="Craft">
        <p style={{ color: 'var(--text-secondary)' }}>Craft domain/coaching scaffold is ready for API integration.</p>
      </Card>
    </Layout>
  );
}
