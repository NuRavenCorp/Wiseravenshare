import React, { useMemo, useState } from 'react';
import { FaShieldAlt, FaSearch, FaCheckCircle, FaExclamationTriangle, FaTimesCircle } from 'react-icons/fa';
import { truthEngine } from '../../Services/TruthDetectionEngine';

const TruthSeeker = () => {
    const [claim, setClaim] = useState('');
    const [history, setHistory] = useState([]);
    const [tick, setTick] = useState(0);

    // tick forces re-evaluation when user explicitly hits Check Claim,
    // ensuring the singleton engine is re-queried even after HMR.
    const analysis = useMemo(() => {
        if (!claim.trim()) {
            return { findings: [], score: 72, badge: truthEngine.getTruthBadge(72) };
        }

        const findings = truthEngine.analyzeContent(claim);
        const score = truthEngine.getTruthScore(claim);
        const badge = truthEngine.getTruthBadge(score);
        return { findings, score, badge };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claim, tick]);

    const runCheck = () => {
        if (!claim.trim()) {
            return;
        }

        // Compute fresh values at click-time so history never stores stale memoized scores.
        const findings = truthEngine.analyzeContent(claim);
        const score = truthEngine.getTruthScore(claim);
        const badge = truthEngine.getTruthBadge(score);

        setTick((t) => t + 1); // force useMemo re-run with fresh engine state

        const item = {
            id: Date.now(),
            claim,
            score,
            badge,
            findings,
            checkedAt: new Date().toLocaleString()
        };

        setHistory((prev) => [item, ...prev].slice(0, 8));
    };

    const iconForScore = (score) => {
        if (score >= 90) return <FaCheckCircle style={{ color: '#4caf50' }} />;
        if (score >= 60) return <FaExclamationTriangle style={{ color: '#ff9800' }} />;
        return <FaTimesCircle style={{ color: '#f44336' }} />;
    };

    const rank = analysis.score >= 90 ? 'Truth Legend' : analysis.score >= 70 ? 'Truth Guardian' : 'Truth Seeker';

    return (
        <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            overflow: 'hidden'
        }}>
            <div style={{
                background: 'linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%)',
                padding: '20px',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
            }}>
                <div>
                    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaShieldAlt /> Truth Seeker
                    </h2>
                    <p style={{ margin: '6px 0 0 0', opacity: 0.9 }}>Check claims and get instant truth guidance.</p>
                </div>
                <div style={{
                    background: 'rgba(255,255,255,0.12)',
                    borderRadius: '12px',
                    padding: '10px 14px',
                    minWidth: '160px',
                    textAlign: 'right'
                }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{analysis.score}%</div>
                    <div style={{ fontSize: '12px', opacity: 0.9 }}>{rank}</div>
                </div>
            </div>

            <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
                    <textarea
                        value={claim}
                        onChange={(e) => setClaim(e.target.value)}
                        placeholder="Enter a claim to analyze..."
                        rows={4}
                        style={{
                            width: '100%',
                            borderRadius: '10px',
                            border: '1px solid var(--border-color)',
                            background: 'rgba(255,255,255,0.03)',
                            color: 'var(--text-color)',
                            padding: '12px',
                            resize: 'vertical'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                    <button
                        onClick={runCheck}
                        style={{
                            border: 'none',
                            borderRadius: '20px',
                            padding: '10px 18px',
                            cursor: 'pointer',
                            color: 'white',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <FaSearch /> Check Claim
                    </button>
                    <span style={{ color: 'var(--highlight-color)', fontSize: '13px' }}>{analysis.badge.text}</span>
                </div>

                <div style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '14px',
                    marginBottom: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        {iconForScore(analysis.score)}
                        <strong>Live Analysis</strong>
                    </div>

                    {analysis.findings.length === 0 ? (
                        <div style={{ color: 'var(--highlight-color)', fontSize: '13px' }}>
                            No known issue detected yet. Add more context for deeper checks.
                        </div>
                    ) : (
                        analysis.findings.map((finding, index) => (
                            <div key={`${finding.claim}-${index}`} style={{
                                padding: '10px',
                                borderRadius: '8px',
                                background: 'rgba(255,255,255,0.04)',
                                marginBottom: '8px'
                            }}>
                                <div style={{ fontWeight: 'bold' }}>{finding.claim}</div>
                                <div style={{ fontSize: '13px', color: 'var(--highlight-color)' }}>
                                    Source: {finding.source || 'Truth Engine'} • Confidence: {Math.round((finding.confidence || 0) * 100)}%
                                </div>
                                {finding.correction && (
                                    <div style={{ marginTop: '6px', fontSize: '13px' }}>
                                        Correction: {finding.correction}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div>
                    <h3 style={{ marginBottom: '10px' }}>Recent Checks</h3>
                    {history.length === 0 ? (
                        <div style={{ color: 'var(--highlight-color)', fontSize: '13px' }}>No checks yet.</div>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} style={{
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                padding: '10px',
                                marginBottom: '8px'
                            }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{item.claim}</div>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                    {item.badge.text} • {item.checkedAt}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default TruthSeeker;
