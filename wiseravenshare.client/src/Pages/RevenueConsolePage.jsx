import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../Services/api';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    return new Set(['admin@wise-ravens.com', ...fromEnv]);
};

const formatCurrency = (amount) => {
    const numeric = Number(amount) || 0;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numeric);
};

const RevenueConsolePage = () => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [plan, setPlan] = useState(null);
    const [actions, setActions] = useState([]);
    const [evidence, setEvidence] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedWeek, setSelectedWeek] = useState('');
    const [evidenceForm, setEvidenceForm] = useState({
        weekNumber: '',
        amountUsd: '',
        sourceType: 'stripe_invoice',
        sourceReference: '',
        notes: ''
    });

    const load = async () => {
        if (!isAdminUser) {
            setLoading(false);
            setSummary(null);
            setPlan(null);
            setActions([]);
            setEvidence([]);
            return;
        }

        setLoading(true);
        try {
            const [initRes] = await Promise.all([
                apiService.initializeRevenueAgent()
            ]);

            const planData = initRes?.data?.plan || null;
            const summaryData = initRes?.data?.summary || null;
            const currentWeek = summaryData?.currentWeek;

            const [actionsRes, evidenceRes] = await Promise.all([
                apiService.getRevenueActions(currentWeek, statusFilter),
                apiService.getRevenueEvidence(currentWeek)
            ]);

            setPlan(planData);
            setSummary(summaryData);
            setActions(Array.isArray(actionsRes.data) ? actionsRes.data : []);
            setEvidence(Array.isArray(evidenceRes.data) ? evidenceRes.data : []);
            setSelectedWeek(currentWeek ? String(currentWeek) : '');
            setEvidenceForm((prev) => ({
                ...prev,
                weekNumber: currentWeek ? String(currentWeek) : prev.weekNumber
            }));
        } catch (error) {
            addToast(error?.message || 'Failed to load revenue console.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        load();
    }, [isAdminUser]);

    const refreshWeekData = async () => {
        const weekNumber = Number.parseInt(selectedWeek, 10);
        const normalizedWeek = Number.isFinite(weekNumber) ? weekNumber : undefined;

        try {
            const [actionsRes, evidenceRes] = await Promise.all([
                apiService.getRevenueActions(normalizedWeek, statusFilter),
                apiService.getRevenueEvidence(normalizedWeek)
            ]);
            setActions(Array.isArray(actionsRes.data) ? actionsRes.data : []);
            setEvidence(Array.isArray(evidenceRes.data) ? evidenceRes.data : []);
        } catch (error) {
            addToast(error?.message || 'Failed to refresh weekly revenue data.', 'error');
        }
    };

    useEffect(() => {
        if (!isAdminUser || !summary) {
            return;
        }

        refreshWeekData();
    }, [isAdminUser, statusFilter, selectedWeek, summary]);

    const progressPercent = Math.max(0, Math.min(100, Number(summary?.progressToWeeklyTargetPercent || 0)));

    const handleStatusUpdate = async (actionId, status) => {
        try {
            await apiService.updateRevenueActionStatus(actionId, status);
            addToast('Action updated.', 'success');
            await refreshWeekData();
            const summaryRes = await apiService.getRevenueSummary();
            setSummary(summaryRes.data || null);
        } catch (error) {
            addToast(error?.message || 'Unable to update action status.', 'error');
        }
    };

    const handleEvidenceCreate = async () => {
        const amountUsd = Number.parseFloat(evidenceForm.amountUsd);
        if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
            addToast('Enter a valid amount greater than 0.', 'warning');
            return;
        }

        if (!evidenceForm.sourceReference.trim()) {
            addToast('Source reference is required.', 'warning');
            return;
        }

        const weekNumber = Number.parseInt(evidenceForm.weekNumber, 10);

        try {
            await apiService.addRevenueEvidence({
                weekNumber: Number.isFinite(weekNumber) ? weekNumber : undefined,
                amountUsd,
                sourceType: evidenceForm.sourceType,
                sourceReference: evidenceForm.sourceReference.trim(),
                notes: evidenceForm.notes.trim()
            });

            addToast('Revenue evidence added.', 'success');
            setEvidenceForm((prev) => ({ ...prev, amountUsd: '', sourceReference: '', notes: '' }));
            await refreshWeekData();
            const summaryRes = await apiService.getRevenueSummary();
            setSummary(summaryRes.data || null);
        } catch (error) {
            addToast(error?.message || 'Unable to add revenue evidence.', 'error');
        }
    };

    const handleVerify = async (entryId, verified) => {
        try {
            await apiService.verifyRevenueEvidence(entryId, verified);
            addToast(verified ? 'Evidence verified.' : 'Evidence marked unverified.', 'success');
            await refreshWeekData();
            const summaryRes = await apiService.getRevenueSummary();
            setSummary(summaryRes.data || null);
        } catch (error) {
            addToast(error?.message || 'Unable to verify evidence.', 'error');
        }
    };

    const weekOptions = plan?.milestones || [];

    if (!isAdminUser) {
        return (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h2 style={{ marginTop: 0 }}>Revenue Console</h2>
                <div style={{ color: 'var(--light-color)' }}>Admin access required.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '14px' }}>
            <div style={panelStyle}>
                <h2 style={{ marginTop: 0 }}>Revenue Console</h2>
                {loading ? (
                    <div style={{ color: 'var(--light-color)' }}>Loading revenue performance...</div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                            <Metric label="Current week" value={summary?.currentWeek || 1} />
                            <Metric label="Weekly target" value={formatCurrency(summary?.targetWeeklyRevenue)} />
                            <Metric label="Verified this week" value={formatCurrency(summary?.currentWeekVerifiedRevenue)} />
                            <Metric label="Unverified this week" value={formatCurrency(summary?.currentWeekUnverifiedRevenue)} />
                            <Metric label="Total verified" value={formatCurrency(summary?.totalVerifiedRevenue)} />
                            <Metric label="On track" value={summary?.onTrackForDeadline ? 'Yes' : 'No'} />
                        </div>

                        <div style={{ marginTop: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--light-color)' }}>
                                <span>Progress to weekly target</span>
                                <span>{progressPercent.toFixed(2)}%</span>
                            </div>
                            <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginTop: '6px' }}>
                                <div
                                    style={{
                                        width: `${progressPercent}%`,
                                        height: '100%',
                                        background: 'linear-gradient(90deg, #34d399, #22c55e)'
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>

            <div style={panelStyle}>
                <h3 style={{ marginTop: 0 }}>Action Pipeline</h3>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <select value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} style={inputStyle}>
                        <option value="">All weeks</option>
                        {weekOptions.map((milestone) => (
                            <option key={milestone.weekNumber} value={milestone.weekNumber}>
                                Week {milestone.weekNumber}
                            </option>
                        ))}
                    </select>
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={inputStyle}>
                        <option value="all">All statuses</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In progress</option>
                        <option value="completed">Completed</option>
                        <option value="blocked">Blocked</option>
                    </select>
                </div>

                {actions.length === 0 ? (
                    <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>No actions found for this filter.</div>
                ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {actions.map((item) => (
                            <div key={item.id} style={rowStyle}>
                                <div style={{ fontWeight: 700 }}>{item.title}</div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{item.description}</div>
                                <div style={{ fontSize: '12px', color: 'var(--highlight-color)' }}>
                                    Week {item.weekNumber} | Due {new Date(item.dueAtUtc).toLocaleDateString()} | Status {item.status}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                    <ActionButton onClick={() => handleStatusUpdate(item.id, 'open')} label="Open" />
                                    <ActionButton onClick={() => handleStatusUpdate(item.id, 'in_progress')} label="In Progress" />
                                    <ActionButton onClick={() => handleStatusUpdate(item.id, 'completed')} label="Completed" />
                                    <ActionButton onClick={() => handleStatusUpdate(item.id, 'blocked')} label="Blocked" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={panelStyle}>
                <h3 style={{ marginTop: 0 }}>Revenue Evidence</h3>
                <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
                    <select
                        value={evidenceForm.weekNumber}
                        onChange={(event) => setEvidenceForm((prev) => ({ ...prev, weekNumber: event.target.value }))}
                        style={inputStyle}
                    >
                        <option value="">Current week</option>
                        {weekOptions.map((milestone) => (
                            <option key={milestone.weekNumber} value={milestone.weekNumber}>
                                Week {milestone.weekNumber}
                            </option>
                        ))}
                    </select>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={evidenceForm.amountUsd}
                        onChange={(event) => setEvidenceForm((prev) => ({ ...prev, amountUsd: event.target.value }))}
                        placeholder="Amount (USD)"
                        style={inputStyle}
                    />
                    <select
                        value={evidenceForm.sourceType}
                        onChange={(event) => setEvidenceForm((prev) => ({ ...prev, sourceType: event.target.value }))}
                        style={inputStyle}
                    >
                        <option value="stripe_invoice">Stripe invoice</option>
                        <option value="stripe_checkout">Stripe checkout</option>
                        <option value="manual_reconciliation">Manual reconciliation</option>
                    </select>
                    <input
                        type="text"
                        value={evidenceForm.sourceReference}
                        onChange={(event) => setEvidenceForm((prev) => ({ ...prev, sourceReference: event.target.value }))}
                        placeholder="Source reference (invoice/event ID)"
                        style={inputStyle}
                    />
                    <textarea
                        value={evidenceForm.notes}
                        onChange={(event) => setEvidenceForm((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Notes"
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <button style={buttonStyle} onClick={handleEvidenceCreate}>Add Evidence</button>
                </div>

                {evidence.length === 0 ? (
                    <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>No evidence entries for selected period.</div>
                ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {evidence.map((entry) => (
                            <div key={entry.id} style={rowStyle}>
                                <div style={{ fontWeight: 700 }}>{formatCurrency(entry.amountUsd)} | Week {entry.weekNumber}</div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                    {entry.sourceType} | {entry.sourceReference}
                                </div>
                                <div style={{ fontSize: '12px', color: entry.verified ? '#4ade80' : '#fbbf24' }}>
                                    {entry.verified ? 'Verified' : 'Pending verification'}
                                </div>
                                {entry.notes ? <div style={{ fontSize: '12px' }}>{entry.notes}</div> : null}
                                {isAdminUser && (
                                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                        <ActionButton onClick={() => handleVerify(entry.id, true)} label="Verify" />
                                        <ActionButton onClick={() => handleVerify(entry.id, false)} label="Unverify" />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const Metric = ({ label, value }) => (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{value}</div>
    </div>
);

const ActionButton = ({ onClick, label }) => (
    <button
        onClick={onClick}
        style={{
            border: '1px solid var(--border-color)',
            background: 'rgba(255,255,255,0.04)',
            color: 'var(--text-color)',
            borderRadius: '999px',
            padding: '6px 10px',
            fontSize: '12px',
            cursor: 'pointer'
        }}
    >
        {label}
    </button>
);

const panelStyle = {
    background: 'var(--card-bg)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
    padding: '14px'
};

const rowStyle = {
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    padding: '10px'
};

const inputStyle = {
    width: '100%',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'rgba(255,255,255,0.05)',
    color: 'var(--text-color)'
};

const buttonStyle = {
    border: '1px solid var(--highlight-color)',
    background: 'var(--highlight-color)',
    color: 'white',
    borderRadius: '999px',
    padding: '8px 12px',
    cursor: 'pointer'
};

export default RevenueConsolePage;
