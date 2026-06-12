import React, { useState, useEffect, useRef } from 'react';
import { FaGlobe, FaTwitter, FaNewspaper, FaChartLine, FaBell, FaFilter, FaSearch, FaRobot } from 'react-icons/fa';
import { truthEngine } from '../../services/truthEngine';
import { wsService } from '../../services/websocket';

const RealTimeTruthMonitor = () => {
    const [monitoring, setMonitoring] = useState(false);
    const [alerts, setAlerts] = useState([]);
    const [stats, setStats] = useState({
        claimsChecked: 0,
        falseClaims: 0,
        trueClaims: 0,
        disputedClaims: 0
    });
    const [trendingMisinfo, setTrendingMisinfo] = useState([]);
    const [selectedSource, setSelectedSource] = useState('all');
    const containerRef = useRef(null);

    useEffect(() => {
        if (monitoring) {
            startMonitoring();
        } else {
            stopMonitoring();
        }
        return () => stopMonitoring();
    }, [monitoring, selectedSource]);

    const startMonitoring = () => {
        // Connect to WebSocket for real-time updates
        wsService.connect(process.env.REACT_APP_WS_URL);

        wsService.on('truth_alert', handleTruthAlert);
        wsService.on('misinfo_trend', handleMisinfoTrend);

        // Start simulated monitoring (for demo)
        const interval = setInterval(() => {
            generateSimulatedAlert();
        }, 30000);

        window.monitorInterval = interval;
    };

    const stopMonitoring = () => {
        if (window.monitorInterval) {
            clearInterval(window.monitorInterval);
        }
        wsService.off('truth_alert', handleTruthAlert);
        wsService.off('misinfo_trend', handleMisinfoTrend);
    };

    const handleTruthAlert = (alert) => {
        setAlerts(prev => [{
            ...alert,
            id: Date.now(),
            timestamp: new Date()
        }, ...prev].slice(0, 50));

        setStats(prev => ({
            ...prev,
            claimsChecked: prev.claimsChecked + 1,
            falseClaims: alert.isFalse ? prev.falseClaims + 1 : prev.falseClaims,
            trueClaims: alert.isTrue ? prev.trueClaims + 1 : prev.trueClaims,
            disputedClaims: alert.isDisputed ? prev.disputedClaims + 1 : prev.disputedClaims
        }));

        // Show browser notification
        if (Notification.permission === 'granted') {
            new Notification('Truth Alert', {
                body: `${alert.source}: ${alert.claim.substring(0, 100)}...`,
                icon: '/favicon.ico'
            });
        }
    };

    const handleMisinfoTrend = (trend) => {
        setTrendingMisinfo(prev => [trend, ...prev].slice(0, 10));
    };

    const generateSimulatedAlert = () => {
        const sampleAlerts = [
            { claim: 'COVID-19 vaccines contain microchips', isFalse: true, source: 'Twitter', confidence: 98 },
            { claim: 'The Earth is flat', isFalse: true, source: 'Facebook', confidence: 99 },
            { claim: 'New scientific breakthrough in quantum computing', isTrue: true, source: 'Science Daily', confidence: 85 },
            { claim: '5G towers cause radiation sickness', isFalse: true, source: 'YouTube', confidence: 97 },
            { claim: 'Renewable energy now cheaper than fossil fuels', isTrue: true, source: 'Reuters', confidence: 92 }
        ];

        const randomAlert = sampleAlerts[Math.floor(Math.random() * sampleAlerts.length)];
        handleTruthAlert(randomAlert);
    };

    const getAlertColor = (alert) => {
        if (alert.isFalse) return '#f44336';
        if (alert.isTrue) return '#4caf50';
        return '#ff9800';
    };

    const getAlertIcon = (alert) => {
        if (alert.isFalse) return '❌';
        if (alert.isTrue) return '✅';
        return '⚠️';
    };

    return (
        <div>
            {/* Control Panel */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(79, 116, 214, 0.2), rgba(163, 58, 93, 0.2))',
                padding: '20px',
                borderRadius: '12px',
                marginBottom: '20px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                        <h3 style={{ marginBottom: '5px' }}>
                            <FaGlobe /> Real-Time Truth Monitor
                        </h3>
                        <p style={{ fontSize: '13px', color: 'var(--highlight-color)' }}>
                            Monitoring social media, news, and web in real-time
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select
                            value={selectedSource}
                            onChange={(e) => setSelectedSource(e.target.value)}
                            style={{
                                padding: '8px 15px',
                                borderRadius: '20px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--card-bg)',
                                color: 'var(--text-color)'
                            }}
                        >
                            <option value="all">All Sources</option>
                            <option value="twitter">Twitter</option>
                            <option value="facebook">Facebook</option>
                            <option value="youtube">YouTube</option>
                            <option value="news">News</option>
                        </select>
                        <button
                            onClick={() => setMonitoring(!monitoring)}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '20px',
                                border: 'none',
                                background: monitoring ? '#f44336' : '#4caf50',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {monitoring ? 'Stop Monitoring' : 'Start Monitoring'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Statistics Dashboard */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '15px',
                marginBottom: '20px'
            }}>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--highlight-color)' }}>
                        {stats.claimsChecked}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Claims Checked</div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#f44336' }}>
                        {stats.falseClaims}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>False Claims</div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#4caf50' }}>
                        {stats.trueClaims}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>True Claims</div>
                </div>
                <div style={{
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff9800' }}>
                        {stats.disputedClaims}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>Disputed</div>
                </div>
            </div>

            {/* Real-Time Feed */}
            <div ref={containerRef} style={{
                background: 'var(--secondary-color)',
                borderRadius: '12px',
                height: '400px',
                overflowY: 'auto',
                padding: '15px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '15px',
                    paddingBottom: '10px',
                    borderBottom: '1px solid var(--border-color)'
                }}>
                    <strong>Live Feed</strong>
                    {monitoring && (
                        <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '12px',
                            color: '#4caf50'
                        }}>
                            <span className="pulse"></span> Monitoring Active
                        </span>
                    )}
                </div>

                {alerts.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '50px',
                        color: 'var(--highlight-color)'
                    }}>
                        {monitoring ? 'Waiting for truth alerts...' : 'Click Start Monitoring to begin'}
                    </div>
                ) : (
                    alerts.map(alert => (
                        <div
                            key={alert.id}
                            style={{
                                padding: '12px',
                                marginBottom: '10px',
                                background: 'var(--card-bg)',
                                borderRadius: '8px',
                                borderLeft: `4px solid ${getAlertColor(alert)}`,
                                animation: 'slideIn 0.3s ease-out'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '18px' }}>{getAlertIcon(alert)}</span>
                                    <span style={{ fontWeight: 'bold' }}>{alert.source}</span>
                                    <span style={{ fontSize: '11px', color: 'var(--highlight-color)' }}>
                                        {new Date(alert.timestamp).toLocaleTimeString()}
                                    </span>
                                </div>
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    background: `${getAlertColor(alert)}20`,
                                    color: getAlertColor(alert)
                                }}>
                                    {alert.confidence}% confident
                                </span>
                            </div>
                            <p style={{ fontSize: '14px', marginBottom: '8px' }}>{alert.claim}</p>
                            {alert.isFalse && alert.correction && (
                                <div style={{
                                    fontSize: '12px',
                                    padding: '8px',
                                    background: 'rgba(76, 175, 80, 0.1)',
                                    borderRadius: '4px',
                                    marginTop: '8px'
                                }}>
                                    <strong>Correction:</strong> {alert.correction}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Trending Misinformation */}
            {trendingMisinfo.length > 0 && (
                <div style={{
                    marginTop: '20px',
                    background: 'var(--secondary-color)',
                    borderRadius: '12px',
                    padding: '15px'
                }}>
                    <h4 style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaChartLine /> Trending Misinformation
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {trendingMisinfo.map((trend, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: '8px 15px',
                                    background: '#f4433620',
                                    borderRadius: '20px',
                                    fontSize: '13px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <FaRobot style={{ color: '#f44336' }} />
                                {trend.claim}
                                <span style={{
                                    background: '#f44336',
                                    padding: '2px 6px',
                                    borderRadius: '12px',
                                    fontSize: '10px',
                                    color: 'white'
                                }}>
                                    {trend.spreadRate}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                .pulse {
                    width: 10px;
                    height: 10px;
                    background: #4caf50;
                    border-radius: 50%;
                    animation: pulse 1.5s infinite;
                }
                @keyframes pulse {
                    0% {
                        box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
                    }
                    70% {
                        box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
                    }
                    100% {
                        box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
                    }
                }
            `}</style>
        </div>
    );
};

export default RealTimeTruthMonitor;