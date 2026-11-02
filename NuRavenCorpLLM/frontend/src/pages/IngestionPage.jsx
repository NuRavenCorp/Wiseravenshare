import React from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Input, Textarea } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { api } from '../lib/api';

const INGESTION_FORM_STORAGE_KEY = 'ingestion.form.v1';
const defaultForm = {
  title: '',
  source: 'ui_ingestion',
  sourceUrl: '',
  category: 'document',
  tags: '',
  content: '',
  note: '',
};

function readStoredForm() {
  const raw = window.localStorage.getItem(INGESTION_FORM_STORAGE_KEY);
  if (!raw) return defaultForm;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return defaultForm;
    return { ...defaultForm, ...parsed };
  } catch (err) {
    console.warn('Ignoring invalid saved ingestion draft.', err);
    return defaultForm;
  }
}

export default function IngestionPage() {
  const [form, setForm] = React.useState(() => readStoredForm());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    window.localStorage.setItem(INGESTION_FORM_STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  const clearForm = () => {
    setForm(defaultForm);
    window.localStorage.removeItem(INGESTION_FORM_STORAGE_KEY);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.post('/assistant/knowledge/ingest', {
        title: form.title.trim(),
        content: form.content.trim(),
        source: form.source.trim() || null,
        sourceUrl: form.sourceUrl.trim() || null,
        category: form.category.trim() || null,
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        note: form.note.trim() || null,
      });
      setResult(data);
      clearForm();
    } catch (err) {
      setError(err?.response?.data?.message || 'Ingestion failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout title="Ingestion" subtitle="Feed content directly into the knowledge base pipeline">
      <Card title="Knowledge ingestion" subtitle="This writes to backend assistant knowledge embedding/storage.">
        <div style={{ display: 'grid', gap: 12 }}>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            placeholder="Document title"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input
              label="Source"
              value={form.source}
              onChange={(e) => setForm((s) => ({ ...s, source: e.target.value }))}
              placeholder="ui_ingestion"
            />
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
              placeholder="document"
            />
          </div>
          <Input
            label="Source URL (optional)"
            value={form.sourceUrl}
            onChange={(e) => setForm((s) => ({ ...s, sourceUrl: e.target.value }))}
            placeholder="https://..."
          />
          <Input
            label="Tags (comma-separated)"
            value={form.tags}
            onChange={(e) => setForm((s) => ({ ...s, tags: e.target.value }))}
            placeholder="product, release, faq"
          />
          <Textarea
            label="Content"
            value={form.content}
            onChange={(e) => setForm((s) => ({ ...s, content: e.target.value }))}
            placeholder="Paste the content to ingest into the knowledge base..."
          />
          <Textarea
            label="Note (optional)"
            value={form.note}
            onChange={(e) => setForm((s) => ({ ...s, note: e.target.value }))}
            placeholder="Why this is being ingested"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 12, color: error ? 'var(--danger)' : 'var(--text-muted)' }}>
              {error || (result ? `Ingested: ${result.title}` : 'Ready')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" onClick={clearForm} disabled={loading}>
                Clear
              </Button>
              <Button onClick={submit} loading={loading} disabled={!form.title.trim() || !form.content.trim()}>
                Ingest to knowledge base
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </Layout>
  );
}
