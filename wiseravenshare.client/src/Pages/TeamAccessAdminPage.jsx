import React, { useMemo, useState } from 'react';
import { authService } from '../Services/Auth.jsx';
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

const normalizeTeamSnapshot = (payload) => {
    const source = payload && typeof payload === 'object' ? payload : {};
    const members = Array.isArray(source.members) ? source.members : [];
    const pendingInvites = Array.isArray(source.pendingInvites) ? source.pendingInvites : [];
    return { members, pendingInvites };
};

const mergePendingInvites = (existingInvites, nextInvite) => {
    const current = Array.isArray(existingInvites) ? existingInvites : [];
    if (!nextInvite?.inviteId) {
        return current;
    }

    const deduped = current.filter((invite) => invite?.inviteId !== nextInvite.inviteId);
    return [nextInvite, ...deduped].sort((left, right) => {
        const leftTime = new Date(left?.createdAtUtc || 0).getTime();
        const rightTime = new Date(right?.createdAtUtc || 0).getTime();
        return rightTime - leftTime;
    });
};

const TeamAccessAdminPage = () => {
    const { user } = useAuth();
    const { addToast } = useNotification();
    const adminEmails = useMemo(() => parseAdminEmails(), []);
    const isAdminUser = useMemo(() => {
        const email = String(user?.email || '').trim().toLowerCase();
        return email.length > 0 && adminEmails.has(email);
    }, [adminEmails, user?.email]);

    const [snapshot, setSnapshot] = useState(null);
    const [auditHistory, setAuditHistory] = useState([]);
    const [userAccounting, setUserAccounting] = useState(null);
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState('member');
    const [expiresInHours, setExpiresInHours] = useState(72);
    const [actionReason, setActionReason] = useState('');
    const [issued, setIssued] = useState(null);

    const load = async () => {
        if (!isAdminUser) {
            setSnapshot(null);
            setAuditHistory([]);
            setUserAccounting(null);
            return;
        }

        setLoading(true);
        try {
            const [snapshotResult, policyResult, accountingResult] = await Promise.allSettled([
                authService.getTeamAccessSnapshot(),
                apiService.getAdminPolicyHistory(),
                apiService.getAdminUserAccounting()
            ]);

            if (snapshotResult.status === 'fulfilled') {
                setSnapshot(normalizeTeamSnapshot(snapshotResult.value));
            } else {
                setSnapshot(null);
                addToast('Unable to load team snapshot.', 'error');
            }

            if (policyResult.status === 'fulfilled') {
                const allHistory = Array.isArray(policyResult.value?.data?.history) ? policyResult.value.data.history : [];
                setAuditHistory(
                    allHistory
                        .filter((record) => String(record?.policyKey || '').toLowerCase().startsWith('team-access.'))
                        .slice(0, 20)
                );
            } else {
                setAuditHistory([]);
            }

            if (accountingResult.status === 'fulfilled') {
                setUserAccounting(accountingResult.value?.data || null);
            } else {
                setUserAccounting(null);
            }
        } catch (error) {
            addToast(error?.message || 'Unable to load team access console.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const issueToken = async (prearranged) => {
        if (!email.trim()) {
            addToast('Team member email is required.', 'warning');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                email: email.trim(),
                name: name.trim(),
                teamRole: role.trim() || 'member',
                expiresInHours: Number.isFinite(Number(expiresInHours)) ? Number(expiresInHours) : 72
            };

            const response = prearranged
                ? await authService.createPrearrangedTeamToken(payload)
                : await authService.createTeamInvite(payload);

            const invite = response?.invite || response?.prearrangedToken || null;
            setIssued({
                invite,
                link: response?.inviteLink || '',
                emailDelivered: response?.emailDelivered === true,
                emailDispatchStatus: response?.emailDispatchStatus || 'unknown'
            });
            if (invite?.inviteId) {
                const optimisticInvite = {
                    ...invite,
                    createdAtUtc: invite.createdAtUtc || new Date().toISOString(),
                    teamRole: invite.teamRole || payload.teamRole,
                    inviteeEmail: invite.inviteeEmail || payload.email
                };
                setSnapshot((prev) => {
                    const current = normalizeTeamSnapshot(prev);
                    return {
                        ...current,
                        pendingInvites: mergePendingInvites(current.pendingInvites, optimisticInvite)
                    };
                });
            }
            setEmail('');
            setName('');
            setActionReason('');
            await load();
            if (response?.emailDelivered === true) {
                addToast(prearranged ? 'Prearranged token issued and email sent.' : 'Invite token issued and email sent.', 'success');
            } else {
                addToast('Invite token issued, but email delivery failed. Copy and share the invite link/token manually.', 'warning');
            }
        } catch (error) {
            addToast(error?.message || 'Unable to issue token.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const revokeInvite = async (inviteId) => {
        setLoading(true);
        try {
            await authService.revokeTeamInvite(inviteId, actionReason.trim());
            setActionReason('');
            await load();
            addToast('Invite revoked.', 'success');
        } catch (error) {
            addToast(error?.message || 'Unable to revoke invite.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const toggleMember = async (memberEmail, active) => {
        setLoading(true);
        try {
            await authService.setTeamMemberStatus(memberEmail, active, actionReason.trim());
            setActionReason('');
            await load();
            addToast(active ? 'Member reactivated.' : 'Member suspended.', 'success');
        } catch (error) {
            addToast(error?.message || 'Unable to update member status.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const copyText = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            addToast('Copied to clipboard.', 'success');
        } catch {
            addToast('Copy failed. Please copy manually.', 'warning');
        }
    };

    React.useEffect(() => {
        load();
    }, [isAdminUser]);

    if (!isAdminUser) {
        return (
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h2 style={{ marginTop: 0 }}>Team Access Admin</h2>
                <div style={{ color: 'var(--light-color)' }}>Admin access required.</div>
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '14px' }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h2 style={{ marginTop: 0 }}>Team Access Admin Console</h2>
                <div style={{ color: 'var(--light-color)', fontSize: '13px', marginBottom: '12px' }}>
                    Issue invite or prearranged tokens, revoke pending tokens, and suspend/reactivate team-member login access.
                </div>
                <div style={{ display: 'grid', gap: '8px', maxWidth: '640px' }}>
                    <input
                        type="email"
                        placeholder="Team member email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        style={inputStyle}
                    />
                    <input
                        type="text"
                        placeholder="Display name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        style={inputStyle}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Role"
                            value={role}
                            onChange={(event) => setRole(event.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="number"
                            min={1}
                            max={336}
                            placeholder="Expiry (hours)"
                            value={expiresInHours}
                            onChange={(event) => setExpiresInHours(Number.parseInt(event.target.value, 10) || 72)}
                            style={inputStyle}
                        />
                    </div>
                    <textarea
                        placeholder="Reason for revoke/suspend/reactivate"
                        value={actionReason}
                        onChange={(event) => setActionReason(event.target.value)}
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical' }}
                    />
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <button onClick={() => issueToken(false)} style={buttonStyle} disabled={loading}>
                        {loading ? 'Working...' : 'Issue Invite Token'}
                    </button>
                    <button
                        onClick={() => issueToken(true)}
                        style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                        disabled={loading}
                    >
                        Issue Prearranged Token
                    </button>
                    <button
                        onClick={load}
                        style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                        disabled={loading}
                    >
                        Refresh
                    </button>
                </div>

                {issued?.invite && (
                    <div style={{ marginTop: '12px', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px', fontSize: '13px' }}>
                        <div>Issued for: {issued.invite.inviteeEmail}</div>
                        <div>Role: {issued.invite.teamRole}</div>
                        <div>Expires: {new Date(issued.invite.expiresAtUtc).toLocaleString()}</div>
                        <div>
                            Email delivery: {issued.emailDelivered ? 'Sent' : 'Not sent'}
                            {issued.emailDispatchStatus ? ` (${issued.emailDispatchStatus})` : ''}
                        </div>
                        <div style={{ marginTop: '8px', wordBreak: 'break-all' }}>
                            Token: <span style={{ color: 'var(--highlight-color)' }}>{issued.invite.inviteToken}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                            <button onClick={() => copyText(issued.invite.inviteToken)} style={buttonStyle}>Copy Token</button>
                            {issued.link && (
                                <button onClick={() => copyText(issued.link)} style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}>
                                    Copy Invite Link
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Pending Invites</h3>
                {Array.isArray(snapshot?.pendingInvites) && snapshot.pendingInvites.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {snapshot.pendingInvites.map((invite) => (
                            <div key={invite.inviteId} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ fontSize: '13px' }}>{invite.inviteeEmail} ({invite.teamRole})</div>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px', marginTop: '4px' }}>
                                    Created {new Date(invite.createdAtUtc).toLocaleString()} · Expires {new Date(invite.expiresAtUtc).toLocaleString()}
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    <button
                                        onClick={() => revokeInvite(invite.inviteId)}
                                        style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                        disabled={loading}
                                    >
                                        Revoke
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No pending invites.</div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Team Members</h3>
                {Array.isArray(snapshot?.members) && snapshot.members.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {snapshot.members.map((member) => (
                            <div key={member.email} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ fontSize: '13px' }}>{member.email} ({member.teamRole})</div>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px', marginTop: '4px' }}>
                                    Status: {member.isActive ? 'Active' : 'Suspended'} · Granted {new Date(member.grantedAtUtc).toLocaleString()}
                                </div>
                                <div style={{ marginTop: '8px' }}>
                                    {member.isActive ? (
                                        <button
                                            onClick={() => toggleMember(member.email, false)}
                                            style={{ ...buttonStyle, background: 'transparent', color: 'var(--text-color)' }}
                                            disabled={loading}
                                        >
                                            Suspend Member
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => toggleMember(member.email, true)}
                                            style={buttonStyle}
                                            disabled={loading}
                                        >
                                            Reactivate Member
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No team members yet.</div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>User Accounting</h3>
                {userAccounting?.totals ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: '8px' }}>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>Auth users</div>
                                <div style={{ fontSize: '18px', fontWeight: 700 }}>{Number(userAccounting.totals.authUsers || 0)}</div>
                            </div>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>Domain users</div>
                                <div style={{ fontSize: '18px', fontWeight: 700 }}>{Number(userAccounting.totals.domainUsers || 0)}</div>
                            </div>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>Active domain users</div>
                                <div style={{ fontSize: '18px', fontWeight: 700 }}>{Number(userAccounting.totals.activeDomainUsers || 0)}</div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(120px, 1fr))', gap: '8px' }}>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>New 7 days</div>
                                <div style={{ fontSize: '16px', fontWeight: 700 }}>{Number(userAccounting.totals.createdLast7Days || 0)}</div>
                            </div>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>New 30 days</div>
                                <div style={{ fontSize: '16px', fontWeight: 700 }}>{Number(userAccounting.totals.createdLast30Days || 0)}</div>
                            </div>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>Profile completion</div>
                                <div style={{ fontSize: '16px', fontWeight: 700 }}>{Number(userAccounting.totals.profileCompletionRate || 0).toFixed(2)}%</div>
                            </div>
                            <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>Social connected</div>
                                <div style={{ fontSize: '16px', fontWeight: 700 }}>{Number(userAccounting.totals.socialConnectionRate || 0).toFixed(2)}%</div>
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '6px' }}>Recent users</div>
                            {Array.isArray(userAccounting.recentUsers) && userAccounting.recentUsers.length > 0 ? (
                                <div style={{ display: 'grid', gap: '6px' }}>
                                    {userAccounting.recentUsers.slice(0, 10).map((account) => (
                                        <div key={account.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '8px' }}>
                                            <div style={{ fontSize: '13px' }}>{account.email || account.handle || account.id}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '3px' }}>
                                                Joined {new Date(account.createdAtUtc).toLocaleString()} · {account.socialLinked ? 'Social linked' : 'No social linked account'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No users available.</div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>User accounting is unavailable.</div>
                )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '14px' }}>
                <h3 style={{ marginTop: 0 }}>Recent Team Access Audit</h3>
                {auditHistory.length > 0 ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {auditHistory.map((record) => (
                            <div key={record.id} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{record.policyKey} · {record.status}</div>
                                <div style={{ fontSize: '14px', fontWeight: 700, marginTop: '4px' }}>{record.title}</div>
                                <div style={{ fontSize: '13px', marginTop: '4px' }}>{record.summary}</div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '6px' }}>
                                    {new Date(record.effectiveFromUtc || record.createdAtUtc).toLocaleString()} by {record.changedByEmail || 'unknown'}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>No team-access audit events yet.</div>
                )}
            </div>
        </div>
    );
};

export default TeamAccessAdminPage;
