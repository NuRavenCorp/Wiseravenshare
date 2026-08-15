import React, { useEffect, useMemo, useState } from 'react';
import { apiService } from '../Services/api';
import { useNotification } from '../Contexts/NotificationContext';
import { useAuth } from '../Contexts/AuthContext';
import { authService } from '../Services/Auth.jsx';

const MODERATION_QUEUE_PREFS_KEY = 'wiseModerationQueuePrefsV1';

const parseAdminEmails = () => {
    const fromEnv = String(import.meta.env.VITE_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

    const defaults = ['admin@wise-ravens.com'];
    return new Set([...defaults, ...fromEnv]);
};

const GrowthPage = () => {
    const readQueuePrefs = () => {
        try {
            const raw = localStorage.getItem(MODERATION_QUEUE_PREFS_KEY);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }

            return parsed;
        } catch {
            return null;
        }
    };

    const queuePrefs = readQueuePrefs();

    const { user } = useAuth();
    const [onboarding, setOnboarding] = useState(null);
    const [funnel, setFunnel] = useState(null);
    const [referrals, setReferrals] = useState(null);
    const [inviteeEmail, setInviteeEmail] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [moderationText, setModerationText] = useState('');
    const [moderationResult, setModerationResult] = useState(null);
    const [moderationQueue, setModerationQueue] = useState(null);
    const [queueLoading, setQueueLoading] = useState(false);
    const [queueFilter, setQueueFilter] = useState(queuePrefs?.queueFilter || 'open');
    const [queueTargetType, setQueueTargetType] = useState(queuePrefs?.queueTargetType || 'all');
    const [queuePage, setQueuePage] = useState(1);
    const [queuePageSize, setQueuePageSize] = useState(Number.isFinite(queuePrefs?.queuePageSize) ? Math.min(50, Math.max(10, Number(queuePrefs.queuePageSize))) : 10);
    const [queueJumpPage, setQueueJumpPage] = useState('1');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [securitySaving, setSecuritySaving] = useState(false);
    const [policyHistory, setPolicyHistory] = useState(null);
    const [policyKey, setPolicyKey] = useState('content-moderation');
    const [policyTitle, setPolicyTitle] = useState('');
    const [policySummary, setPolicySummary] = useState('');
    const [policyStatus, setPolicyStatus] = useState('draft');
    const [policyNotes, setPolicyNotes] = useState('');
    const [policySaving, setPolicySaving] = useState(false);
    const [teamAccess, setTeamAccess] = useState(null);
    const [teamMemberEmail, setTeamMemberEmail] = useState('');
    const [teamMemberName, setTeamMemberName] = useState('');
    const [teamMemberRole, setTeamMemberRole] = useState('member');
    const [teamTokenExpiryHours, setTeamTokenExpiryHours] = useState(72);
    const [teamActionReason, setTeamActionReason] = useState('');
    const [teamInviteResult, setTeamInviteResult] = useState(null);
    const [teamActionSaving, setTeamActionSaving] = useState(false);
    const { addToast } = useNotification();
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

    const load = async () => {
        if (!isAdminUser) {
            setOnboarding(null);
            setFunnel(null);
            setReferrals(null);
            setModerationQueue(null);
            setPolicyHistory(null);
            setTeamAccess(null);
            return;
        }

        try {
            const requests = [
                apiService.getOnboardingState(),
                apiService.getGrowthFunnelSummary(30),
                apiService.getReferralStats(),
                apiService.getAdminPolicyHistory(),
                authService.getTeamAccessSnapshot()
            ];

            requests.push(apiService.getModerationReports({
                page: queuePage,
                pageSize: queuePageSize,
                status: queueFilter,
                targetType: queueTargetType
            }));

            const responses = await Promise.all(requests);
            const [onboardingRes, funnelRes, referralsRes, policyHistoryRes, teamAccessRes, moderationQueueRes] = responses;

            setOnboarding(onboardingRes.data);
            setFunnel(funnelRes.data);
            setReferrals(referralsRes.data);
            setPolicyHistory(policyHistoryRes?.data || null);
            setTeamAccess(teamAccessRes || null);
            setModerationQueue(moderationQueueRes?.data || null);
        } catch (error) {
            addToast(error?.message || 'Failed to load growth insights.', 'error');
        }
    };

    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        load();
    }, [isAdminUser, queueFilter, queueTargetType, queuePage, queuePageSize]);

    useEffect(() => {
        setQueueJumpPage(String(queuePage));
    }, [queuePage]);

    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        localStorage.setItem(
            MODERATION_QUEUE_PREFS_KEY,
            JSON.stringify({
                queueFilter,
                queueTargetType,
                queuePageSize
            })
        );
    }, [isAdminUser, queueFilter, queueTargetType, queuePageSize]);

    const handleCreateInvite = async () => {
        if (!inviteeEmail.trim()) {
            addToast('Invitee email is required.', 'warning');
            return;
        }

        try {
            const response = await apiService.createReferralInvite(inviteeEmail.trim(), inviteMessage);
            setInviteLink(response.data?.inviteLink || '');
            setInviteeEmail('');
            setInviteMessage('');
            addToast('Invite created.', 'success');
            await load();
        } catch (error) {
            addToast(error?.message || 'Unable to create invite.', 'error');
        }
    };

    const handleModerationCheck = async () => {
        try {
            const response = await apiService.checkModeration(moderationText);
            setModerationResult(response.data);
        } catch (error) {
            addToast(error?.message || 'Unable to run moderation check.', 'error');
        }
    };

    const refreshModerationQueue = async () => {
        if (!isAdminUser) {
            return;
        }

        setQueueLoading(true);
        try {
            const response = await apiService.getModerationReports({
                page: queuePage,
                pageSize: queuePageSize,
                status: queueFilter,
                targetType: queueTargetType
            });
            setModerationQueue(response.data || null);
        } catch (error) {
            addToast(error?.message || 'Unable to load moderation queue.', 'error');
        } finally {
            setQueueLoading(false);
        }
    };

    const handleReviewReport = async (reportId, outcome) => {
        const notes = window.prompt('Optional review notes:', '') ?? null;
        if (notes === null) {
            return;
        }

        try {
            await apiService.resolveModerationReport(reportId, outcome, notes);
            addToast(`Report ${outcome}.`, 'success');
            await refreshModerationQueue();
        } catch (error) {
            addToast(error?.message || 'Unable to update report.', 'error');
        }
    };

    const targetTypeChips = ['all', 'post', 'comment', 'message', 'user'];

    const applyJumpToPage = () => {
        const parsed = Number.parseInt(queueJumpPage, 10);
        if (!Number.isFinite(parsed)) {
            return;
        }

        const maxPage = Math.max(1, Number(moderationQueue?.totalPages || 1));
        const nextPage = Math.min(maxPage, Math.max(1, parsed));
        setQueuePage(nextPage);
    };

    const clearQueueFilters = () => {
        setQueueFilter('open');
        setQueueTargetType('all');
        setQueuePageSize(10);
        setQueuePage(1);
        setQueueJumpPage('1');
        localStorage.removeItem(MODERATION_QUEUE_PREFS_KEY);
    };

    const handleAdminPasswordChange = async () => {
        if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
            addToast('Fill in the current password, new password, and confirmation.', 'warning');
            return;
        }

        if (newPassword !== confirmPassword) {
            addToast('New password and confirmation do not match.', 'warning');
            return;
        }

        setSecuritySaving(true);
        try {
            await authService.changePassword(currentPassword.trim(), newPassword.trim());
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            addToast('Admin password updated successfully.', 'success');
        } catch (error) {
            addToast(error?.message || 'Unable to update admin password.', 'error');
        } finally {
            setSecuritySaving(false);
        }
    };

    const handlePolicyShiftSubmit = async () => {
        if (!policyKey.trim() || !policyTitle.trim() || !policySummary.trim()) {
            addToast('Policy key, title, and summary are required.', 'warning');
            return;
        }

        setPolicySaving(true);
        try {
            await apiService.recordAdminPolicyShift({
                policyKey: policyKey.trim(),
                title: policyTitle.trim(),
                summary: policySummary.trim(),
                status: policyStatus,
                notes: policyNotes.trim()
            });
            setPolicyTitle('');
            setPolicySummary('');
            setPolicyNotes('');
            setPolicyStatus('draft');
            await load();
            addToast('Policy shift recorded.', 'success');
        } catch (error) {
            addToast(error?.message || 'Unable to record policy shift.', 'error');
        } finally {
            setPolicySaving(false);
        }
    };

    const refreshTeamAccess = async () => {
        if (!isAdminUser) {
            return;
        }

        try {
            const snapshot = await authService.getTeamAccessSnapshot();
            setTeamAccess(snapshot || null);
        } catch (error) {
            addToast(error?.message || 'Unable to refresh team access.', 'error');
        }
    };

    const handleIssueTeamToken = async (prearranged) => {
        if (!teamMemberEmail.trim()) {
            addToast('Team member email is required.', 'warning');
            return;
        }

        setTeamActionSaving(true);
        try {
            const payload = {
                email: teamMemberEmail.trim(),
                name: teamMemberName.trim(),
                teamRole: teamMemberRole,
                expiresInHours: Number.isFinite(Number(teamTokenExpiryHours)) ? Number(teamTokenExpiryHours) : 72
            };

            const response = prearranged
                ? await authService.createPrearrangedTeamToken(payload)
                : await authService.createTeamInvite(payload);

            const invite = response?.invite || response?.prearrangedToken || null;
            setTeamInviteResult({
                link: response?.inviteLink || '',
                invite
            });
            setTeamMemberEmail('');
            setTeamMemberName('');
            setTeamActionReason('');
            addToast(prearranged ? 'Prearranged team token issued.' : 'Team invite token issued.', 'success');
            await Promise.all([load(), refreshTeamAccess()]);
        } catch (error) {
            addToast(error?.message || 'Unable to issue team token.', 'error');
        } finally {
            setTeamActionSaving(false);
        }
    };

    const handleRevokePendingInvite = async (inviteId) => {
        if (!inviteId) {
            return;
        }

        setTeamActionSaving(true);
        try {
            await authService.revokeTeamInvite(inviteId, teamActionReason.trim());
            setTeamActionReason('');
            addToast('Pending invite revoked.', 'success');
            await Promise.all([load(), refreshTeamAccess()]);
        } catch (error) {
            addToast(error?.message || 'Unable to revoke invite.', 'error');
        } finally {
            setTeamActionSaving(false);
        }
    };

    const handleToggleTeamMember = async (email, activate) => {
        if (!email) {
            return;
        }

        setTeamActionSaving(true);
        try {
            await authService.setTeamMemberStatus(email, activate, teamActionReason.trim());
            setTeamActionReason('');
            addToast(activate ? 'Team member reactivated.' : 'Team member suspended.', 'success');
            await Promise.all([load(), refreshTeamAccess()]);
        } catch (error) {
            addToast(error?.message || 'Unable to update team member status.', 'error');
        } finally {
            setTeamActionSaving(false);
        }
    };

    if (!isAdminUser) {
        return (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h2 style={{ marginTop: 0 }}>Growth Dashboard</h2>
                <div style={{ color: 'var(--light-color)' }}>Admin access required.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h2 style={{ marginTop: 0 }}>Growth Overview</h2>
                {funnel ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                        <Metric label="Signups" value={funnel.signedUpUsers} />
                        <Metric label="Activated" value={funnel.activatedUsers} />
                        <Metric label="Activation %" value={`${funnel.activationRate}%`} />
                        <Metric label="Retained" value={funnel.retainedUsers} />
                        <Metric label="Retention %" value={`${funnel.retentionRate}%`} />
                        <Metric label="Invite Redemptions" value={funnel.inviteRedemptions} />
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)' }}>Loading funnel metrics...</div>
                )}
                {onboarding && (
                    <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                        Your onboarding progress: {onboarding.completedSteps}/{onboarding.totalSteps}
                    </div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Admin Login And Policy Control</h3>
                <div style={{ color: 'var(--light-color)', fontSize: '13px', marginBottom: '12px' }}>
                    Default admin login: <strong>admin</strong> / <strong>1@Chinchin234</strong>. Rotate it from inside the app after first sign-in.
                </div>
                <div style={{ display: 'grid', gap: '8px', maxWidth: '420px' }}>
                    <input
                        type="password"
                        placeholder="Current admin password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        type="password"
                        placeholder="New admin password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={inputStyle}
                    />
                    <button onClick={handleAdminPasswordChange} style={buttonStyle} disabled={securitySaving}>
                        {securitySaving ? 'Saving...' : 'Update Admin Password'}
                    </button>
                </div>
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--light-color)' }}>
                    Policy and moderation controls already live in this console; this section handles credential rotation.
                </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Policy Audit Trail</h3>
                <div style={{ display: 'grid', gap: '8px', maxWidth: '560px', marginBottom: '14px' }}>
                    <input
                        type="text"
                        placeholder="Policy key"
                        value={policyKey}
                        onChange={(e) => setPolicyKey(e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        type="text"
                        placeholder="Policy title"
                        value={policyTitle}
                        onChange={(e) => setPolicyTitle(e.target.value)}
                        style={inputStyle}
                    />
                    <textarea
                        placeholder="Policy summary"
                        value={policySummary}
                        onChange={(e) => setPolicySummary(e.target.value)}
                        rows={3}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <select
                        value={policyStatus}
                        onChange={(e) => setPolicyStatus(e.target.value)}
                        style={inputStyle}
                    >
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="retired">Retired</option>
                    </select>
                    <textarea
                        placeholder="Notes for the audit trail"
                        value={policyNotes}
                        onChange={(e) => setPolicyNotes(e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <button onClick={handlePolicyShiftSubmit} style={buttonStyle} disabled={policySaving}>
                        {policySaving ? 'Recording...' : 'Record Policy Shift'}
                    </button>
                </div>
                {Array.isArray(policyHistory?.history) && policyHistory.history.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                        {policyHistory.history.slice(0, 6).map((record) => (
                            <div key={record.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: 'var(--light-color)' }}>
                                    <span>{record.policyKey}</span>
                                    <span>{record.status}</span>
                                </div>
                                <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{record.title}</div>
                                <div style={{ fontSize: '13px', marginTop: '4px' }}>{record.summary}</div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '6px' }}>
                                    {new Date(record.effectiveFromUtc || record.createdAtUtc).toLocaleString()} by {record.changedByEmail || 'unknown'}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>No policy shifts recorded yet.</div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Referral And Invite</h3>
                <input
                    type="email"
                    placeholder="Invitee email"
                    value={inviteeEmail}
                    onChange={(e) => setInviteeEmail(e.target.value)}
                    style={inputStyle}
                />
                <textarea
                    placeholder="Optional invite message"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                />
                <button onClick={handleCreateInvite} style={buttonStyle}>Create Invite</button>
                {inviteLink && (
                    <div style={{ marginTop: '10px', fontSize: '12px' }}>
                        Invite link: <span style={{ color: 'var(--highlight-color)' }}>{inviteLink}</span>
                    </div>
                )}
                {referrals && (
                    <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                        Pending: {referrals.pendingInvites} | Redeemed: {referrals.redeemedInvites}
                    </div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Team Access Tokens And Member Control</h3>
                <div style={{ color: 'var(--light-color)', fontSize: '13px', marginBottom: '10px' }}>
                    Issue invite or prearranged tokens, then suspend/reactivate team logins without opening public registration.
                </div>
                <div style={{ display: 'grid', gap: '8px', maxWidth: '620px' }}>
                    <input
                        type="email"
                        placeholder="Team member email"
                        value={teamMemberEmail}
                        onChange={(e) => setTeamMemberEmail(e.target.value)}
                        style={inputStyle}
                    />
                    <input
                        type="text"
                        placeholder="Display name"
                        value={teamMemberName}
                        onChange={(e) => setTeamMemberName(e.target.value)}
                        style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Role (member, producer, host, etc.)"
                            value={teamMemberRole}
                            onChange={(e) => setTeamMemberRole(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="number"
                            min={1}
                            max={336}
                            placeholder="Token expiry hours"
                            value={teamTokenExpiryHours}
                            onChange={(e) => setTeamTokenExpiryHours(Number.parseInt(e.target.value, 10) || 72)}
                            style={inputStyle}
                        />
                    </div>
                    <textarea
                        placeholder="Reason for revoke/suspend/reactivate actions (saved in policy audit)"
                        value={teamActionReason}
                        onChange={(e) => setTeamActionReason(e.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button onClick={() => handleIssueTeamToken(false)} style={buttonStyle} disabled={teamActionSaving}>
                            {teamActionSaving ? 'Working...' : 'Issue Invite Token'}
                        </button>
                        <button
                            onClick={() => handleIssueTeamToken(true)}
                            style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                            disabled={teamActionSaving}
                        >
                            Issue Prearranged Token
                        </button>
                        <button
                            onClick={refreshTeamAccess}
                            style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                            disabled={teamActionSaving}
                        >
                            Refresh Team Access
                        </button>
                    </div>
                </div>

                {teamInviteResult?.invite && (
                    <div style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px', fontSize: '13px' }}>
                        <div>Invite for: {teamInviteResult.invite.inviteeEmail}</div>
                        <div>Role: {teamInviteResult.invite.teamRole}</div>
                        <div>Expires: {new Date(teamInviteResult.invite.expiresAtUtc).toLocaleString()}</div>
                        <div style={{ marginTop: '6px', wordBreak: 'break-all' }}>
                            Token: <span style={{ color: 'var(--highlight-color)' }}>{teamInviteResult.invite.inviteToken}</span>
                        </div>
                        {teamInviteResult.link && (
                            <div style={{ marginTop: '6px', wordBreak: 'break-all' }}>
                                Link: <span style={{ color: 'var(--highlight-color)' }}>{teamInviteResult.link}</span>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Pending Team Invites</div>
                        {Array.isArray(teamAccess?.pendingInvites) && teamAccess.pendingInvites.length > 0 ? (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {teamAccess.pendingInvites.map((invite) => (
                                    <div key={invite.inviteId} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px' }}>{invite.inviteeEmail} ({invite.teamRole})</div>
                                        <div style={{ color: 'var(--light-color)', fontSize: '12px', marginTop: '4px' }}>
                                            Created {new Date(invite.createdAtUtc).toLocaleString()} · Expires {new Date(invite.expiresAtUtc).toLocaleString()}
                                        </div>
                                        <div style={{ marginTop: '8px' }}>
                                            <button
                                                onClick={() => handleRevokePendingInvite(invite.inviteId)}
                                                style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                                disabled={teamActionSaving}
                                            >
                                                Revoke Invite
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No pending team invites.</div>
                        )}
                    </div>

                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>Team Members</div>
                        {Array.isArray(teamAccess?.members) && teamAccess.members.length > 0 ? (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {teamAccess.members.map((member) => (
                                    <div key={member.email} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                        <div style={{ fontSize: '13px' }}>{member.email} ({member.teamRole})</div>
                                        <div style={{ color: 'var(--light-color)', fontSize: '12px', marginTop: '4px' }}>
                                            Status: {member.isActive ? 'Active' : 'Suspended'} · Granted {new Date(member.grantedAtUtc).toLocaleString()}
                                        </div>
                                        {member.suspensionReason && !member.isActive && (
                                            <div style={{ color: 'var(--light-color)', fontSize: '12px', marginTop: '4px' }}>
                                                Suspension reason: {member.suspensionReason}
                                            </div>
                                        )}
                                        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {member.isActive ? (
                                                <button
                                                    onClick={() => handleToggleTeamMember(member.email, false)}
                                                    style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                                    disabled={teamActionSaving}
                                                >
                                                    Suspend Member
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleToggleTeamMember(member.email, true)}
                                                    style={buttonStyle}
                                                    disabled={teamActionSaving}
                                                >
                                                    Reactivate Member
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No team members have accepted access yet.</div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Moderation And Anti-Spam</h3>
                <textarea
                    placeholder="Paste content to evaluate spam/toxicity risk"
                    value={moderationText}
                    onChange={(e) => setModerationText(e.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical' }}
                />
                <button onClick={handleModerationCheck} style={buttonStyle}>Run Moderation Check</button>
                {moderationResult && (
                    <div style={{ marginTop: '10px', fontSize: '13px' }}>
                        <div>Allowed: {moderationResult.allowed ? 'Yes' : 'No'}</div>
                        <div>Risk score: {moderationResult.riskScore}</div>
                        {Array.isArray(moderationResult.reasons) && moderationResult.reasons.length > 0 && (
                            <ul style={{ marginTop: '6px' }}>
                                {moderationResult.reasons.map((reason, index) => (
                                    <li key={`${reason}-${index}`}>{reason}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {isAdminUser && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                    <h3 style={{ marginTop: 0 }}>Admin Moderation Queue</h3>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                        <span>Open: {moderationQueue?.openReports ?? 0}</span>
                        <span>Resolved: {moderationQueue?.resolvedReports ?? 0}</span>
                        <span>Dismissed: {moderationQueue?.dismissedReports ?? 0}</span>
                        <select
                            value={queueFilter}
                            onChange={(event) => {
                                setQueuePage(1);
                                setQueueFilter(event.target.value);
                            }}
                            style={{ ...inputStyle, width: '160px', marginBottom: 0, padding: '6px 10px' }}
                        >
                            <option value="open">Open</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                            <option value="all">All</option>
                        </select>
                        <select
                            value={queuePageSize}
                            onChange={(event) => {
                                const nextSize = Number.parseInt(event.target.value, 10);
                                setQueuePage(1);
                                setQueuePageSize(Number.isFinite(nextSize) ? nextSize : 10);
                            }}
                            style={{ ...inputStyle, width: '120px', marginBottom: 0, padding: '6px 10px' }}
                        >
                            <option value={10}>10 / page</option>
                            <option value={20}>20 / page</option>
                            <option value={50}>50 / page</option>
                        </select>
                        <button onClick={refreshModerationQueue} style={buttonStyle} disabled={queueLoading}>
                            {queueLoading ? 'Refreshing...' : 'Refresh Queue'}
                        </button>
                        <button
                            onClick={clearQueueFilters}
                            style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                            disabled={queueLoading}
                        >
                            Clear Filters
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {targetTypeChips.map((chip) => (
                            <button
                                key={chip}
                                onClick={() => {
                                    setQueuePage(1);
                                    setQueueTargetType(chip);
                                }}
                                style={{
                                    ...buttonStyle,
                                    background: queueTargetType === chip ? 'var(--highlight-color)' : 'transparent',
                                    color: queueTargetType === chip ? 'white' : 'var(--text-color)'
                                }}
                            >
                                {chip === 'all' ? 'All targets' : chip}
                            </button>
                        ))}
                    </div>

                    {Array.isArray(moderationQueue?.reports) && moderationQueue.reports.length > 0 ? (
                        <div style={{ display: 'grid', gap: '10px' }}>
                            {moderationQueue.reports.map((report) => (
                                <div
                                    key={report.id}
                                    style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}
                                >
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>
                                        {report.targetType} / {report.targetId} / {report.status || 'open'}
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                                        {report.reason}
                                    </div>
                                    {report.details && (
                                        <div style={{ fontSize: '13px', marginBottom: '6px' }}>{report.details}</div>
                                    )}
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>
                                        Reported by {report.reporterEmail || 'unknown'} at {new Date(report.createdAtUtc).toLocaleString()}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button onClick={() => handleReviewReport(report.id, 'resolved')} style={buttonStyle}>Mark Resolved</button>
                                        <button
                                            onClick={() => handleReviewReport(report.id, 'dismissed')}
                                            style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>No open reports in queue.</div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                        <span>
                            Page {moderationQueue?.page ?? queuePage} of {moderationQueue?.totalPages ?? 1} | Total {moderationQueue?.totalCount ?? 0}
                        </span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                onClick={() => setQueuePage((value) => Math.max(1, value - 1))}
                                disabled={(moderationQueue?.page ?? queuePage) <= 1 || queueLoading}
                                style={buttonStyle}
                            >
                                Prev
                            </button>
                            <button
                                onClick={() => setQueuePage((value) => {
                                    const maxPage = moderationQueue?.totalPages ?? value;
                                    return Math.min(maxPage, value + 1);
                                })}
                                disabled={(moderationQueue?.page ?? queuePage) >= (moderationQueue?.totalPages ?? 1) || queueLoading}
                                style={buttonStyle}
                            >
                                Next
                            </button>
                            <input
                                type="number"
                                min={1}
                                max={Math.max(1, Number(moderationQueue?.totalPages || 1))}
                                value={queueJumpPage}
                                onChange={(event) => setQueueJumpPage(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        applyJumpToPage();
                                    }
                                }}
                                style={{ ...inputStyle, width: '86px', marginBottom: 0, padding: '6px 10px' }}
                            />
                            <button onClick={applyJumpToPage} style={buttonStyle} disabled={queueLoading}>
                                Go
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Metric = ({ label, value }) => (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
        <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{label}</div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>{value}</div>
    </div>
);

const inputStyle = {
    width: '100%',
    marginBottom: '10px',
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

export default GrowthPage;
