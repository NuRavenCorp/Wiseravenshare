import React, { useEffect, useMemo, useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Input, Textarea } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { Chip } from '../components/common/Chip';
import { Loader } from '../components/common/Loader';
import { EmptyState } from '../components/common/EmptyState';
import { api, endpoints } from '../lib/api';
import { relativeTime, truncate } from '../lib/format';
import { FiBook, FiPlus, FiRefreshCcw, FiSearch, FiTrash2 } from 'react-icons/fi';

export default function KnowledgePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    content: '',
    source: 'manual',
    sourceUrl: '',
    category: '',
    tags: '',
    isPublic: true,
  });

  const load = async (search = query) => {
    search ? setSearching(true) : setLoading(true);
    setError('');
    try {
      const params = { limit: 200 };
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get(endpoints.knowledge, { params });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load knowledge records.');
      setItems([]);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  useEffect(() => {
    load('');
  }, []);

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.post(endpoints.knowledge, {
        title: form.title,
        content: form.content,
        source: form.source || 'manual',
        sourceUrl: form.sourceUrl || null,
        category: form.category || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        isPublic: !!form.isPublic,
      });

      setForm({
        title: '',
        content: '',
        source: 'manual',
        sourceUrl: '',
        category: '',
        tags: '',
        isPublic: true,
      });
      await load('');
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to save knowledge record.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete this knowledge record?')) return;
    setError('');
    try {
      await api.delete(`${endpoints.knowledge}/${id}`);
      await load(query);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to delete knowledge record.');
    }
  };

  const stats = useMemo(() => {
    const total = items.length;
    const publicCount = items.filter((x) => x.isPublic).length;
    const tokenCount = items.reduce((sum, x) => sum + (x.tokenCount || 0), 0);
    return { total, publicCount, tokenCount };
  }, [items]);

  return (
    <Layout title="Knowledge" subtitle="RAG documents and semantic search">
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20 }}>
        <Card title="Add knowledge" subtitle="Create searchable records for retrieval">
          <div style={{ display: 'grid', gap: 10 }}>
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Policy overview, product FAQ, SOP..."
            />
            <Textarea
              label="Content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              placeholder="Paste full text to index for retrieval..."
              style={{ minHeight: 140 }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Input
                label="Source"
                value={form.source}
                onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                placeholder="manual"
              />
              <Input
                label="Category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="operations"
              />
            </div>
            <Input
              label="Source URL"
              value={form.sourceUrl}
              onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
              placeholder="https://..."
            />
            <Input
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="faq, support, onboarding"
            />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))}
              />
              Public record
            </label>
            {error && <p style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <Button icon={<FiPlus />} onClick={submit} loading={saving}>
                Add record
              </Button>
              <Button variant="secondary" icon={<FiRefreshCcw />} onClick={() => load(query)} disabled={loading || searching}>
                Refresh
              </Button>
            </div>
          </div>
        </Card>

        <Card
          title="Knowledge index"
          subtitle={`${stats.total} records · ${stats.publicCount} public · ~${stats.tokenCount} tokens`}
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Input
                style={{ width: 260 }}
                placeholder="Search title/content/source..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button size="sm" variant="secondary" icon={<FiSearch />} onClick={() => load(query)} loading={searching}>
                Search
              </Button>
            </div>
          }
        >
          {loading ? (
            <Loader />
          ) : items.length === 0 ? (
            <EmptyState icon={<FiBook />} title="No knowledge records" description="Add your first record to make retrieval more useful." />
          ) : (
            <div className="scroll-y" style={{ maxHeight: 620, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((item) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--surface-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        {item.source || 'manual'} · {item.category || 'uncategorized'} · {relativeTime(item.updatedAt)}
                      </div>
                      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>{truncate(item.content, 220)}</p>
                      <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Chip tone={item.isPublic ? 'success' : 'neutral'}>{item.isPublic ? 'Public' : 'Private'}</Chip>
                        <Chip tone={item.isApproved ? 'accent' : 'warning'}>{item.isApproved ? 'Approved' : 'Pending'}</Chip>
                        <Chip>{item.tokenCount || 0} tokens</Chip>
                        {(item.tags || []).map((tag) => (
                          <Chip key={`${item.id}-${tag}`}>{tag}</Chip>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(item.id)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}
                      title="Delete record"
                    >
                      <FiTrash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
