import React, { useMemo, useRef, useState } from 'react';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { Input, Textarea } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { FiPlay, FiSquare, FiTrash2, FiActivity } from 'react-icons/fi';

function parseSseEvent(eventText) {
  const lines = eventText.split('\n');
  let data = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) data += line.slice(6);
  }
  return data;
}

export default function StreamStudioPage() {
  const baseUrl = useMemo(
    () => (import.meta.env.VITE_INFERENCE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
    []
  );
  const abortRef = useRef(null);

  const [apiKey, setApiKey] = useState(localStorage.getItem('nr_api_key') || '');
  const [prompt, setPrompt] = useState('Artificial intelligence will transform the world by');
  const [maxNewTokens, setMaxNewTokens] = useState(120);
  const [temperature, setTemperature] = useState(0.7);
  const [topK, setTopK] = useState(50);
  const [topP, setTopP] = useState(0.9);

  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [history, setHistory] = useState([]);

  const persistApiKey = (value) => {
    setApiKey(value);
    if (value.trim()) localStorage.setItem('nr_api_key', value.trim());
    else localStorage.removeItem('nr_api_key');
  };

  const stopStream = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
  };

  const startStream = async () => {
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt || streaming) return;

    setError('');
    setCurrentText('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const request = {
      prompt: cleanPrompt,
      max_new_tokens: Number(maxNewTokens),
      temperature: Number(temperature),
      top_k: Number(topK),
      top_p: Number(topP),
    };

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) headers['X-API-Key'] = apiKey.trim();

      const response = await fetch(`${baseUrl}/stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let pending = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });

        let cut = pending.indexOf('\n\n');
        while (cut !== -1) {
          const eventText = pending.slice(0, cut);
          pending = pending.slice(cut + 2);
          const piece = parseSseEvent(eventText);
          if (piece) {
            fullText += piece;
            setCurrentText(fullText);
          }
          cut = pending.indexOf('\n\n');
        }
      }

      if (pending) {
        const piece = parseSseEvent(pending);
        if (piece) {
          fullText += piece;
          setCurrentText(fullText);
        }
      }

      setHistory((prev) => [
        {
          id: Date.now().toString(),
          prompt: cleanPrompt,
          output: fullText,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Stream request failed.');
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  return (
    <Layout title="Stream Studio" subtitle="Secure SSE inference playground">
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 20 }}>
        <Card title="Request" subtitle="Prompt, sampling, and auth key">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input
              label="X-API-Key"
              type="password"
              placeholder="Set INFERENCE_API_KEY and paste it here"
              value={apiKey}
              onChange={(e) => persistApiKey(e.target.value)}
            />
            <Textarea
              label="Prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              style={{ minHeight: 130 }}
            />
            <Input label="Max new tokens" type="number" min={1} max={1024} value={maxNewTokens} onChange={(e) => setMaxNewTokens(e.target.value)} />
            <Input label="Temperature" type="number" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            <Input label="Top-k" type="number" min={0} value={topK} onChange={(e) => setTopK(e.target.value)} />
            <Input label="Top-p" type="number" min={0} max={1} step={0.01} value={topP} onChange={(e) => setTopP(e.target.value)} />

            <div style={{ display: 'flex', gap: 10 }}>
              <Button icon={<FiPlay />} onClick={startStream} disabled={streaming || !prompt.trim()}>
                Stream
              </Button>
              <Button variant="secondary" icon={<FiSquare />} onClick={stopStream} disabled={!streaming}>
                Stop
              </Button>
              <Button variant="ghost" icon={<FiTrash2 />} onClick={() => { setCurrentText(''); setHistory([]); setError(''); }}>
                Clear
              </Button>
            </div>
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card
            title="Live output"
            subtitle={streaming ? 'Streaming tokens...' : 'Idle'}
            action={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: streaming ? 'var(--success)' : 'var(--text-muted)' }}>
                <FiActivity size={13} /> {streaming ? 'live' : 'offline'}
              </span>
            }
          >
            {error && (
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: 12 }}>
                {error}
              </div>
            )}
            <div className="scroll-y mono" style={{ minHeight: 240, maxHeight: 340, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-3)' }}>
              {currentText || (streaming ? 'Connecting...' : 'No active output yet.')}
            </div>
          </Card>

          <Card title="History" subtitle="Recent prompt/response pairs">
            <div className="scroll-y" style={{ maxHeight: 320, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {history.length === 0 && (
                <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No completed responses yet.</p>
              )}
              {history.map((item) => (
                <div key={item.id} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-2)', marginBottom: 6 }}>Prompt</div>
                  <div style={{ fontSize: 12, marginBottom: 10, whiteSpace: 'pre-wrap' }}>{item.prompt}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>Response</div>
                  <div className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{item.output}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
