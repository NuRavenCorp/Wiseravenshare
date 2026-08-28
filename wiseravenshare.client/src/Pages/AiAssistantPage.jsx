import React, { useState, useRef, useEffect } from 'react';
import aiAssistantService from '../Services/aiAssistantService';

const SUGGESTIONS = [
    'How do I cross-post to all platforms?',
    'Why did my TikTok share fail?',
    'How do I connect my Instagram account?',
    'What is the Truth Engine?'
];

const AiAssistantPage = ({ addTruthAlert }) => {
    const [messages, setMessages] = useState([
        {
            role: 'assistant',
            content: "Hi! I'm the Wiseravenshare Assistant. Ask me anything about posting, cross-sharing, or using the platform."
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('');
    const scrollRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        aiAssistantService.getModels()
            .then((list) => {
                if (cancelled) return;
                setModels(list);
                if (list.length > 0) {
                    setSelectedModel((prev) => (prev && list.includes(prev) ? prev : list[0]));
                }
            })
            .catch(() => {
                if (!cancelled && addTruthAlert) {
                    addTruthAlert('error', 'Could not load AI models.', null);
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const send = async (text) => {
        const message = String(text || '').trim();
        if (!message || loading) return;

        const history = messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-12)
            .map((m) => ({ role: m.role, content: m.content }));

        setMessages((prev) => [...prev, { role: 'user', content: message }]);
        setInput('');
        setLoading(true);
        setStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            let acc = '';
            setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);
            await aiAssistantService.chatStream(
                message,
                history,
                selectedModel || null,
                (fragment) => {
                    acc += fragment;
                    setMessages((prev) => {
                        const next = [...prev];
                        next[next.length - 1] = { role: 'assistant', content: acc };
                        return next;
                    });
                },
                controller.signal
            );
            if (!acc.trim()) {
                setMessages((prev) => {
                    const next = [...prev];
                    next[next.length - 1] = {
                        role: 'assistant',
                        content: 'Sorry, the assistant returned an empty reply. Please try again.'
                    };
                    return next;
                });
            }
        } catch (err) {
            const aborted = err?.name === 'AbortError';
            setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant' && !last.content) {
                    next[next.length - 1] = {
                        role: 'assistant',
                        content: aborted
                            ? '(stopped)'
                            : err?.message || 'Sorry, the assistant is unavailable right now.'
                    };
                }
                return next;
            });
            if (!aborted && addTruthAlert) addTruthAlert('error', 'AI assistant request failed.', null);
        } finally {
            setLoading(false);
            setStreaming(false);
            abortRef.current = null;
        }
    };

    const stop = () => abortRef.current?.abort();

    const clearConversation = () => {
        if (loading) return;
        setMessages([
            {
                role: 'assistant',
                content: "Hi! I'm the Wiseravenshare Assistant. Ask me anything about posting, cross-sharing, or using the platform."
            }
        ]);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send(input);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', minHeight: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '20px' }}>🦉 Raven Assistant</h2>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        Your in-app AI helper for platform questions and support.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {models.length > 0 && (
                        <select
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            style={{
                                background: 'rgba(17,24,39,0.7)',
                                color: 'var(--text-color)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                fontSize: '12px'
                            }}
                            aria-label="AI model"
                        >
                            {models.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    )}
                    {streaming && (
                        <button
                            type="button"
                            onClick={stop}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: 'rgba(220,38,38,0.15)',
                                color: '#f87171',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            ■ Stop
                        </button>
                    )}
                    {!streaming && messages.length > 1 && (
                        <button
                            type="button"
                            onClick={clearConversation}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: 'rgba(17,24,39,0.7)',
                                color: 'var(--text-color)',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            ⟲ New chat
                        </button>
                    )}
                </div>
            </div>

            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '16px',
                    background: 'rgba(17,24,39,0.55)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}
            >
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '78%',
                            padding: '10px 14px',
                            borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                            background: msg.role === 'user' ? 'var(--highlight-color)' : 'rgba(255,255,255,0.08)',
                            color: msg.role === 'user' ? '#10151f' : 'var(--text-color)',
                            whiteSpace: 'pre-wrap',
                            lineHeight: 1.5,
                            fontSize: '14px'
                        }}
                    >
                        {msg.content}
                    </div>
                ))}
                {streaming && (
                    <div style={{ alignSelf: 'flex-start', fontSize: '13px', color: 'var(--light-color)' }}>
                        <span style={{ display: 'inline-block', animation: 'wr-blink 1s steps(1) infinite' }}>▍</span>
                    </div>
                )}
            </div>
            <style>{'@keyframes wr-blink { 50% { opacity: 0; } }'}</style>

            {messages.length <= 1 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {SUGGESTIONS.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => send(s)}
                            style={{
                                border: '1px solid var(--border-color)',
                                background: 'rgba(17,24,39,0.7)',
                                color: 'var(--text-color)',
                                borderRadius: '999px',
                                padding: '6px 12px',
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask the Raven Assistant…"
                    rows={2}
                    disabled={loading}
                    style={{
                        flex: 1,
                        resize: 'none',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        padding: '10px 12px',
                        background: 'rgba(17,24,39,0.7)',
                        color: 'var(--text-color)',
                        fontSize: '14px',
                        fontFamily: 'inherit'
                    }}
                />
                <button
                    type="button"
                    onClick={() => send(input)}
                    disabled={loading || !input.trim()}
                    style={{
                        border: 'none',
                        borderRadius: '12px',
                        padding: '0 22px',
                        background: 'var(--highlight-color)',
                        color: '#10151f',
                        fontWeight: 700,
                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                        opacity: loading || !input.trim() ? 0.5 : 1
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default AiAssistantPage;
