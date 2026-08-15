import React, { useEffect, useMemo, useState } from 'react';
import { consumePodcastHandoffDraft } from '../Services/podcastStudioBridge';
import { authService } from '../Services/Auth.jsx';

const teamMembers = [
    { name: 'Maya', role: 'Host', locale: 'New York, USA', device: 'Laptop' },
    { name: 'Luis', role: 'Guest', locale: 'Madrid, Spain', device: 'Tablet' },
    { name: 'Nia', role: 'Producer', locale: 'Nairobi, Kenya', device: 'Phone' },
    { name: 'Ari', role: 'Script Lead', locale: 'Toronto, Canada', device: 'Camera rig' }
];

const scriptBlocks = [
    'Opening hook and audience framing',
    'Guest introduction with context and tone',
    'Three key takeaways and proof points',
    'Call-to-action and audience prompt'
];

const studioModes = ['Phone', 'Tablet', 'Desktop', 'Camera', 'Remote guest'];
const controlRoles = ['Host', 'Producer', 'Editor', 'Guest', 'Script Lead'];

const rolePermissions = {
    Host: { canEditScript: true, canGoLive: true, canAssignShots: true, canApproveSegments: true },
    Producer: { canEditScript: true, canGoLive: true, canAssignShots: true, canApproveSegments: true },
    Editor: { canEditScript: true, canGoLive: false, canAssignShots: true, canApproveSegments: true },
    Guest: { canEditScript: false, canGoLive: false, canAssignShots: false, canApproveSegments: false },
    'Script Lead': { canEditScript: true, canGoLive: false, canAssignShots: true, canApproveSegments: true }
};

const roleLabelToApiRole = {
    Host: 'host',
    Producer: 'producer',
    Editor: 'editor',
    Guest: 'guest',
    'Script Lead': 'script-lead',
    Owner: 'owner'
};

const apiRoleToRoleLabel = {
    owner: 'Owner',
    producer: 'Producer',
    host: 'Host',
    editor: 'Editor',
    guest: 'Guest',
    'script-lead': 'Script Lead'
};

const monitorGrid = [
    { id: 'program', label: 'Program Out', signal: 'Live switching', state: 'Ready' },
    { id: 'guest-a', label: 'Guest Cam A', signal: 'Remote guest mosaic', state: 'Connected' },
    { id: 'guest-b', label: 'Guest Cam B', signal: 'Backup mobile feed', state: 'Standby' },
    { id: 'teleprompter', label: 'Teleprompter', signal: 'Script sync track', state: 'Synced' }
];

const PodcastStudioPage = () => {
    const [title, setTitle] = useState('The Social Creator Teams Brief');
    const [format, setFormat] = useState('Interview');
    const [status, setStatus] = useState('Ready to record');
    const [selectedMode, setSelectedMode] = useState('Desktop');
    const [scriptText, setScriptText] = useState(
        'Welcome to today\'s episode. We are building a creator operating system that helps teams produce, publish, and grow from anywhere.'
    );
    const [controlRole, setControlRole] = useState('Producer');
    const [storyAngle, setStoryAngle] = useState('Community impact and verified eyewitness accounts');
    const [urgency, setUrgency] = useState('Standard');
    const [syncSource, setSyncSource] = useState('local');
    const [syncError, setSyncError] = useState('');
    const [syncingRole, setSyncingRole] = useState('');
    const [allowedRoleLabels, setAllowedRoleLabels] = useState(controlRoles);

    const [permissions, setPermissions] = useState(rolePermissions.Producer);

    const normalizePermissions = (value) => ({
        canGoLive: Boolean(value?.canGoLive),
        canEditScript: Boolean(value?.canEditScript),
        canAssignShots: Boolean(value?.canAssignShots),
        canApproveSegments: Boolean(value?.canApproveSegments)
    });

    const applyPolicyState = (state) => {
        const resolvedLabel = apiRoleToRoleLabel[String(state?.effectiveRole || '').trim().toLowerCase()] || 'Guest';
        const allowedRoles = Array.isArray(state?.allowedRoles)
            ? state.allowedRoles
                .map((role) => apiRoleToRoleLabel[String(role || '').trim().toLowerCase()])
                .filter(Boolean)
            : [];

        setControlRole(resolvedLabel);
        setAllowedRoleLabels(allowedRoles.length > 0 ? allowedRoles : ['Guest']);
        setPermissions(normalizePermissions(state?.permissions));
        setSyncSource(state?.isFallback ? 'fallback' : 'server');
        setSyncError('');
    };

    const loadPodcastControlPolicy = async () => {
        try {
            const state = await authService.getPodcastControlState();
            applyPolicyState(state);
        } catch (error) {
            setSyncSource('error');
            setSyncError(error?.message || 'Unable to sync podcast control policy.');
            setControlRole('Guest');
            setAllowedRoleLabels(['Guest']);
            setPermissions(normalizePermissions(rolePermissions.Guest));
        }
    };

    const changeControlRole = async (nextRoleLabel) => {
        if (syncSource === 'server') {
            try {
                setSyncingRole(nextRoleLabel);
                const requestedRole = roleLabelToApiRole[nextRoleLabel] || 'guest';
                const response = await authService.requestPodcastControlRole(requestedRole);

                applyPolicyState({
                    effectiveRole: response?.grantedRole,
                    allowedRoles: response?.allowedRoles,
                    permissions: response?.permissions,
                    isFallback: false
                });
                setStatus(`Role switched to ${apiRoleToRoleLabel[String(response?.grantedRole || '').toLowerCase()] || 'Guest'}.`);
            } catch (error) {
                setSyncError(error?.message || 'Role switch failed.');
            } finally {
                setSyncingRole('');
            }
            return;
        }

        setControlRole(nextRoleLabel);
        setPermissions(normalizePermissions(rolePermissions[nextRoleLabel] || rolePermissions.Guest));
    };

    useEffect(() => {
        loadPodcastControlPolicy();
    }, []);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            loadPodcastControlPolicy();
        }, 45000);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                loadPodcastControlPolicy();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    useEffect(() => {
        const handoff = consumePodcastHandoffDraft();
        if (!handoff) {
            return;
        }

        if (handoff.title) {
            setTitle(handoff.title);
        }

        if (handoff.angle) {
            setStoryAngle(handoff.angle);
        }

        if (handoff.urgency) {
            setUrgency(handoff.urgency);
        }

        if (handoff.notes) {
            setScriptText((previous) => `${previous}\n\nProducer handoff notes:\n${handoff.notes}`.trim());
        }

        setStatus(`Dispatch handoff received (${handoff.urgency || 'Standard'})`);
    }, []);

    const audienceSummary = useMemo(() => ({
        segments: scriptBlocks.length,
        collaborators: teamMembers.length,
        locales: new Set(teamMembers.map(member => member.locale)).size
    }), []);

    const stats = [
        { label: 'Active team', value: `${teamMembers.length}` },
        { label: 'Locales', value: `${audienceSummary.locales}` },
        { label: 'Script segments', value: `${audienceSummary.segments}` },
        { label: 'Recording modes', value: `${studioModes.length}` }
    ];

    return (
        <div style={{ display: 'grid', gap: '20px' }}>
            <div
                style={{
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(14, 116, 144, 0.25), rgba(15, 23, 42, 0.9))',
                    border: '1px solid var(--border-color)',
                    borderRadius: '18px',
                    padding: '20px',
                    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                        <div style={{ fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                            Podcast Studio
                        </div>
                        <h2 style={{ margin: '8px 0 0', fontSize: '28px' }}>Social Creator Teams</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            if (!permissions.canGoLive) {
                                setStatus(`${controlRole} cannot start live recording. Switch to Host or Producer.`);
                                return;
                            }

                            setStatus('Recording live session');
                        }}
                        style={{
                            border: 'none',
                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                            color: '#fff',
                            borderRadius: '999px',
                            padding: '10px 16px',
                            fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        Start recording
                    </button>
                </div>
                <div style={{ marginTop: '18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            style={{
                                background: 'rgba(15, 23, 42, 0.4)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '12px 14px'
                            }}
                        >
                            <div style={{ color: 'var(--light-color)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                {stat.label}
                            </div>
                            <div style={{ fontSize: '26px', fontWeight: 800, marginTop: '6px' }}>{stat.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                    Multi-monitor vision wall
                </div>
                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    {monitorGrid.map((monitor) => (
                        <div key={monitor.id} style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '12px',
                            padding: '12px',
                            background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))'
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--light-color)' }}>{monitor.label}</div>
                            <div style={{ marginTop: '8px', fontWeight: 700 }}>{monitor.signal}</div>
                            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--light-color)' }}>Status: {monitor.state}</div>
                        </div>
                    ))}
                </div>
                <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Live social monitor</div>
                        <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>Trending mentions and comments are pinned here for host prompts and fact checks.</div>
                    </div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Shot queue monitor</div>
                        <div style={{ color: 'var(--light-color)', fontSize: '13px' }}>Producers can sequence A-roll, guest reaction, and lower-third overlays in this queue.</div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                        Studio session
                    </div>

                    <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                        <div style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Control role</span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {allowedRoleLabels.map((role) => (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => changeControlRole(role)}
                                        disabled={Boolean(syncingRole)}
                                        style={{
                                            border: controlRole === role ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: controlRole === role ? 'rgba(255,255,255,0.08)' : 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '8px 12px',
                                            cursor: syncingRole ? 'wait' : 'pointer',
                                            opacity: syncingRole && syncingRole !== role ? 0.7 : 1
                                        }}
                                    >
                                        {role}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Podcast title</span>
                            <input
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)'
                                }}
                            />
                        </label>

                        <div style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Format</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {['Interview', 'Solo', 'Panel', 'Roundtable'].map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        onClick={() => setFormat(option)}
                                        style={{
                                            border: option === format ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: option === format ? 'rgba(255,255,255,0.06)' : 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '8px 12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Recording devices</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {studioModes.map((mode) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setSelectedMode(mode)}
                                        style={{
                                            border: selectedMode === mode ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: selectedMode === mode ? 'rgba(255,255,255,0.06)' : 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '8px 12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Story angle</span>
                            <input
                                value={storyAngle}
                                onChange={(event) => setStoryAngle(event.target.value)}
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)'
                                }}
                            />
                        </label>

                        <div style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Dispatch urgency</span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {['Breaking', 'Standard', 'Feature'].map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setUrgency(value)}
                                        style={{
                                            border: urgency === value ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                            background: urgency === value ? 'rgba(255,255,255,0.06)' : 'transparent',
                                            color: 'var(--text-color)',
                                            borderRadius: '999px',
                                            padding: '8px 12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {value}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <label style={{ display: 'grid', gap: '6px' }}>
                            <span style={{ color: 'var(--light-color)' }}>Live script</span>
                            <textarea
                                value={scriptText}
                                onChange={(event) => setScriptText(event.target.value)}
                                rows={8}
                                disabled={!permissions.canEditScript}
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)',
                                    resize: 'vertical',
                                    opacity: permissions.canEditScript ? 1 : 0.6
                                }}
                            />
                        </label>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!permissions.canEditScript) {
                                        setStatus(`${controlRole} cannot edit or save script drafts.`);
                                        return;
                                    }

                                    setStatus('Draft saved');
                                }}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    background: 'transparent',
                                    color: 'var(--text-color)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    cursor: 'pointer'
                                }}
                            >
                                Save draft
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!permissions.canAssignShots) {
                                        setStatus(`${controlRole} cannot assign script actions.`);
                                        return;
                                    }

                                    setStatus('Script synced to team');
                                }}
                                style={{
                                    border: '1px solid var(--highlight-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    cursor: 'pointer'
                                }}
                            >
                                Share script
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!permissions.canApproveSegments) {
                                        setStatus(`${controlRole} cannot approve segment run order.`);
                                        return;
                                    }

                                    setStatus('Segment run order approved');
                                }}
                                style={{
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    cursor: 'pointer'
                                }}
                            >
                                Approve run order
                            </button>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: '20px' }}>
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                            Team room
                        </div>
                        <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                            {teamMembers.map((member) => (
                                <div
                                    key={member.name}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        gap: '12px',
                                        padding: '10px 12px',
                                        borderRadius: '12px',
                                        border: '1px solid var(--border-color)',
                                        background: 'rgba(255,255,255,0.02)'
                                    }}
                                >
                                    <div>
                                        <div style={{ fontWeight: 700 }}>{member.name}</div>
                                        <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>{member.role}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', color: 'var(--light-color)', fontSize: '12px' }}>
                                        <div>{member.locale}</div>
                                        <div>{member.device}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                            Session status
                        </div>
                        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '10px' }}>{status}</div>
                        <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                            Role in control: {controlRole} · Urgency: {urgency}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)' }}>
                            Policy sync: {syncSource === 'server' ? 'server-verified' : syncSource === 'fallback' ? 'token fallback' : syncSource}
                        </div>
                        {syncError && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5' }}>{syncError}</div>
                        )}
                        <div style={{ marginTop: '16px', color: 'var(--light-color)', lineHeight: 1.6 }}>
                            Remote guests can join from different locales, scripts can be assigned to any team member, and recordings can be captured from mobile, tablet, desktop, or camera capture devices.
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                    Script pipeline
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '14px' }}>
                    {scriptBlocks.map((segment, index) => (
                        <div
                            key={segment}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '12px',
                                padding: '12px'
                            }}
                        >
                            <div style={{ fontSize: '12px', color: 'var(--light-color)', marginBottom: '8px' }}>Segment {index + 1}</div>
                            <div>{segment}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PodcastStudioPage;
