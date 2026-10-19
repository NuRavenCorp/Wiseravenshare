import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';

export default function AnalyticsPage() {
  return (
    <Layout title="Analytics" subtitle="Usage, cost, latency, anomalies">
      <Card title="Analytics">
        <p style={{ color: 'var(--text-secondary)' }}>Analytics dashboard scaffold is in place.</p>
      </Card>
    </Layout>
  );
}
