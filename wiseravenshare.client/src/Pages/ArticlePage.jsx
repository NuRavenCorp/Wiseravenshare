import React from 'react';

const humanTime = (iso) => {
    const date = new Date(iso);
    const diff = Math.max(1, Math.floor((Date.now() - date.getTime()) / (1000 * 60)));
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
};

const ArticlePage = ({ article, onBack }) => {
    if (!article) {
        return (
            <div style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '18px'
            }}>
                <h3>No article selected</h3>
                <button onClick={onBack} style={{
                    marginTop: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)',
                    color: 'var(--text-color)',
                    borderRadius: '999px',
                    padding: '8px 14px',
                    cursor: 'pointer'
                }}>
                    Back
                </button>
            </div>
        );
    }

    const articleParagraphs = String(article.content || article.summary || '')
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);

    return (
        <article style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px'
        }}>
            <button onClick={onBack} style={{
                marginBottom: '14px',
                border: '1px solid var(--border-color)',
                background: 'transparent',
                color: 'var(--text-color)',
                borderRadius: '999px',
                padding: '8px 14px',
                cursor: 'pointer'
            }}>
                Back to News
            </button>

            <h1 style={{ marginTop: 0 }}>{article.title}</h1>
            <div style={{ fontSize: '13px', color: 'var(--highlight-color)', marginBottom: '12px' }}>
                {article.source} • {humanTime(article.publishedAt)} • {article.category}
            </div>

            {article.externalUrl && (
                <a
                    href={article.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{
                        display: 'inline-block',
                        marginBottom: '12px',
                        color: 'var(--highlight-color)',
                        fontSize: '13px',
                        fontWeight: 600,
                        textDecoration: 'none'
                    }}
                >
                    Read original source
                </a>
            )}

            <div style={{ display: 'grid', gap: '10px', marginBottom: '8px' }}>
                {articleParagraphs.map((paragraph, index) => (
                    <p key={`paragraph-${index}`} style={{ lineHeight: 1.7, margin: 0 }}>
                        {paragraph}
                    </p>
                ))}
            </div>

            {article.summary && article.content && (
                <div style={{
                    marginTop: '14px',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '12px',
                    color: 'var(--light-color)',
                    fontSize: '14px'
                }}>
                    <strong>Summary:</strong> {article.summary}
                </div>
            )}
        </article>
    );
};

export default ArticlePage;
