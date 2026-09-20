// wiseravenshare.client/src/Components/Communication/MetricsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { apiService } from '@/Services/api';
import './MetricsDashboard.css';

/**
 * Communication Metrics Dashboard
 * Displays SMS/WhatsApp costs, usage metrics, and engagement statistics
 */
export const MetricsDashboard = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [timeframe, setTimeframe] = useState('month');
    const [days, setDays] = useState(30);
    
    // Data states
    const [monthlyCost, setMonthlyCost] = useState(null);
    const [metrics, setMetrics] = useState(null);
    const [breakdown, setBreakdown] = useState(null);

    useEffect(() => {
        loadDashboardData();
    }, [timeframe, days]);

    const loadDashboardData = async () => {
        setLoading(true);
        setError('');

        try {
            // Load all data in parallel
            const [costRes, metricsRes, breakdownRes] = await Promise.all([
                apiService.get('/api/costtracking/monthly'),
                apiService.get(`/api/costtracking/metrics?timeframe=${timeframe}`),
                apiService.get(`/api/costtracking/breakdown?days=${days}`)
            ]);

            if (costRes.data) setMonthlyCost(costRes.data);
            if (metricsRes.data) setMetrics(metricsRes.data);
            if (breakdownRes.data) setBreakdown(breakdownRes.data);
        } catch (err) {
            setError('Failed to load dashboard data');
            console.error('Dashboard error:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 4,
            maximumFractionDigits: 4
        }).format(value || 0);
    };

    const formatPercentage = (value) => {
        return `${((value || 0) * 100).toFixed(1)}%`;
    };

    if (loading) {
        return <div className="dashboard-container loading">Loading metrics...</div>;
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h1>📊 Communication Metrics Dashboard</h1>
                <p>Monitor SMS, WhatsApp, and verification costs</p>
            </div>

            {error && <div className="error-banner">{error}</div>}

            {/* Timeframe Selector */}
            <div className="timeframe-selector">
                <div className="selector-group">
                    <label>Metrics Timeframe:</label>
                    <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                        <option value="day">Last 24 Hours</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="quarter">Last 90 Days</option>
                        <option value="year">Last Year</option>
                    </select>
                </div>
                <div className="selector-group">
                    <label>Cost Breakdown (Days):</label>
                    <select value={days} onChange={(e) => setDays(parseInt(e.target.value))}>
                        <option value={7}>Last 7 Days</option>
                        <option value={30}>Last 30 Days</option>
                        <option value={60}>Last 60 Days</option>
                        <option value={90}>Last 90 Days</option>
                        <option value={180}>Last 180 Days</option>
                    </select>
                </div>
            </div>

            {/* Monthly Cost Summary */}
            {monthlyCost && (
                <div className="dashboard-section">
                    <h2>💰 Monthly Cost Summary</h2>
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <div className="metric-icon">💵</div>
                            <div className="metric-content">
                                <h3>Total Cost</h3>
                                <p className="metric-value">{formatCurrency(monthlyCost.totalCostUsd)}</p>
                                <p className="metric-label">
                                    {monthlyCost.month}/{monthlyCost.year}
                                </p>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon">📱</div>
                            <div className="metric-content">
                                <h3>SMS Messages</h3>
                                <p className="metric-value">{monthlyCost.smsCount}</p>
                                <p className="metric-label">
                                    {formatCurrency(monthlyCost.smsCostUsd)}
                                </p>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon">💬</div>
                            <div className="metric-content">
                                <h3>WhatsApp Messages</h3>
                                <p className="metric-value">{monthlyCost.whatsAppCount}</p>
                                <p className="metric-label">
                                    {formatCurrency(monthlyCost.whatsAppCostUsd)}
                                </p>
                            </div>
                        </div>

                        <div className="metric-card">
                            <div className="metric-icon">🔐</div>
                            <div className="metric-content">
                                <h3>Verifications</h3>
                                <p className="metric-value">{monthlyCost.verificationCount}</p>
                                <p className="metric-label">
                                    {formatCurrency(monthlyCost.verificationCostUsd)}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Usage Metrics */}
            {metrics && (
                <div className="dashboard-section">
                    <h2>📈 Usage Metrics ({metrics.timeframe})</h2>
                    <div className="metrics-grid">
                        <div className="metric-card wide">
                            <div className="metric-icon">📊</div>
                            <div className="metric-content">
                                <h3>Total Messages</h3>
                                <p className="metric-value">{metrics.totalMessages}</p>
                                <p className="metric-label">
                                    Avg: {formatCurrency(metrics.averageCostPerMessage)} per message
                                </p>
                            </div>
                        </div>

                        <div className="metric-card wide">
                            <div className="metric-icon">👥</div>
                            <div className="metric-content">
                                <h3>Active Users</h3>
                                <p className="metric-value">{metrics.uniqueUsers}</p>
                                <p className="metric-label">
                                    Users with notifications in this period
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Delivery Rate */}
                    <div className="delivery-rate">
                        <h3>Delivery Rate</h3>
                        <div className="rate-bar">
                            <div className="rate-bar-fill success" 
                                 style={{width: formatPercentage(metrics.successRate)}}
                            >
                                {formatPercentage(metrics.successRate)}
                            </div>
                        </div>
                        <div className="rate-details">
                            <span className="success-label">✓ {metrics.successfulMessages} Successful</span>
                            <span className="failure-label">✕ {metrics.failedMessages} Failed</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Cost Breakdown */}
            {breakdown && (
                <div className="dashboard-section">
                    <h2>💹 Cost Breakdown (Last {breakdown.days} Days)</h2>
                    
                    <div className="breakdown-grid">
                        {/* SMS Breakdown */}
                        <div className="breakdown-card">
                            <div className="breakdown-header">
                                <h3>📱 SMS</h3>
                                <span className="cost-total">
                                    {formatCurrency(breakdown.smsMetrics.totalCostUsd)}
                                </span>
                            </div>
                            <div className="breakdown-stats">
                                <div className="stat">
                                    <span className="stat-label">Messages:</span>
                                    <span className="stat-value">{breakdown.smsMetrics.count}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Avg Cost:</span>
                                    <span className="stat-value">
                                        {formatCurrency(breakdown.smsMetrics.averageCostPerMessage)}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Success:</span>
                                    <span className="stat-value success">
                                        {breakdown.smsMetrics.successCount}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Failed:</span>
                                    <span className="stat-value error">
                                        {breakdown.smsMetrics.failureCount}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp Breakdown */}
                        <div className="breakdown-card">
                            <div className="breakdown-header">
                                <h3>💬 WhatsApp</h3>
                                <span className="cost-total">
                                    {formatCurrency(breakdown.whatsAppMetrics.totalCostUsd)}
                                </span>
                            </div>
                            <div className="breakdown-stats">
                                <div className="stat">
                                    <span className="stat-label">Messages:</span>
                                    <span className="stat-value">{breakdown.whatsAppMetrics.count}</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Avg Cost:</span>
                                    <span className="stat-value">
                                        {formatCurrency(breakdown.whatsAppMetrics.averageCostPerMessage)}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Success:</span>
                                    <span className="stat-value success">
                                        {breakdown.whatsAppMetrics.successCount}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Failed:</span>
                                    <span className="stat-value error">
                                        {breakdown.whatsAppMetrics.failureCount}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Verification Breakdown */}
                        <div className="breakdown-card">
                            <div className="breakdown-header">
                                <h3>🔐 Verification</h3>
                                <span className="cost-total">
                                    {formatCurrency(breakdown.verificationMetrics.totalCostUsd)}
                                </span>
                            </div>
                            <div className="breakdown-stats">
                                <div className="stat">
                                    <span className="stat-label">Requests:</span>
                                    <span className="stat-value">
                                        {breakdown.verificationMetrics.count}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Avg Cost:</span>
                                    <span className="stat-value">
                                        {formatCurrency(breakdown.verificationMetrics.averageCostPerMessage)}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Success:</span>
                                    <span className="stat-value success">
                                        {breakdown.verificationMetrics.successCount}
                                    </span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Failed:</span>
                                    <span className="stat-value error">
                                        {breakdown.verificationMetrics.failureCount}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Total Breakdown */}
                    <div className="total-breakdown">
                        <h3>Total: {formatCurrency(breakdown.totalCostUsd)}</h3>
                        <p>Period: {new Date(breakdown.periodStart).toLocaleDateString()} - {new Date(breakdown.periodEnd).toLocaleDateString()}</p>
                    </div>
                </div>
            )}

            {/* Alerts and Recommendations */}
            <div className="dashboard-section">
                <h2>⚠️ Alerts & Recommendations</h2>
                <div className="alerts">
                    {monthlyCost && monthlyCost.totalCostUsd > 50 && (
                        <div className="alert warning">
                            <span className="alert-icon">⚠️</span>
                            <div>
                                <p className="alert-title">High Monthly Costs</p>
                                <p>Your communication costs exceeded $50 this month. Consider optimizing notification frequency.</p>
                            </div>
                        </div>
                    )}

                    {metrics && metrics.successRate < 0.95 && (
                        <div className="alert warning">
                            <span className="alert-icon">⚠️</span>
                            <div>
                                <p className="alert-title">Delivery Rate Below 95%</p>
                                <p>Your message delivery rate is below 95%. Some messages may not be reaching users.</p>
                            </div>
                        </div>
                    )}

                    {breakdown && breakdown.smsMetrics.count > 1000 && (
                        <div className="alert info">
                            <span className="alert-icon">ℹ️</span>
                            <div>
                                <p className="alert-title">High SMS Volume</p>
                                <p>Consider bulk SMS discounts or switching engagement preferences for users with high notification frequency.</p>
                            </div>
                        </div>
                    )}

                    {!monthlyCost || (monthlyCost.totalCostUsd <= 10 && monthlyCost.totalCostUsd > 0) && (
                        <div className="alert success">
                            <span className="alert-icon">✓</span>
                            <div>
                                <p className="alert-title">Costs Under Control</p>
                                <p>Your communication costs are well within budget this month.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Refresh Button */}
            <div className="dashboard-footer">
                <button className="btn btn-primary" onClick={loadDashboardData}>
                    🔄 Refresh Data
                </button>
                <p className="last-updated">
                    Last updated: {new Date().toLocaleTimeString()}
                </p>
            </div>
        </div>
    );
};

export default MetricsDashboard;
