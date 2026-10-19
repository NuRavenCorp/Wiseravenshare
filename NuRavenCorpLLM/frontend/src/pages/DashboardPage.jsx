import React from 'react';
import { Layout } from '../components/common/Layout';
import { Stat } from '../components/common/Stat';
import { Card } from '../components/common/Card';
import { formatNumber, formatCurrency } from '../lib/format';
import { FiActivity, FiDollarSign, FiZap, FiUsers } from 'react-icons/fi';

export default function DashboardPage() {
  return (
    <Layout title="Dashboard" subtitle="Platform intelligence at a glance">
      <div className="grid-auto" style={{ marginBottom: 24 }}>
        <Stat label="Total Requests" value={formatNumber(125430)} delta={12} icon={<FiActivity />} />
        <Stat label="Tokens Processed" value={formatNumber(8234120)} delta={8} icon={<FiZap />} />
        <Stat label="Cost (24h)" value={formatCurrency(42.18)} delta={-3} icon={<FiDollarSign />} />
        <Stat label="Active Clients" value="3" delta={0} icon={<FiUsers />} />
      </div>
      <Card title="System Health">
        <p style={{ color: 'var(--text-secondary)' }}>Dashboard wired and ready for live API data.</p>
      </Card>
    </Layout>
  );
}
