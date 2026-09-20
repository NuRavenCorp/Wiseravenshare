import React, { useEffect, useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Chip } from '../components/common/Chip';
import { Loader } from '../components/common/Loader';
import { EmptyState } from '../components/common/EmptyState';
import { api, endpoints } from '../lib/api';
import { relativeTime, truncate } from '../lib/format';
import { FiPlus, FiUsers, FiKey, FiCopy, FiTrash2, FiActivity } from 'react-icons/fi';

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [keys, setKeys] = useState([]);
  const [form, setForm] = useState({ name: '', description: '', contactEmail: '' });
  const [newKey, setNewKey] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoints.clients);
      setClients(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadKeys = async (clientId) => {
    const { data } = await api.get(`${endpoints.clients}/${clientId}/keys`);
    setKeys(data);
  };

  const openClient = (c) => {
    setSelected(c);
    loadKeys(c.id);
  };

  const create = async () => {
    if (!form.name.trim()) return;
    const { data } = await api.post(endpoints.clients, form);
    setModalOpen(false);
    setForm({ name: '', description: '', contactEmail: '' });
    load();
    openClient(data);
  };

  const issueKey = async () => {
    if (!selected) return;
    const { data } = await api.post(`${endpoints.clients}/${selected.id}/keys`, {
      label: 'Default',
    });
    setNewKey(data.plaintextKey || data.key);
    loadKeys(selected.id);
  };

  const revokeKey = async (keyId) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;
    await api.delete(`${endpoints.clients}/${selected.id}/keys/${keyId}`);
    loadKeys(selected.id);
  };

  const copy = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) return <Layout title="Clients"><Loader /></Layout>;

  return (
    <Layout
      title="Clients"
      subtitle="API consumers, keys, and event streams"
      action={<Button icon={<FiPlus />} onClick={() => setModalOpen(true)}>New client</Button>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.2fr' : '1fr', gap: 20 }}>
        <div className="grid-auto">
          {clients.length === 0 && (
            <EmptyState
              icon={<FiUsers />}
              title="No clients yet"
              description="Register your first API consumer to start issuing keys."
              action={<Button onClick={() => setModalOpen(true)}>New client</Button>}
            />
          )}
          {clients.map((c) => (
            <Card
              key={c.id}
              hoverable
              onClick={() => openClient(c)}
              style={{
                cursor: 'pointer',
                borderColor: selected?.id === c.id ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, var(--accent-3), var(--accent))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FiUsers color="white" size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {c.contactEmail || 'no contact'} · {relativeTime(c.createdAt)}
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                {truncate(c.description, 100) || 'No description'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Chip tone={c.isActive ? 'success' : 'danger'}>{c.isActive ? 'Active' : 'Suspended'}</Chip>
                <Chip tone="accent">{c.apiKeyCount ?? 0} keys</Chip>
              </div>
            </Card>
          ))}
        </div>

        {selected && (
          <Card
            title={selected.name}
            subtitle="API key management"
            action={
              <button
                onClick={() => setSelected(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
              >
                Close
              </button>
            }
          >
            <Button size="sm" icon={<FiKey />} onClick={issueKey} style={{ marginBottom: 16 }}>
              Issue new key
            </Button>

            {newKey && (
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 16,
                background: 'rgba(34,197,94,0.1)', border: '1px solid var(--success)',
              }}>
                <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 700, marginBottom: 6, textTransform: 'uppercase' }}>
                  Copy this key now — it will not be shown again
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code className="mono" style={{ flex: 1, fontSize: 12, wordBreak: 'break-all' }}>{newKey}</code>
                  <Button size="sm" variant="secondary" icon={<FiCopy />} onClick={() => copy(newKey)} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {keys.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No keys issued yet.</p>
              )}
              {keys.map((k) => (
                <div key={k.id} style={{
                  padding: 12, borderRadius: 10,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{k.label || 'Untitled'}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      {k.prefix}••••••••
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      {k.lastUsedAt ? `Last used ${relativeTime(k.lastUsedAt)}` : 'Never used'}
                    </div>
                  </div>
                  <button
                    onClick={() => revokeKey(k.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                  >
                    <FiTrash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <FiActivity size={14} color="var(--accent)" />
                <strong style={{ fontSize: 13 }}>Recent events</strong>
              </div>
              <ClientEventStream clientId={selected.id} />
            </div>
          </Card>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Register client">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Contact email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={create}>Register</Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

function ClientEventStream({ clientId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    let conn;
    (async () => {
      const { createConnection } = await import('../lib/signalr');
      conn = createConnection('clients');
      conn.on('event', (e) => {
        if (e.clientId === clientId || !e.clientId) {
          setEvents((prev) => [e, ...prev].slice(0, 20));
        }
      });
      await conn.start();
      conn.invoke('SubscribeClient', clientId).catch(() => {});
    })();
    return () => { if (conn) conn.stop(); };
  }, [clientId]);

  if (events.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No recent events</p>;
  }

  return (
    <div className="scroll-y" style={{ maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((e, i) => (
        <div key={i} style={{
          fontSize: 11, padding: '6px 10px', borderRadius: 6,
          background: 'var(--surface-3)', display: 'flex', justifyContent: 'space-between',
        }}>
          <span className="mono">{e.kind || e.type}</span>
          <span style={{ color: 'var(--text-muted)' }}>{relativeTime(e.at || Date.now())}</span>
        </div>
      ))}
    </div>
  );
}
