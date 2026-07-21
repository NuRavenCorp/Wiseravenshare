import React, { useState } from 'react';
import { FaMagic, FaNewspaper, FaTags, FaImage, FaHashtag, FaSpinner } from 'react-icons/fa';
import { newsAPI } from '../../services/newsAPI';

const AINewsGenerator = () => {
    const [topic, setTopic] = useState('');
    const [keywords, setKeywords] = useState('');
    const [tone, setTone] = useState('neutral');
    const [length, setLength] = useState('medium');
    const [includeImages, setIncludeImages] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatedNews, setGeneratedNews] = useState(null);

    const handleGenerate = async () => {
        if (!topic.trim()) {
            alert('Please enter a topic');
            return;
        }

        setGenerating(true);
        try {
            const response = await newsAPI.generateNewsArticle({
                topic: topic,
                keywords: keywords.split(',').map(k => k.trim()),
                tone: tone,
                length: length,
                includeImages: includeImages
            });
            setGeneratedNews(response);
        } catch (error) {
            console.error('Error generating news:', error);
            alert('Failed to generate news. Please try again.');
        } finally {
            setGenerating(false);
        }
    };

    const handlePublish = async () => {
        try {
            await newsAPI.publishGeneratedArticle(generatedNews);
            alert('Article published successfully!');
        } catch (error) {
            console.error('Error publishing:', error);
            alert('Failed to publish article');
        }
    };

    const tones = [
        { id: 'neutral', label: 'Neutral', icon: '😐' },
        { id: 'positive', label: 'Positive', icon: '😊' },
        { id: 'negative', label: 'Negative', icon: '😠' },
        { id: 'analytical', label: 'Analytical', icon: '📊' },
        { id: 'opinion', label: 'Opinion', icon: '💭' }
    ];

    const lengths = [
        { id: 'short', label: 'Short (300 words)', icon: '📄' },
        { id: 'medium', label: 'Medium (600 words)', icon: '📑' },
        { id: 'long', label: 'Long (1000 words)', icon: '📚' }
    ];

    return (
        <div>
            <div style={{
                background: 'linear-gradient(135deg, #667eea20, #764ba220)',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                    <FaMagic /> AI News Article Generator
                </h3>
                <p style={{ marginBottom: '20px', color: 'var(--highlight-color)' }}>
                    Generate news articles on any topic using AI
                </p>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Topic *
                    </label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="e.g., Artificial Intelligence in Healthcare"
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

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Keywords (comma-separated)
                    </label>
                    <input
                        type="text"
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder="AI, machine learning, healthcare, diagnosis"
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

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Tone
                    </label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {tones.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTone(t.id)}
                                style={{
                                    padding: '8px 15px',
                                    borderRadius: '20px',
                                    border: `1px solid ${tone === t.id ? '#667eea' : 'var(--border-color)'}`,
                                    background: tone === t.id ? '#667eea20' : 'transparent',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--light-color)' }}>
                        Length
                    </label>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {lengths.map(l => (
                            <button
                                key={l.id}
                                onClick={() => setLength(l.id)}
                                style={{
                                    padding: '8px 15px',
                                    borderRadius: '20px',
                                    border: `1px solid ${length === l.id ? '#667eea' : 'var(--border-color)'}`,
                                    background: length === l.id ? '#667eea20' : 'transparent',
                                    color: 'var(--text-color)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                {l.icon} {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={includeImages}
                            onChange={(e) => setIncludeImages(e.target.checked)}
                        />
                        Include AI-generated images
                    </label>
                </div>

                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '30px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #667eea, #764ba2)',
                        color: 'white',
                        fontWeight: 'bold',
                        cursor: generating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    {generating ? <FaSpinner className="spinning" /> : <FaMagic />}
                    {generating ? 'Generating...' : 'Generate Article'}
                </button>
            </div>

            {generatedNews && (
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginTop: '20px'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'start',
                        marginBottom: '20px'
                    }}>
                        <h2 style={{ fontSize: '24px' }}>{generatedNews.title}</h2>
                        <button
                            onClick={handlePublish}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                                color: 'white',
                                cursor: 'pointer'
                            }}
                        >
                            Publish Article
                        </button>
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: '15px',
                        marginBottom: '20px',
                        fontSize: '14px',
                        color: 'var(--highlight-color)'
                    }}>
                        <span>📅 {new Date().toLocaleDateString()}</span>
                        <span>📊 Tone: {tone}</span>
                        <span>📝 Reading time: {generatedNews.readingTime} min</span>
                    </div>

                    {generatedNews.imageUrl && (
                        <img
                            src={generatedNews.imageUrl}
                            alt={generatedNews.title}
                            style={{
                                width: '100%',
                                maxHeight: '400px',
                                objectFit: 'cover',
                                borderRadius: '8px',
                                marginBottom: '20px'
                            }}
                        />
                    )}

                    <div style={{ lineHeight: '1.8' }}>
                        {generatedNews.content.split('\n\n').map((paragraph, idx) => (
                            <p key={idx} style={{ marginBottom: '15px' }}>
                                {paragraph}
                            </p>
                        ))}
                    </div>

                    {generatedNews.tags && (
                        <div style={{
                            marginTop: '20px',
                            paddingTop: '15px',
                            borderTop: '1px solid var(--border-color)',
                            display: 'flex',
                            gap: '8px',
                            flexWrap: 'wrap'
                        }}>
                            {generatedNews.tags.map(tag => (
                                <span
                                    key={tag}
                                    style={{
                                        background: 'rgba(102, 126, 234, 0.2)',
                                        padding: '4px 10px',
                                        borderRadius: '15px',
                                        fontSize: '12px'
                                    }}
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
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

export default AINewsGenerator;