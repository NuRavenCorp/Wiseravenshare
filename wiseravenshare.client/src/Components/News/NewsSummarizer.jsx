import React, { useState } from 'react';
import { FaMagic, FaCopy, FaDownload, FaSpinner } from 'react-icons/fa';
import { newsAPI } from '../../services/newsAPI';

const NewsSummarizer = ({ onSummarize }) => {
    const [url, setUrl] = useState('');
    const [text, setText] = useState('');
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [summaryLength, setSummaryLength] = useState('medium');
    const [summaryStyle, setSummaryStyle] = useState('general');

    const handleSummarize = async () => {
        if (!text.trim() && !url.trim()) {
            alert('Please enter a URL or text to summarize');
            return;
        }

        setLoading(true);
        try {
            const response = await newsAPI.summarizeNews({
                url: url || null,
                text: text || null,
                length: summaryLength,
                style: summaryStyle
            });
            setSummary(response);
            if (onSummarize) onSummarize(response.summary);
        } catch (error) {
            console.error('Error summarizing news:', error);
            alert('Failed to summarize. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(summary.summary);
        alert('Summary copied to clipboard!');
    };

    const handleDownload = () => {
        const blob = new Blob([summary.summary], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `summary_${Date.now()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <div style={{
                background: 'linear-gradient(135deg, #667eea20, #764ba220)',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <FaMagic /> AI News Summarizer
                </h3>
                <p style={{ marginBottom: '20px', color: 'var(--highlight-color)' }}>
                    Paste a URL or text to get an AI-generated summary
                </p>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Article URL
                    </label>
                    <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/article"
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)'
                        }}
                    />
                </div>

                <div style={{ textAlign: 'center', margin: '10px 0' }}>OR</div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Article Text
                    </label>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Paste article text here..."
                        rows="6"
                        style={{
                            width: '100%',
                            padding: '10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            resize: 'vertical'
                        }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                            Summary Length
                        </label>
                        <select
                            value={summaryLength}
                            onChange={(e) => setSummaryLength(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)'
                            }}
                        >
                            <option value="short">Short (1-2 sentences)</option>
                            <option value="medium">Medium (3-5 sentences)</option>
                            <option value="long">Long (1 paragraph)</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                            Summary Style
                        </label>
                        <select
                            value={summaryStyle}
                            onChange={(e) => setSummaryStyle(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)'
                            }}
                        >
                            <option value="general">General</option>
                            <option value="bullet">Bullet Points</option>
                            <option value="keypoints">Key Points Only</option>
                            <option value="detailed">Detailed</option>
                        </select>
                    </div>
                </div>

                <button
                    onClick={handleSummarize}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '30px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    {loading ? <FaSpinner className="spinning" /> : <FaMagic />}
                    {loading ? 'Summarizing...' : 'Generate Summary'}
                </button>
            </div>

            {summary && (
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginTop: '20px'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '15px'
                    }}>
                        <h3>AI Summary</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleCopy}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '15px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <FaCopy /> Copy
                            </button>
                            <button
                                onClick={handleDownload}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '15px',
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <FaDownload /> Download
                            </button>
                        </div>
                    </div>

                    <div style={{
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap'
                    }}>
                        {summaryStyle === 'bullet' ? (
                            <ul>
                                {summary.summary.split('\n').map((point, idx) => (
                                    point.trim() && <li key={idx}>{point}</li>
                                ))}
                            </ul>
                        ) : (
                            <p>{summary.summary}</p>
                        )}
                    </div>

                    {summary.keyPoints && (
                        <div style={{ marginTop: '15px' }}>
                            <strong>Key Points:</strong>
                            <ul style={{ marginTop: '8px', marginLeft: '20px' }}>
                                {summary.keyPoints.map((point, idx) => (
                                    <li key={idx}>{point}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div style={{
                        marginTop: '15px',
                        fontSize: '12px',
                        color: 'var(--highlight-color)',
                        display: 'flex',
                        gap: '15px'
                    }}>
                        <span>📊 Confidence: {summary.confidence}%</span>
                        <span>📝 Word count: {summary.wordCount}</span>
                        <span>⚡ Processing time: {summary.processingTime}s</span>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                .spinning {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};

export default NewsSummarizer;
