import React, { useState } from 'react';
import {
    FaSearch, FaMicrophone, FaFileAlt, FaLink, FaCheckCircle,
    FaTimesCircle, FaExclamationTriangle, FaSpinner, FaQuoteLeft,
    FaShieldAlt, FaDatabase, FaChartLine, FaShare, FaSave
} from 'react-icons/fa';
import { truthEngine } from '../../services/truthEngine';
import { newsAPI } from '../../services/newsAPI';

const ClaimChecker = () => {
    const [claim, setClaim] = useState('');
    const [inputMethod, setInputMethod] = useState('text');
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState(null);
    const [sources, setSources] = useState([]);
    const [confidence, setConfidence] = useState(0);
    const [relatedClaims, setRelatedClaims] = useState([]);

    const handleCheckClaim = async () => {
        if (!claim.trim()) return;

        setChecking(true);
        try {
            // Primary truth check
            const truthResult = await truthEngine.analyzeContent(claim);

            // Get multiple source verification
            const sourcesResult = await truthEngine.verifyWithSources(claim);
            setSources(sourcesResult.sources);
            setConfidence(sourcesResult.confidence);

            // Find related claims
            const related = await truthEngine.findRelatedClaims(claim);
            setRelatedClaims(related);

            // Calculate overall truth score
            const overallScore = truthEngine.calculateTruthScore(truthResult, sourcesResult);

            setResult({
                ...truthResult,
                overallScore,
                isTrue: truthResult.isTrue,
                correction: truthResult.correction,
                explanation: truthResult.explanation
            });
        } catch (error) {
            console.error('Error checking claim:', error);
        } finally {
            setChecking(false);
        }
    };

    const getResultColor = () => {
        if (!result) return 'var(--border-color)';
        if (result.overallScore >= 80) return '#4caf50';
        if (result.overallScore >= 60) return '#ff9800';
        return '#f44336';
    };

    const getResultIcon = () => {
        if (!result) return null;
        if (result.overallScore >= 80) return <FaCheckCircle style={{ color: '#4caf50', fontSize: '48px' }} />;
        if (result.overallScore >= 60) return <FaExclamationTriangle style={{ color: '#ff9800', fontSize: '48px' }} />;
        return <FaTimesCircle style={{ color: '#f44336', fontSize: '48px' }} />;
    };

    const getResultText = () => {
        if (!result) return '';
        if (result.overallScore >= 80) return 'Verified - This claim is TRUE';
        if (result.overallScore >= 60) return 'Uncertain - This claim requires more context';
        return 'Debunked - This claim is FALSE';
    };

    const handleVoiceInput = () => {
        if ('webkitSpeechRecognition' in window) {
            const recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setClaim(transcript);
            };

            recognition.start();
        } else {
            alert('Voice recognition not supported in this browser');
        }
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                setClaim(e.target.result);
            };
            reader.readAsText(file);
        }
    };

    return (
        <div>
            {/* Input Method Selector */}
            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '10px'
            }}>
                <button
                    onClick={() => setInputMethod('text')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        background: inputMethod === 'text' ? 'var(--highlight-color)' : 'transparent',
                        color: inputMethod === 'text' ? 'white' : 'var(--text-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FaFileAlt /> Text
                </button>
                <button
                    onClick={() => setInputMethod('voice')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        background: inputMethod === 'voice' ? 'var(--highlight-color)' : 'transparent',
                        color: inputMethod === 'voice' ? 'white' : 'var(--text-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FaMicrophone /> Voice
                </button>
                <button
                    onClick={() => setInputMethod('url')}
                    style={{
                        padding: '8px 16px',
                        borderRadius: '20px',
                        border: 'none',
                        background: inputMethod === 'url' ? 'var(--highlight-color)' : 'transparent',
                        color: inputMethod === 'url' ? 'white' : 'var(--text-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <FaLink /> URL
                </button>
            </div>

            {/* Input Area */}
            <div style={{ marginBottom: '20px' }}>
                {inputMethod === 'text' && (
                    <textarea
                        value={claim}
                        onChange={(e) => setClaim(e.target.value)}
                        placeholder="Enter a claim to verify... (e.g., 'The Earth is flat')"
                        rows="4"
                        style={{
                            width: '100%',
                            padding: '15px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--card-bg)',
                            color: 'var(--text-color)',
                            fontSize: '14px',
                            resize: 'vertical'
                        }}
                    />
                )}

                {inputMethod === 'voice' && (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px',
                        border: '2px dashed var(--border-color)',
                        borderRadius: '12px',
                        cursor: 'pointer'
                    }}
                        onClick={handleVoiceInput}>
                        <FaMicrophone style={{ fontSize: '48px', color: 'var(--highlight-color)', marginBottom: '10px' }} />
                        <p>Click to speak your claim</p>
                        <p style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                            Supported in Chrome, Edge, and Safari
                        </p>
                    </div>
                )}

                {inputMethod === 'url' && (
                    <div>
                        <input
                            type="url"
                            value={claim}
                            onChange={(e) => setClaim(e.target.value)}
                            placeholder="Enter URL to extract and verify claims..."
                            style={{
                                width: '100%',
                                padding: '12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <div style={{
                            marginTop: '10px',
                            padding: '10px',
                            background: 'rgba(102, 126, 234, 0.1)',
                            borderRadius: '8px',
                            fontSize: '12px'
                        }}>
                            <FaShieldAlt /> We'll extract all claims from the URL and verify each one
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                    <button
                        onClick={handleCheckClaim}
                        disabled={checking || !claim.trim()}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '30px',
                            border: 'none',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: checking || !claim.trim() ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {checking ? <FaSpinner className="spinning" /> : <FaSearch />}
                        {checking ? 'Verifying...' : 'Verify Claim'}
                    </button>

                    {inputMethod === 'text' && claim && (
                        <button
                            onClick={() => setClaim('')}
                            style={{
                                padding: '12px 24px',
                                borderRadius: '30px',
                                border: '1px solid var(--border-color)',
                                background: 'transparent',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Results */}
            {result && (
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '20px',
                    marginTop: '20px',
                    animation: 'fadeIn 0.5s ease-out'
                }}>
                    {/* Result Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        marginBottom: '20px',
                        flexWrap: 'wrap'
                    }}>
                        {getResultIcon()}
                        <div style={{ flex: 1 }}>
                            <h3 style={{ fontSize: '20px', marginBottom: '5px' }}>
                                {getResultText()}
                            </h3>
                            <div style={{
                                height: '8px',
                                background: 'rgba(255,255,255,0.1)',
                                borderRadius: '4px',
                                overflow: 'hidden',
                                marginTop: '10px'
                            }}>
                                <div style={{
                                    width: `${result.overallScore}%`,
                                    height: '100%',
                                    background: `linear-gradient(90deg, ${getResultColor()}, ${getResultColor()}80)`,
                                    transition: 'width 0.5s'
                                }} />
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginTop: '5px',
                                fontSize: '12px',
                                color: 'var(--highlight-color)'
                            }}>
                                <span>Confidence Score</span>
                                <span>{result.overallScore}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Claim Display */}
                    <div style={{
                        background: 'rgba(102, 126, 234, 0.1)',
                        padding: '15px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        position: 'relative'
                    }}>
                        <FaQuoteLeft style={{
                            position: 'absolute',
                            top: '10px',
                            left: '10px',
                            opacity: 0.3,
                            fontSize: '20px'
                        }} />
                        <p style={{
                            paddingLeft: '30px',
                            fontStyle: 'italic',
                            margin: 0
                        }}>
                            {claim}
                        </p>
                    </div>

                    {/* Correction if needed */}
                    {result.correction && (
                        <div style={{
                            background: '#4caf5020',
                            padding: '15px',
                            borderRadius: '8px',
                            marginBottom: '20px',
                            borderLeft: '3px solid #4caf50'
                        }}>
                            <strong style={{ display: 'block', marginBottom: '8px' }}>
                                <FaCheckCircle /> Correction:
                            </strong>
                            <p style={{ margin: 0 }}>{result.correction}</p>
                        </div>
                    )}

                    {/* Explanation */}
                    <div style={{ marginBottom: '20px' }}>
                        <strong>Explanation:</strong>
                        <p style={{ marginTop: '8px', lineHeight: '1.6' }}>
                            {result.explanation || truthEngine.generateExplanation(result)}
                        </p>
                    </div>

                    {/* Sources */}
                    {sources.length > 0 && (
                        <div style={{ marginBottom: '20px' }}>
                            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <FaDatabase /> Verified Sources ({sources.length})
                            </strong>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {sources.map((source, idx) => (
                                    <div key={idx} style={{
                                        padding: '10px',
                                        background: 'rgba(255,255,255,0.05)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '10px'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{source.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                                {source.type} • Confidence: {source.confidence}%
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                background: source.verdict === 'supports' ? '#4caf5020' : '#f4433620',
                                                color: source.verdict === 'supports' ? '#4caf50' : '#f44336',
                                                fontSize: '12px'
                                            }}>
                                                {source.verdict === 'supports' ? 'Supports' : 'Contradicts'}
                                            </span>
                                            <a href={source.url} target="_blank" rel="noopener noreferrer"
                                                style={{ color: 'var(--highlight-color)', textDecoration: 'none' }}>
                                                View Source →
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Related Claims */}
                    {relatedClaims.length > 0 && (
                        <div>
                            <strong style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                <FaChartLine /> Related Claims
                            </strong>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {relatedClaims.map((claim, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setClaim(claim.text)}
                                        style={{
                                            padding: '8px 15px',
                                            borderRadius: '20px',
                                            border: '1px solid var(--border-color)',
                                            background: 'transparent',
                                            color: 'var(--text-color)',
                                            cursor: 'pointer',
                                            fontSize: '13px'
                                        }}
                                    >
                                        {claim.text}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{
                        display: 'flex',
                        gap: '15px',
                        marginTop: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid var(--border-color)'
                    }}>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--highlight-color)',
                            cursor: 'pointer'
                        }}>
                            <FaThumbsUp /> Helpful
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--highlight-color)',
                            cursor: 'pointer'
                        }}>
                            <FaShare /> Share
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--highlight-color)',
                            cursor: 'pointer'
                        }}>
                            <FaSave /> Save
                        </button>
                        <button style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: 'none',
                            border: 'none',
                            color: '#f44336',
                            cursor: 'pointer',
                            marginLeft: 'auto'
                        }}>
                            <FaFlag /> Report Issue
                        </button>
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

export default ClaimChecker;