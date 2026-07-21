import React, { useState } from 'react';
import { FaLink, FaSearch, FaShieldAlt, FaStar, FaMedal, FaCheckCircle, FaTimesCircle, FaGlobe, FaNewspaper, FaTwitter, FaYoutube } from 'react-icons/fa';
import { truthEngine } from '../../services/truthEngine';

const SourceVerifier = () => {
    const [url, setUrl] = useState('');
    const [verifying, setVerifying] = useState(false);
    const [result, setResult] = useState(null);
    const [sourceHistory, setSourceHistory] = useState([]);

    const handleVerifySource = async () => {
        if (!url.trim()) return;

        setVerifying(true);
        try {
            const verification = await truthEngine.verifySource(url);
            setResult(verification);

            // Add to history
            setSourceHistory(prev => [{
                url,
                timestamp: new Date(),
                ...verification
            }, ...prev].slice(0, 10));
        } catch (error) {
            console.error('Error verifying source:', error);
        } finally {
            setVerifying(false);
        }
    };

    const getReliabilityScore = (score) => {
        if (score >= 80) return { label: 'Highly Reliable', color: '#4caf50', icon: '✅' };
        if (score >= 60) return { label: 'Moderately Reliable', color: '#ff9800', icon: '⚠️' };
        if (score >= 40) return { label: 'Low Reliability', color: '#f44336', icon: '❌' };
        return { label: 'Unreliable / Suspicious', color: '#9e9e9e', icon: '🚫' };
    };

    const getDomain = (url) => {
        try {
            const domain = new URL(url).hostname;
            return domain.replace('www.', '');
        } catch {
            return url;
        }
    };

    return (
        <div>
            <div style={{
                background: 'linear-gradient(135deg, rgba(79, 116, 214, 0.2), rgba(163, 58, 93, 0.2))',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                <h3 style={{ marginBottom: '15px' }}>Source Verification Tool</h3>
                <p style={{ marginBottom: '20px', color: 'var(--highlight-color)' }}>
                    Verify the credibility and reliability of any news source or website
                </p>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <FaLink style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--highlight-color)'
                        }} />
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="Enter source URL to verify..."
                            style={{
                                width: '100%',
                                padding: '12px 12px 12px 40px',
                                borderRadius: '25px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleVerifySource}
                        disabled={verifying || !url.trim()}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '25px',
                            border: 'none',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: 'white',
                            cursor: verifying || !url.trim() ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <FaSearch /> Verify
                    </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                    We check against our database of 10,000+ verified sources, including major news outlets, fact-checking organizations, and academic databases
                </div>
            </div>

            {result && (
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginBottom: '20px',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    {/* Source Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', marginBottom: '5px' }}>
                                {result.name || getDomain(url)}
                            </h3>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                {result.domain}
                            </div>
                        </div>
                        <div style={{
                            textAlign: 'center',
                            padding: '10px',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '50%',
                            width: '80px',
                            height: '80px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <div style={{ fontSize: '24px', fontWeight: 'bold', color: getReliabilityScore(result.reliabilityScore).color }}>
                                {result.reliabilityScore}%
                            </div>
                            <div style={{ fontSize: '10px', marginTop: '5px' }}>Reliability</div>
                        </div>
                    </div>

                    {/* Reliability Badge */}
                    <div style={{
                        background: `${getReliabilityScore(result.reliabilityScore).color}20`,
                        padding: '10px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <span style={{ fontSize: '24px' }}>{getReliabilityScore(result.reliabilityScore).icon}</span>
                        <div>
                            <strong>{getReliabilityScore(result.reliabilityScore).label}</strong>
                            <div style={{ fontSize: '12px', marginTop: '4px' }}>
                                {result.summary}
                            </div>
                        </div>
                    </div>

                    {/* Detailed Metrics */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '15px',
                        marginBottom: '20px'
                    }}>
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                Factual Reporting
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                {result.factualReporting || 'Mixed'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                Bias Rating
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                {result.biasRating || 'Center'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                Fact Checks
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                {result.factChecks || 0}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)', marginBottom: '5px' }}>
                                Trust Score
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                {result.trustScore || 0}/100
                            </div>
                        </div>
                    </div>

                    {/* Verdicts */}
                    <div style={{ marginBottom: '20px' }}>
                        <strong style={{ marginBottom: '10px', display: 'block' }}>Recent Verdicts:</strong>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {result.recentVerdicts?.map((verdict, idx) => (
                                <div key={idx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '8px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '6px'
                                }}>
                                    {verdict.isTrue ?
                                        <FaCheckCircle style={{ color: '#4caf50' }} /> :
                                        <FaTimesCircle style={{ color: '#f44336' }} />
                                    }
                                    <span style={{ flex: 1 }}>{verdict.claim}</span>
                                    <span style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                        {verdict.date}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{
                        display: 'flex',
                        gap: '15px',
                        paddingTop: '15px',
                        borderTop: '1px solid var(--border-color)'
                    }}>
                        <button style={{
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}>
                            <FaStar /> Save to Trusted
                        </button>
                        <button style={{
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: '1px solid var(--border-color)',
                            background: 'transparent',
                            color: 'var(--text-color)',
                            cursor: 'pointer'
                        }}>
                            <FaFlag /> Report Issue
                        </button>
                    </div>
                </div>
            )}

            {/* Verification History */}
            {sourceHistory.length > 0 && (
                <div>
                    <h3 style={{ marginBottom: '15px' }}>Recent Verifications</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {sourceHistory.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '10px',
                                    background: 'rgba(255,255,255,0.05)',
                                    borderRadius: '8px',
                                    cursor: 'pointer'
                                }}
                                onClick={() => setUrl(item.url)}
                            >
                                <div>
                                    <div style={{ fontSize: '14px' }}>{item.name || getDomain(item.url)}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>
                                        {new Date(item.timestamp).toLocaleString()}
                                    </div>
                                </div>
                                <div style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: `${getReliabilityScore(item.reliabilityScore).color}20`,
                                    color: getReliabilityScore(item.reliabilityScore).color,
                                    fontSize: '12px'
                                }}>
                                    {item.reliabilityScore}%
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
};

export default SourceVerifier;