import React, { useEffect, useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Tabs } from '../components/common/Tabs';
import { Chip } from '../components/common/Chip';
import { Loader } from '../components/common/Loader';
import { EmptyState } from '../components/common/EmptyState';
import { api, endpoints } from '../lib/api';
import { relativeTime, absoluteTime } from '../lib/format';
import { FiShield, FiAlertOctagon, FiFileText, FiClock } from 'react-icons/fi';

export default function GovernancePage() {
  const [tab, setTab] = useState('policies');
  const [policies, setPolicies] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [audit, setAudit] = useState([]);
  const [retention, setRetention] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, i, a, r] = await Promise.all([
          api.get(`${endpoints.governance}/policies`).catch(() => ({ data: [] })),
          api.get(`${endpoints.governance}/incidents`).catch(() => ({ data: [] })),
          api.get(`${endpoints.governance}/audit?limit=100`).catch(() => ({ data: [] })),
          api.get(`${endpoints.governance}/retention`).catch(() => ({ data: null })),
        ]);
        setPolicies(p.data);
        setIncidents(i.data);
        setAudit(a.data);
        setRetention(r.data);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <Layout title="Governance" subtitle="Policies, incidents, audit, retention">
      <Tabs
        tabs={[
          { id: 'policies', label: `Policies (${policies.length})` },
          { id: 'incidents', label: `Incidents (${incidents.length})` },
          { id: 'audit', label: `Audit log (${audit.length})` },
          { id: 'retention', label: 'Retention' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div style={{ marginTop: 20 }}>
        {loading ? <Loader /> : (
          <>
            {tab === 'policies' && (
              <div className="grid-auto">
                {policies.length === 0 ? (
                  <EmptyState icon={<FiShield />} title="No policies defined" description="Add a policy to enforce content, PII, or budget rules." />
                ) : policies.map((p) => (
                  <Card key={p.id} hoverable>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <strong style={{ fontSize: 14 }}>{p.name}</strong>
                      <Chip tone={p.isEnabled ? 'success' : 'neutral'}>
                        {p.isEnabled ? 'Enabled' : 'Disabled'}
                      </Chip>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                      {p.description}
                    </p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <Chip tone="accent">{p.kind}</Chip>
                      <Chip>{p.severity || 'Medium'}</Chip>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'incidents' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incidents.length === 0 ? (
                  <EmptyState icon={<FiAlertOctagon />} title="No incidents" description="All clear. No policy violations detected." />
                ) : incidents.map((inc) => (
                  <Card key={inc.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                          <Chip tone={inc.severity === 'High' ? 'danger' : inc.severity === 'Medium' ? 'warning' : 'info'}>
                            {inc.severity}
                          </Chip>
                          <Chip>{inc.kind}</Chip>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relativeTime(inc.occurredAt)}</span>
                        </div>
                        <p style={{ fontSize: 13 }}>{inc.description}</p>
                        {inc.details && (
                          <pre className="mono" style={{
                            marginTop: 8, fontSize: 11, color: 'var(--text-muted)',
                            background: 'var(--surface-2)', padding: 10, borderRadius: 8,
                            overflow: 'auto', maxHeight: 120,
                          }}>
                            {typeof inc.details === 'string' ? inc.details : JSON.stringify(inc.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {tab === 'audit' && (
              <Card>
                {audit.length === 0 ? (
                  <EmptyState icon={<FiFileText />} title="No audit entries" description="Audit log is empty." />
                ) : (
                  <div className="scroll-y" style={{ maxHeight: 600 }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                          <th style={{ padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>When</th>
                          <th style={{ padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Actor</th>
                          <th style={{ padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Action</th>
                          <th style={{ padding: '8px 6px', color: 'var(--text-muted)', fontWeight: 600 }}>Resource</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.map((a) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 6px', color: 'var(--text-muted)' }}>{absoluteTime(a.at)}</td>
                            <td style={{ padding: '8px 6px' }} className="mono">{a.actorId || 'system'}</td>
                            <td style={{ padding: '8px 6px' }}>
                              <Chip tone="accent">{a.action}</Chip>
                            </td>
                            <td style={{ padding: '8px 6px' }} className="mono">{a.resource}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {tab === 'retention' && (
              <Card title="Retention policy" subtitle="Data lifecycle settings">
                {retention ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <Row icon={<FiClock />} label="Conversation retention" value={`${retention.conversationDays ?? 90} days`} />
                    <Row icon={<FiClock />} label="Audit retention" value={`${retention.auditDays ?? 365} days`} />
                    <Row icon={<FiClock />} label="Ingestion retention" value={`${retention.ingestionDays ?? 180} days`} />
                    <Row icon={<FiClock />} label="Sample retention" value={`${retention.sampleDays ?? 365} days`} />
                  </div>
                ) : (
                  <EmptyState icon={<FiClock />} title="Not configured" description="Retention settings are unavailable." />
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function Row({ icon, label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 14px', borderRadius: 10,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
