import React, { useEffect, useMemo, useRef, useState } from 'react';
import Compartment from '../Components/Common/Compartment';
import { consumePodcastHandoffDraft, queueRavensightTab } from '../Services/podcastStudioBridge';
import { queueCollaborationHandoff } from '../Services/collaborationBridge';
import { authService } from '../Services/Auth.jsx';
import { apiService } from '../Services/api';
import { useAuth } from '../Contexts/AuthContext';
import { upsertLocalVideo, buildLocalFallbackVideo } from '../Services/ravensightVideoStore';
import { ravensightAPI } from '../Services/RavensightAPI';
import { useCollaborationHub } from '../hooks/useCollaborationHub';
import { subscriptionService } from '../Services/subscriptionService';

const initialTeamMembers = [];

const defaultWorkspacePages = [
    { id: 'script-main', type: 'Script', title: '', content: '' }
];

const scriptBlocks = [
    'Opening hook and audience framing',
    'Guest introduction with context and tone',
    'Three key takeaways and proof points',
    'Call-to-action and audience prompt'
];

const scriptPipelineSegments = [
    { key: 'segment1', label: 'Segment 1', helper: 'Opening hook and audience framing' },
    { key: 'segment2', label: 'Segment 2', helper: 'Guest introduction with context and tone' },
    { key: 'segment3', label: 'Segment 3', helper: 'Three key takeaways and proof points' },
    { key: 'segment4', label: 'Segment 4', helper: 'Call-to-action and audience prompt' }
];

const createEmptyScriptPipeline = () => ({
    segment1: '',
    segment2: '',
    segment3: '',
    segment4: ''
});

const SHARED_SCRIPT_STORAGE_KEY = 'wiseSharedPodcastScriptPayload';
const PODCAST_AUTOSAVE_STORAGE_KEY = 'wisePodcastSessionAutosave';
const MAX_REMOTE_GUEST_MONITORS = 3;

const studioModes = ['Phone', 'Tablet', 'Desktop', 'Camera', 'Remote guest'];
const controlRoles = ['Owner', 'Producer', 'Host', 'Editor', 'Script Lead', 'Guest'];

// Each format button generates its namesake episode structure:
// Interview = host + guest with prepared interview questions.
// Solo = one presenter carries the entire podcast.
// Panel = multiple users engaging on the topic.
// Roundtable = a group putting their minds together.
const formatDefinitions = {
    Interview: {
        label: 'Interview',
        icon: '🎤',
        description: 'Host questions a featured guest using prepared interview questions.',
        participants: ['Host', 'Guest'],
        segments: [
            'Interview question 1 — background and context',
            'Interview question 2 — the core story',
            'Interview question 3 — challenges and lessons',
            'Closing question and audience call-to-action'
        ]
    },
    Solo: {
        label: 'Solo',
        icon: '🎙️',
        description: 'One presenter presents the entire podcast end to end.',
        participants: ['Host'],
        segments: [
            'Solo opening hook and framing of the topic',
            'Deep dive — the full story in your own voice',
            'Key takeaways for the audience',
            'Solo closing and call-to-action'
        ]
    },
    Panel: {
        label: 'Panel',
        icon: '👥',
        description: 'Multiple users engage and debate the topic together.',
        participants: ['Host', 'Panelist 1', 'Panelist 2', 'Panelist 3'],
        segments: [
            'Panel opening — introduce every panelist',
            'Topic engagement round — each panelist weighs in',
            'Cross-debate — panelists respond to each other',
            'Moderator wrap-up and audience prompt'
        ]
    },
    Roundtable: {
        label: 'Roundtable',
        icon: '🔄',
        description: 'A group puts their minds together toward one goal.',
        participants: ['Host', 'Contributor 1', 'Contributor 2', 'Contributor 3'],
        segments: [
            'Roundtable kickoff — state the shared goal',
            'Mind-share round — everyone contributes ideas',
            'Group synthesis — combine the best thinking',
            'Agreed actions and closing'
        ]
    }
};

// Each urgency button sets its namesake dispatch posture:
// Breaking = breaking news information, fast-tracked.
// Standard = regular cast of issues, normal cadence.
// Feature = special cast, produced as a flagship piece.
const urgencyDefinitions = {
    Breaking: {
        label: 'Breaking',
        icon: '🚨',
        description: 'Breaking-news information — fast-track production and publish ASAP.',
        targetPublishWindow: 'Within 1 hour',
        reviewRequired: false
    },
    Standard: {
        label: 'Standard',
        icon: '📅',
        description: 'Regular cast of issues — normal production cadence.',
        targetPublishWindow: 'Next scheduled slot',
        reviewRequired: true
    },
    Feature: {
        label: 'Feature',
        icon: '⭐',
        description: 'Special cast — flagship treatment with extra polish.',
        targetPublishWindow: 'Curated release date',
        reviewRequired: true
    }
};

// Each control-room button performs its namesake duty:
// Owner = team leader (the signed-in user) with full studio control.
// Producer = produces the show — guests, run order, production calls.
// Host = presents the episode live on camera and mic.
// Editor = edits the script and approves the final segments.
// Script Lead = writes the script and prepares interview questions.
// Guest = joins as a participant with view-only access.
const rolePermissions = {
    Owner: { canGoLive: true, canEditScript: true, canAssignShots: true, canApproveSegments: true, canManageGuests: true },
    Producer: { canGoLive: true, canEditScript: true, canAssignShots: true, canApproveSegments: true, canManageGuests: true },
    Host: { canGoLive: true, canEditScript: false, canAssignShots: true, canApproveSegments: false, canManageGuests: false },
    Editor: { canGoLive: false, canEditScript: true, canAssignShots: false, canApproveSegments: true, canManageGuests: false },
    'Script Lead': { canGoLive: false, canEditScript: true, canAssignShots: false, canApproveSegments: false, canManageGuests: false },
    Guest: { canGoLive: false, canEditScript: false, canAssignShots: false, canApproveSegments: false, canManageGuests: false }
};

const roleDuties = {
    Owner: 'Team leader (signed in) — full control of studio, team and broadcast.',
    Producer: 'Produces the show — manages guests, run order and production calls.',
    Host: 'Presents the episode live on camera and microphone.',
    Editor: 'Edits the script and approves the final segments.',
    'Script Lead': 'Writes the script and prepares the interview questions.',
    Guest: 'Joins as a featured guest with view-only studio access.'
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

// Podcast Studio Pricing Plans
const PODCAST_PRICING_PLANS = {
    growthSuite: {
        id: 'growth-suite',
        name: 'Growth Suite',
        tagline: 'Unlock trending analytics & audience insights',
        features: [
            'Growth analytics & trending content dashboard',
            'Audience sentiment tracking across platforms',
            '30-day performance history',
            'Topic recommendations based on trends',
            'Monthly download reports'
        ],
        prices: {
            monthly: 4900, // $49/month
            annual: 49000  // $490/year (saves $98/year)
        },
        trial: {
            days: 14,
            message: 'Try Growth Suite for 14 days free — no credit card required'
        }
    },
    studio_plus: {
        id: 'studio-plus',
        name: 'Studio Plus',
        tagline: 'Bring reviewers, editors, and team operators into one lane',
        features: [
            'Team review workflows (unlimited reviewers)',
            'Assignment & approval chains',
            'Permission-based editing roles',
            'Team member analytics & activity logs',
            'Multi-role simultaneous editing',
            'Team workspace with shared assets'
        ],
        prices: {
            monthly: 9900, // $99/month
            annual: 99000  // $990/year (saves $198/year)
        },
        trial: {
            days: 7,
            message: 'Try Studio Plus for 7 days free — invite your team'
        }
    },
    podcast_pro: {
        id: 'podcast-pro',
        name: 'Podcast Pro Bundle',
        tagline: 'Growth Suite + Studio Plus + priority support',
        features: [
            'Everything in Growth Suite',
            'Everything in Studio Plus',
            '24/7 priority email support',
            'Monthly strategy calls with our team',
            'Custom episode templates',
            'Advanced analytics export'
        ],
        prices: {
            monthly: 14900, // $149/month (save $35 vs individual)
            annual: 149000  // $1,490/year (saves $470/year)
        },
        trial: {
            days: 30,
            message: 'Try Podcast Pro for 30 days free — full feature access'
        },
        featured: true
    }
};

const normalizeLoginIdentifier = (value) => String(value || '').trim().toLowerCase().replace(/^@/, '');

const inferIdentifierType = (identifier) => {
    const value = String(identifier || '').trim();
    if (!value) return 'manual';
    if (value.includes('@')) return 'email';
    if (value.startsWith('@')) return 'handle';
    return 'username';
};

const resolveMemberKey = (member) => normalizeLoginIdentifier(
    member?.identifier || member?.email || member?.handle || member?.username || member?.name || ''
);

const createWorkspacePage = (type, title = '') => {
    const normalizedType = String(type || 'Script').trim() || 'Script';
    const label = String(title || '').trim() || `${normalizedType} ${new Date().toLocaleTimeString()}`;
    return {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: normalizedType,
        title: label,
        content: ''
    };
};

const resolveUploadedMediaUrl = (payload, fallback = '') => {
    const source = payload && typeof payload === 'object' ? payload : {};
    const direct = String(
        source.mediaUrl
        || source.filePath
        || source.file?.mediaUrl
        || source.file?.MediaUrl
        || source.file?.publicUrl
        || source.file?.PublicUrl
        || source.video?.videoUrl
        || source.video?.VideoUrl
        || source.video?.mediaUrl
        || source.video?.MediaUrl
        || source.video?.filePath
        || ''
    ).trim();
    if (direct) {
        return direct;
    }

    const relativePath = String(source.file?.relativePath || source.file?.RelativePath || '').trim();
    if (relativePath) {
        const encoded = relativePath
            .replace(/\\/g, '/')
            .split('/')
            .filter(Boolean)
            .map((segment) => encodeURIComponent(segment))
            .join('/');
        if (encoded) {
            return `/api/videostreaming/blob/${encoded}`;
        }
    }

    const fileName = String(source.fileName || source.file?.fileName || source.video?.fileName || '').trim();
    if (fileName) {
        return `/api/videostreaming/stream?fileName=${encodeURIComponent(fileName)}`;
    }

    return fallback;
};

const PodcastStudioPage = ({ onNavigate }) => {
    const { user } = useAuth();
    const [title, setTitle] = useState('');
    const [format, setFormat] = useState('Interview');
    const [status, setStatus] = useState('Ready to record');
    const [selectedMode, setSelectedMode] = useState('Desktop');
    const [scriptText, setScriptText] = useState('');
    const [scriptPipeline, setScriptPipeline] = useState(createEmptyScriptPipeline);
    const [controlRole, setControlRole] = useState('Owner');
    const [storyAngle, setStoryAngle] = useState('');
    const [urgency, setUrgency] = useState('Standard');
    const [syncSource, setSyncSource] = useState('local');
    const [syncError, setSyncError] = useState('');
    const [workflowStage, setWorkflowStage] = useState('Team');
    const [teamCreatorId, setTeamCreatorId] = useState('');
    const [teamCreatorLabel, setTeamCreatorLabel] = useState('');
    const [designeeKeys, setDesigneeKeys] = useState([]);
    const [workspacePages, setWorkspacePages] = useState(defaultWorkspacePages);
    const [activeWorkspacePageId, setActiveWorkspacePageId] = useState('script-main');
    const [quickJoinInput, setQuickJoinInput] = useState('');
    const [syncingRole, setSyncingRole] = useState('');
    const [allowedRoleLabels, setAllowedRoleLabels] = useState(controlRoles);
    const [permissions, setPermissions] = useState(rolePermissions.Owner);

    // Pricing & Subscription State
    const [showPricingModal, setShowPricingModal] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [billingCycle, setBillingCycle] = useState('monthly');
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);
    const [subscriptionStatusLoading, setSubscriptionStatusLoading] = useState(true);

    // Recording State
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordedChunks, setRecordedChunks] = useState([]);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);
    const [recordedBlob, setRecordedBlob] = useState(null);
    const [isCameraOn, setIsCameraOn] = useState(true);
    const [isMuted, setIsMuted] = useState(false);
    const [videoTitle, setVideoTitle] = useState('');
    const [isSavingRecording, setIsSavingRecording] = useState(false);
    const [hasSavedRecording, setHasSavedRecording] = useState(false);
    const [savedRecordingMediaUrl, setSavedRecordingMediaUrl] = useState('');
    const [isPublishingEpisodePost, setIsPublishingEpisodePost] = useState(false);

    // Guest & Remote Controls State
    const [guestCamOn, setGuestCamOn] = useState(true);
    const [guestMuted, setGuestMuted] = useState(false);
    const [guestConnected, setGuestConnected] = useState(true);
    const [runOrderApproved, setRunOrderApproved] = useState(false);
    const [activeShotOverlay, setActiveShotOverlay] = useState('A-Roll');

    // Tandem Sync State (Username / Email Pairing)
    const [syncInput, setSyncInput] = useState('');
    const [syncRole, setSyncRole] = useState('Guest');
    const [teamMembersList, setTeamMembersList] = useState(initialTeamMembers);
    const [teamDirectory, setTeamDirectory] = useState([]);
    const [tandemSyncedAt, setTandemSyncedAt] = useState(null);
    const [syncMessage, setSyncMessage] = useState('');
    const [guestNameInput, setGuestNameInput] = useState('');
    const [newPageType, setNewPageType] = useState('Script');
    const [newPageTitle, setNewPageTitle] = useState('');
    const [lastAutosavedAt, setLastAutosavedAt] = useState('');
    const [podcastBridgeState, setPodcastBridgeState] = useState({
        connected: false,
        roomKey: 'main',
        activeFootage: null,
        latestCommand: null,
        commandResponses: []
    });

    // Refs
    const videoRef = useRef(null);
    const guestVideoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const broadcastChannelRef = useRef(null);
    const sharedScriptVersionRef = useRef('');
    const autosaveVersionRef = useRef('');
    const autosaveRestoreAppliedRef = useRef(false);
    const podcastBridgeVideoRef = useRef(null);
    const {
        joinPodcastBridge,
        leavePodcastBridge,
        issuePodcastCommand,
        onEvent
    } = useCollaborationHub();

    const actorKeys = useMemo(() => {
        const keys = [
            normalizeLoginIdentifier(user?.id),
            normalizeLoginIdentifier(user?.email),
            normalizeLoginIdentifier(user?.handle),
            normalizeLoginIdentifier(user?.username),
            normalizeLoginIdentifier(user?.displayName),
            normalizeLoginIdentifier(user?.name)
        ].filter(Boolean);
        return Array.from(new Set(keys));
    }, [user]);

    const creatorKey = normalizeLoginIdentifier(teamCreatorId);
    const isCreator = Boolean(creatorKey) && actorKeys.includes(creatorKey);
    const isDesignee = designeeKeys.some((key) => actorKeys.includes(normalizeLoginIdentifier(key)));
    const canApproveWorkflow = isCreator || isDesignee;
    const canEditScriptPipeline = permissions.canEditScript || isCreator || isDesignee;
    const canEditLiveScript = canEditScriptPipeline || workflowStage === 'Team';
    const canForceShutdownFeed = (isCreator || isDesignee) && ['Owner', 'Producer', 'Editor'].includes(controlRole);
    const activeRemoteGuests = teamMembersList.filter((member) => (
        String(member?.role || '').toLowerCase() === 'guest' && member?.coupled !== false
    ));
    const splitGuestMonitors = Array.from({ length: MAX_REMOTE_GUEST_MONITORS }, (_, index) => activeRemoteGuests[index] || null);

    const activeWorkspacePage = workspacePages.find((page) => page.id === activeWorkspacePageId) || workspacePages[0] || null;

    const buildSessionSnapshot = () => ({
        title,
        format,
        scriptText,
        scriptPipeline,
        storyAngle,
        urgency,
        selectedMode,
        runOrderApproved,
        teamMembersList,
        teamCreatorId,
        teamCreatorLabel,
        designeeKeys,
        workspacePages,
        activeWorkspacePageId,
        workflowStage,
        isCameraOn,
        isMuted,
        guestCamOn,
        guestMuted,
        guestConnected
    });

    const applySessionSnapshot = (snapshot) => {
        if (!snapshot || typeof snapshot !== 'object') {
            return;
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, 'title')) setTitle(String(snapshot.title || ''));
        if (snapshot.format && formatDefinitions[snapshot.format]) setFormat(snapshot.format);
        if (Object.prototype.hasOwnProperty.call(snapshot, 'scriptText')) setScriptText(String(snapshot.scriptText || ''));

        if (snapshot.scriptPipeline && typeof snapshot.scriptPipeline === 'object') {
            setScriptPipeline({
                segment1: String(snapshot.scriptPipeline.segment1 || ''),
                segment2: String(snapshot.scriptPipeline.segment2 || ''),
                segment3: String(snapshot.scriptPipeline.segment3 || ''),
                segment4: String(snapshot.scriptPipeline.segment4 || '')
            });
        }

        if (Object.prototype.hasOwnProperty.call(snapshot, 'storyAngle')) setStoryAngle(String(snapshot.storyAngle || ''));
        if (snapshot.urgency) setUrgency(String(snapshot.urgency));
        if (snapshot.selectedMode) setSelectedMode(String(snapshot.selectedMode));
        if (typeof snapshot.runOrderApproved === 'boolean') setRunOrderApproved(snapshot.runOrderApproved);
        if (Array.isArray(snapshot.teamMembersList)) setTeamMembersList(snapshot.teamMembersList);
        if (Object.prototype.hasOwnProperty.call(snapshot, 'teamCreatorId')) setTeamCreatorId(String(snapshot.teamCreatorId || ''));
        if (Object.prototype.hasOwnProperty.call(snapshot, 'teamCreatorLabel')) setTeamCreatorLabel(String(snapshot.teamCreatorLabel || ''));
        if (Array.isArray(snapshot.designeeKeys)) setDesigneeKeys(snapshot.designeeKeys.map((item) => normalizeLoginIdentifier(item)).filter(Boolean));
        if (Array.isArray(snapshot.workspacePages) && snapshot.workspacePages.length > 0) setWorkspacePages(snapshot.workspacePages);
        if (snapshot.activeWorkspacePageId) setActiveWorkspacePageId(String(snapshot.activeWorkspacePageId));
        if (snapshot.workflowStage) setWorkflowStage(String(snapshot.workflowStage));
        if (typeof snapshot.isCameraOn === 'boolean') setIsCameraOn(snapshot.isCameraOn);
        if (typeof snapshot.isMuted === 'boolean') setIsMuted(snapshot.isMuted);
        if (typeof snapshot.guestCamOn === 'boolean') setGuestCamOn(snapshot.guestCamOn);
        if (typeof snapshot.guestMuted === 'boolean') setGuestMuted(snapshot.guestMuted);
        if (typeof snapshot.guestConnected === 'boolean') setGuestConnected(snapshot.guestConnected);
    };

    useEffect(() => {
        if (teamCreatorId || !user?.id) {
            return;
        }

        const creatorId = String(user.id);
        const creatorName = String(user?.name || user?.displayName || user?.username || user?.email || 'Team Creator');
        setTeamCreatorId(creatorId);
        setTeamCreatorLabel(creatorName);
    }, [teamCreatorId, user]);

    useEffect(() => {
        if (!activeWorkspacePageId && workspacePages[0]?.id) {
            setActiveWorkspacePageId(workspacePages[0].id);
        }

        if (activeWorkspacePageId && !workspacePages.some((page) => page.id === activeWorkspacePageId)) {
            setActiveWorkspacePageId(workspacePages[0]?.id || '');
        }
    }, [activeWorkspacePageId, workspacePages]);

    useEffect(() => {
        if (activeWorkspacePage?.type !== 'Script') {
            return;
        }

        const pageContent = String(activeWorkspacePage?.content || '');
        if (pageContent !== scriptText) {
            setScriptText(pageContent);
        }
    }, [activeWorkspacePage, scriptText]);

    const normalizePermissions = (value) => ({
        canGoLive: Boolean(value?.canGoLive),
        canEditScript: Boolean(value?.canEditScript),
        canAssignShots: Boolean(value?.canAssignShots),
        canApproveSegments: Boolean(value?.canApproveSegments)
    });

    const resolveLoginStatus = (identifier) => {
        const normalizedIdentifier = normalizeLoginIdentifier(identifier);
        const currentIdentifiers = [
            normalizeLoginIdentifier(user?.email),
            normalizeLoginIdentifier(user?.handle),
            normalizeLoginIdentifier(user?.name),
            normalizeLoginIdentifier(user?.displayName)
        ].filter(Boolean);

        if (normalizedIdentifier && currentIdentifiers.includes(normalizedIdentifier)) {
            return { loginState: 'online', loginStatus: 'Logged in now' };
        }

        const match = teamDirectory.find((member) => {
            const directoryIdentifiers = [
                normalizeLoginIdentifier(member?.email),
                normalizeLoginIdentifier(member?.handle),
                normalizeLoginIdentifier(member?.name)
            ].filter(Boolean);
            return normalizedIdentifier && directoryIdentifiers.includes(normalizedIdentifier);
        });

        if (match) {
            const connected = Boolean(match?.isOnline || match?.isActive || String(match?.status || '').toLowerCase() === 'online');
            return connected
                ? { loginState: 'online', loginStatus: 'Directory login active' }
                : { loginState: 'identified', loginStatus: 'Directory account identified' };
        }

        return normalizedIdentifier
            ? { loginState: 'pending', loginStatus: 'Awaiting login in room' }
            : { loginState: 'manual', loginStatus: 'Manual pair (no login ID)' };
    };

    const upsertTeamMember = ({ identifier, name, role, locale, device, status, loginState, loginStatus }) => {
        const normalizedIdentifier = normalizeLoginIdentifier(identifier || '');
        const normalizedName = String(name || '').trim().toLowerCase();
        const deduped = teamMembersList.filter((member) => {
            const memberIdentifier = normalizeLoginIdentifier(member?.identifier || '');
            const memberName = String(member?.name || '').trim().toLowerCase();
            if (normalizedIdentifier && memberIdentifier === normalizedIdentifier) return false;
            if (!normalizedIdentifier && normalizedName && memberName === normalizedName) return false;
            return true;
        });

        return [{
            name,
            role,
            locale,
            device,
            status,
            syncedAt: new Date().toLocaleTimeString(),
            identifier: identifier || '',
            identifierType: inferIdentifierType(identifier),
            loginState,
            loginStatus,
            coupled: true
        }, ...deduped];
    };

    const matchDirectoryMember = (identifier) => {
        const normalizedIdentifier = normalizeLoginIdentifier(identifier);
        if (!normalizedIdentifier) {
            return null;
        }

        return teamDirectory.find((member) => {
            const directoryIdentifiers = [
                normalizeLoginIdentifier(member?.email),
                normalizeLoginIdentifier(member?.handle),
                normalizeLoginIdentifier(member?.username),
                normalizeLoginIdentifier(member?.name),
                normalizeLoginIdentifier(member?.displayName)
            ].filter(Boolean);

            return directoryIdentifiers.includes(normalizedIdentifier);
        }) || null;
    };

    const applyPolicyState = (state) => {
        const serverRoleLabel = apiRoleToRoleLabel[String(state?.effectiveRole || '').trim().toLowerCase()] || 'Guest';
        const resolvedLabel = (isCreator && serverRoleLabel === 'Guest') ? 'Owner' : serverRoleLabel;
        const allowedRoles = Array.isArray(state?.allowedRoles)
            ? state.allowedRoles
                .map((role) => apiRoleToRoleLabel[String(role || '').trim().toLowerCase()])
                .filter(Boolean)
            : [];
        const mergedAllowedRoles = resolvedLabel === 'Owner' && !allowedRoles.includes('Owner')
            ? ['Owner', ...allowedRoles]
            : allowedRoles;

        setControlRole(resolvedLabel);
        setAllowedRoleLabels(mergedAllowedRoles.length > 0 ? mergedAllowedRoles : [resolvedLabel]);
        setPermissions(normalizePermissions(state?.permissions));
        setSyncSource(state?.isFallback ? 'fallback' : 'server');
        setSyncError('');
    };

    const loadPodcastControlPolicy = async () => {
        try {
            const state = await authService.getPodcastControlState();
            // The signed-in user is the team leader (Owner) unless the server says otherwise.
            const serverRoleLabel = apiRoleToRoleLabel[String(state?.effectiveRole || '').trim().toLowerCase()] || 'Owner';
            const resolvedLabel = (isCreator && serverRoleLabel === 'Guest') ? 'Owner' : serverRoleLabel;
            let allowedRoles = Array.isArray(state?.allowedRoles) && state.allowedRoles.length > 0
                ? state.allowedRoles
                    .map((role) => apiRoleToRoleLabel[String(role || '').trim().toLowerCase()])
                    .filter(Boolean)
                : controlRoles;
            if (resolvedLabel === 'Owner' && !allowedRoles.includes('Owner')) {
                allowedRoles = ['Owner', ...allowedRoles];
            }

            setAllowedRoleLabels(allowedRoles);
            setPermissions(rolePermissions[resolvedLabel] || rolePermissions.Owner);
            setControlRole(resolvedLabel);
            setSyncSource(state?.isFallback ? 'fallback' : 'server');
            setSyncError('');
        } catch {
            setSyncSource('local');
            setAllowedRoleLabels(controlRoles);
            setControlRole('Owner');
            setPermissions(rolePermissions.Owner);
        }
    };

    const changeControlRole = async (nextRoleLabel) => {
        const nextPermissions = rolePermissions[nextRoleLabel] || rolePermissions.Guest;
        setControlRole(nextRoleLabel);
        setPermissions(nextPermissions);
        setStatus(roleDuties[nextRoleLabel] || `Control role switched to ${nextRoleLabel}.`);
        broadcastTandemState({ controlRole: nextRoleLabel });

        if (syncSource === 'server') {
            try {
                setSyncingRole(nextRoleLabel);
                const requestedRole = roleLabelToApiRole[nextRoleLabel] || 'guest';
                await authService.requestPodcastControlRole(requestedRole);
            } catch {
                // Keep local role active
            } finally {
                setSyncingRole('');
            }
        }
    };

    // Tandem Real-Time State Broadcast (BroadcastChannel & LocalStorage Fallback)
    const broadcastTandemState = (overrides = {}) => {
        const payload = {
            type: 'PODCAST_TANDEM_SYNC',
            title: overrides.title ?? title,
            format: overrides.format ?? format,
            scriptText: overrides.scriptText ?? scriptText,
            scriptPipeline: overrides.scriptPipeline ?? scriptPipeline,
            storyAngle: overrides.storyAngle ?? storyAngle,
            urgency: overrides.urgency ?? urgency,
            selectedMode: overrides.selectedMode ?? selectedMode,
            runOrderApproved: overrides.runOrderApproved ?? runOrderApproved,
            hasSavedRecording: overrides.hasSavedRecording ?? hasSavedRecording,
            teamMembersList: overrides.teamMembersList ?? teamMembersList,
            teamCreatorId: overrides.teamCreatorId ?? teamCreatorId,
            teamCreatorLabel: overrides.teamCreatorLabel ?? teamCreatorLabel,
            designeeKeys: overrides.designeeKeys ?? designeeKeys,
            workspacePages: overrides.workspacePages ?? workspacePages,
            activeWorkspacePageId: overrides.activeWorkspacePageId ?? activeWorkspacePageId,
            workflowStage: overrides.workflowStage ?? workflowStage,
            isCameraOn: overrides.isCameraOn ?? isCameraOn,
            isMuted: overrides.isMuted ?? isMuted,
            guestCamOn: overrides.guestCamOn ?? guestCamOn,
            guestMuted: overrides.guestMuted ?? guestMuted,
            guestConnected: overrides.guestConnected ?? guestConnected,
            forceStopCamera: Boolean(overrides.forceStopCamera),
            forceStopFeed: Boolean(overrides.forceStopFeed),
            senderRole: controlRole,
            timestamp: new Date().toISOString()
        };

        if (broadcastChannelRef.current) {
            try {
                broadcastChannelRef.current.postMessage(payload);
            } catch {
                // Ignore fallback
            }
        }

        try {
            localStorage.setItem('wisePodcastTandemState', JSON.stringify(payload));
        } catch {
            // Best effort
        }

        setTandemSyncedAt(new Date().toLocaleTimeString());
    };

    const applyFeedShutdown = (statusMessage) => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
            } catch {
                // Ignore stop errors while forcing feed shutdown.
            }
        }

        if (timerRef.current) {
            clearInterval(timerRef.current);
        }

        if (streamRef.current) {
            try {
                streamRef.current.getTracks().forEach((track) => track.stop());
            } catch {
                // Ignore track shutdown errors.
            }
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        if (guestVideoRef.current) {
            guestVideoRef.current.srcObject = null;
        }

        setIsRecording(false);
        setIsPaused(false);
        setIsCameraOn(false);
        setIsMuted(true);
        setGuestCamOn(false);
        setGuestMuted(true);
        setGuestConnected(false);
        setStatus(statusMessage);
    };

    const handleForceShutdownFeed = () => {
        if (!canForceShutdownFeed) {
            setStatus('Only upper-level designated studio members can shut down camera and footage feeds.');
            return;
        }

        void issueControlCommand('cut', 'Upper-level shutdown requested.');
        applyFeedShutdown('Studio camera and footage feeds shut down by upper-level control.');
        broadcastTandemState({
            isCameraOn: false,
            isMuted: true,
            guestCamOn: false,
            guestMuted: true,
            guestConnected: false,
            forceStopCamera: true,
            forceStopFeed: true
        });
    };

    const handleStartTrial = async (planKey) => {
        try {
            const planPriceIdMap = {
                'growth_suite': process.env.REACT_APP_STRIPE_GROWTH_SUITE_PRICE_ID || 'price_growth_suite',
                'studio_plus': process.env.REACT_APP_STRIPE_STUDIO_PLUS_PRICE_ID || 'price_studio_plus',
                'podcast_pro': process.env.REACT_APP_STRIPE_PODCAST_PRO_PRICE_ID || 'price_podcast_pro'
            };

            const priceId = planPriceIdMap[planKey];
            const successUrl = `${window.location.origin}/podcast-studio?checkout=success`;
            const cancelUrl = `${window.location.origin}/podcast-studio?checkout=cancel`;

            const result = await subscriptionService.createCheckoutSession({
                priceId,
                successUrl,
                cancelUrl,
                plan: planKey,
                billingCycle: billingCycle
            });

            if (result?.url) {
                window.location.href = result.url;
            }
        } catch (error) {
            console.error('Checkout error:', error);
            setStatus(`Unable to start checkout: ${error?.message || 'Unknown error'}`);
        }
    };

    const issueControlCommand = async (command, note = '') => {
        try {
            await issuePodcastCommand('main', command, note, '');
            setStatus(`Command sent to videographer: ${String(command || '').toUpperCase()}`);
        } catch (error) {
            setStatus(error?.message || 'Unable to send command to videographer right now.');
        }
    };

    useEffect(() => {
        if (!teamCreatorId || !teamCreatorLabel) {
            return;
        }

        broadcastTandemState({ teamCreatorId, teamCreatorLabel });
    }, [teamCreatorId, teamCreatorLabel]);

    useEffect(() => {
        joinPodcastBridge('main')
            .then(() => {
                setPodcastBridgeState((prev) => ({ ...prev, connected: true }));
            })
            .catch(() => {
                setPodcastBridgeState((prev) => ({ ...prev, connected: false }));
            });

        const disposeSnapshot = onEvent('PodcastBridgeSnapshot', (payload) => {
            const commandLog = Array.isArray(payload?.commandLog) ? payload.commandLog : [];
            const latestCommand = commandLog.length > 0 ? commandLog[commandLog.length - 1] : null;
            setPodcastBridgeState((prev) => ({
                ...prev,
                connected: true,
                roomKey: String(payload?.roomKey || 'main'),
                activeFootage: payload?.activeFootage || null,
                latestCommand,
                commandResponses: latestCommand?.responses || []
            }));
        });

        const disposeFootage = onEvent('PodcastFootageSelected', (payload) => {
            setPodcastBridgeState((prev) => ({
                ...prev,
                connected: true,
                roomKey: String(payload?.roomKey || 'main'),
                activeFootage: payload?.footage || null
            }));
            if (payload?.footage?.title) {
                setStatus(`Podcast bridge switched to footage: ${payload.footage.title}`);
            }
        });

        const disposeCommand = onEvent('PodcastCommandIssued', (payload) => {
            const command = payload?.command || null;
            setPodcastBridgeState((prev) => ({
                ...prev,
                latestCommand: command,
                commandResponses: command?.responses || []
            }));

            if (String(command?.command || '').toLowerCase() === 'cut') {
                applyFeedShutdown('CUT command received. Local camera and feed were stopped.');
            }
        });

        const disposeResponse = onEvent('PodcastCommandResponse', (payload) => {
            const command = payload?.command || null;
            setPodcastBridgeState((prev) => ({
                ...prev,
                latestCommand: command,
                commandResponses: command?.responses || []
            }));
        });

        return () => {
            disposeSnapshot?.();
            disposeFootage?.();
            disposeCommand?.();
            disposeResponse?.();
            leavePodcastBridge('main').catch(() => null);
        };
    }, [joinPodcastBridge, leavePodcastBridge, onEvent]);

    useEffect(() => {
        loadPodcastControlPolicy();

        try {
            const channel = new BroadcastChannel('wiseraven_podcast_tandem_sync');
            broadcastChannelRef.current = channel;

            channel.onmessage = (event) => {
                const data = event.data;
                if (data?.type === 'PODCAST_TANDEM_SYNC') {
                    if (data.title) setTitle(data.title);
                    if (data.format && formatDefinitions[data.format]) setFormat(data.format);
                    if (Object.prototype.hasOwnProperty.call(data, 'scriptText')) setScriptText(String(data.scriptText || ''));
                    if (data.scriptPipeline && typeof data.scriptPipeline === 'object') {
                        setScriptPipeline({
                            segment1: String(data.scriptPipeline.segment1 || ''),
                            segment2: String(data.scriptPipeline.segment2 || ''),
                            segment3: String(data.scriptPipeline.segment3 || ''),
                            segment4: String(data.scriptPipeline.segment4 || '')
                        });
                    }
                    if (data.storyAngle) setStoryAngle(data.storyAngle);
                    if (data.urgency) setUrgency(data.urgency);
                    if (data.selectedMode) setSelectedMode(data.selectedMode);
                    if (typeof data.isCameraOn === 'boolean') setIsCameraOn(data.isCameraOn);
                    if (typeof data.isMuted === 'boolean') setIsMuted(data.isMuted);
                    if (typeof data.guestCamOn === 'boolean') setGuestCamOn(data.guestCamOn);
                    if (typeof data.guestMuted === 'boolean') setGuestMuted(data.guestMuted);
                    if (typeof data.guestConnected === 'boolean') setGuestConnected(data.guestConnected);
                    if (typeof data.runOrderApproved === 'boolean') setRunOrderApproved(data.runOrderApproved);
                    if (typeof data.hasSavedRecording === 'boolean') setHasSavedRecording(data.hasSavedRecording);
                    if (Array.isArray(data.teamMembersList)) setTeamMembersList(data.teamMembersList);
                    if (data.teamCreatorId) setTeamCreatorId(String(data.teamCreatorId));
                    if (data.teamCreatorLabel) setTeamCreatorLabel(String(data.teamCreatorLabel));
                    if (Array.isArray(data.designeeKeys)) setDesigneeKeys(data.designeeKeys.map((item) => normalizeLoginIdentifier(item)).filter(Boolean));
                    if (Array.isArray(data.workspacePages) && data.workspacePages.length > 0) setWorkspacePages(data.workspacePages);
                    if (data.activeWorkspacePageId) setActiveWorkspacePageId(String(data.activeWorkspacePageId));
                    if (data.workflowStage) setWorkflowStage(String(data.workflowStage));
                    if (data.forceStopCamera || data.forceStopFeed) {
                        applyFeedShutdown('Studio camera and footage feeds closed by upper-level control.');
                    }
                    if (data.shared) setStatus('Shared script received for dissemination.');
                    setTandemSyncedAt(new Date().toLocaleTimeString());
                }
            };
        } catch {
            // BroadcastChannel unsupported fallback
        }

        const handleStorage = (e) => {
            if (e.key === 'wisePodcastTandemState' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.title) setTitle(data.title);
                    if (data.format && formatDefinitions[data.format]) setFormat(data.format);
                    if (Object.prototype.hasOwnProperty.call(data, 'scriptText')) setScriptText(String(data.scriptText || ''));
                    if (data.scriptPipeline && typeof data.scriptPipeline === 'object') {
                        setScriptPipeline({
                            segment1: String(data.scriptPipeline.segment1 || ''),
                            segment2: String(data.scriptPipeline.segment2 || ''),
                            segment3: String(data.scriptPipeline.segment3 || ''),
                            segment4: String(data.scriptPipeline.segment4 || '')
                        });
                    }
                    if (data.storyAngle) setStoryAngle(data.storyAngle);
                    if (data.urgency) setUrgency(data.urgency);
                    if (data.selectedMode) setSelectedMode(data.selectedMode);
                    if (typeof data.isCameraOn === 'boolean') setIsCameraOn(data.isCameraOn);
                    if (typeof data.isMuted === 'boolean') setIsMuted(data.isMuted);
                    if (typeof data.guestCamOn === 'boolean') setGuestCamOn(data.guestCamOn);
                    if (typeof data.guestMuted === 'boolean') setGuestMuted(data.guestMuted);
                    if (typeof data.guestConnected === 'boolean') setGuestConnected(data.guestConnected);
                    if (typeof data.runOrderApproved === 'boolean') setRunOrderApproved(data.runOrderApproved);
                    if (typeof data.hasSavedRecording === 'boolean') setHasSavedRecording(data.hasSavedRecording);
                    if (Array.isArray(data.teamMembersList)) setTeamMembersList(data.teamMembersList);
                    if (data.teamCreatorId) setTeamCreatorId(String(data.teamCreatorId));
                    if (data.teamCreatorLabel) setTeamCreatorLabel(String(data.teamCreatorLabel));
                    if (Array.isArray(data.designeeKeys)) setDesigneeKeys(data.designeeKeys.map((item) => normalizeLoginIdentifier(item)).filter(Boolean));
                    if (Array.isArray(data.workspacePages) && data.workspacePages.length > 0) setWorkspacePages(data.workspacePages);
                    if (data.activeWorkspacePageId) setActiveWorkspacePageId(String(data.activeWorkspacePageId));
                    if (data.workflowStage) setWorkflowStage(String(data.workflowStage));
                    if (data.forceStopCamera || data.forceStopFeed) {
                        applyFeedShutdown('Studio camera and footage feeds closed by upper-level control.');
                    }
                    if (data.shared) setStatus('Shared script received for dissemination.');
                    setTandemSyncedAt(new Date().toLocaleTimeString());
                } catch {
                    // Ignore parse error
                }
            }
        };

        try {
            const savedState = localStorage.getItem('wisePodcastTandemState');
            if (savedState) {
                const data = JSON.parse(savedState);
                if (data.title) setTitle(data.title);
                if (data.format && formatDefinitions[data.format]) setFormat(data.format);
                if (Object.prototype.hasOwnProperty.call(data, 'scriptText')) setScriptText(String(data.scriptText || ''));
                if (data.scriptPipeline && typeof data.scriptPipeline === 'object') {
                    setScriptPipeline({
                        segment1: String(data.scriptPipeline.segment1 || ''),
                        segment2: String(data.scriptPipeline.segment2 || ''),
                        segment3: String(data.scriptPipeline.segment3 || ''),
                        segment4: String(data.scriptPipeline.segment4 || '')
                    });
                }
                if (data.storyAngle) setStoryAngle(data.storyAngle);
                if (data.urgency) setUrgency(data.urgency);
                if (data.selectedMode) setSelectedMode(data.selectedMode);
                if (typeof data.isCameraOn === 'boolean') setIsCameraOn(data.isCameraOn);
                if (typeof data.isMuted === 'boolean') setIsMuted(data.isMuted);
                if (typeof data.guestCamOn === 'boolean') setGuestCamOn(data.guestCamOn);
                if (typeof data.guestMuted === 'boolean') setGuestMuted(data.guestMuted);
                if (typeof data.guestConnected === 'boolean') setGuestConnected(data.guestConnected);
                if (typeof data.runOrderApproved === 'boolean') setRunOrderApproved(data.runOrderApproved);
                if (typeof data.hasSavedRecording === 'boolean') setHasSavedRecording(data.hasSavedRecording);
                if (Array.isArray(data.teamMembersList)) setTeamMembersList(data.teamMembersList);
                if (data.teamCreatorId) setTeamCreatorId(String(data.teamCreatorId));
                if (data.teamCreatorLabel) setTeamCreatorLabel(String(data.teamCreatorLabel));
                if (Array.isArray(data.designeeKeys)) setDesigneeKeys(data.designeeKeys.map((item) => normalizeLoginIdentifier(item)).filter(Boolean));
                if (Array.isArray(data.workspacePages) && data.workspacePages.length > 0) setWorkspacePages(data.workspacePages);
                if (data.activeWorkspacePageId) setActiveWorkspacePageId(String(data.activeWorkspacePageId));
                if (data.workflowStage) setWorkflowStage(String(data.workflowStage));
                if (data.forceStopCamera || data.forceStopFeed) {
                    applyFeedShutdown('Studio camera and footage feeds restored in shutdown state by upper-level control.');
                }
                if (data.shared) setStatus('Shared script restored for dissemination.');
            }
        } catch {
            // Ignore restore parse error.
        }

        window.addEventListener('storage', handleStorage);
        return () => {
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.close();
            }
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadTeamDirectory = async () => {
            try {
                const response = await apiService.getUsers({ page: 1, pageSize: 200 });
                if (!isMounted) return;
                const payload = response?.data;
                const users = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.users)
                        ? payload.users
                        : Array.isArray(payload?.items)
                            ? payload.items
                            : [];
                setTeamDirectory(users);
            } catch {
                if (isMounted) {
                    setTeamDirectory(user ? [user] : []);
                }
            }
        };

        void loadTeamDirectory();
        return () => {
            isMounted = false;
        };
    }, [user]);

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
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
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

        if (handoff.soundtrack?.title || handoff.soundtrack?.mediaUrl) {
            const soundtrackLabel = handoff.soundtrack.artist
                ? `${handoff.soundtrack.artist} — ${handoff.soundtrack.title || 'Untitled track'}`
                : (handoff.soundtrack.title || handoff.soundtrack.mediaUrl);
            setScriptText((previous) => `${previous}\n\nStory soundtrack:\n${soundtrackLabel}`.trim());
        }

        setStatus(`Dispatch handoff received (${handoff.urgency || 'Standard'})`);
    }, []);

    useEffect(() => {
        try {
            const savedDraft = String(localStorage.getItem('wisePodcastScriptDraft') || '').trim();
            if (!savedDraft) {
                return;
            }

            setScriptText(savedDraft);
            setStatus('Recovered saved podcast script draft.');
        } catch {
            // Ignore local storage restore failures.
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const loadSubscriptionStatus = async () => {
            try {
                const status = await subscriptionService.getSubscriptionStatus();
                if (!cancelled) {
                    setSubscriptionStatus(status);
                }
            } catch {
                if (!cancelled) {
                    setSubscriptionStatus(null);
                }
            } finally {
                if (!cancelled) {
                    setSubscriptionStatusLoading(false);
                }
            }
        };

        loadSubscriptionStatus();

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (autosaveRestoreAppliedRef.current) {
            return;
        }

        autosaveRestoreAppliedRef.current = true;

        const restoreFromLocalAutosave = () => {
            try {
                const raw = localStorage.getItem(PODCAST_AUTOSAVE_STORAGE_KEY);
                if (!raw) {
                    return false;
                }

                const parsed = JSON.parse(raw);
                const snapshot = parsed?.snapshot;
                const version = String(parsed?.version || '').trim();

                if (!snapshot || typeof snapshot !== 'object') {
                    return false;
                }

                applySessionSnapshot(snapshot);
                if (version) {
                    autosaveVersionRef.current = version;
                }
                setLastAutosavedAt(new Date().toLocaleTimeString());
                setStatus('Recovered podcast session from local autosave.');
                return true;
            } catch {
                return false;
            }
        };

        const restoreFromServerAutosave = async () => {
            try {
                const response = await authService.getPodcastSessionSnapshot('main');
                if (!response?.hasSnapshot || !response?.snapshot) {
                    return false;
                }

                const version = String(response.version || '').trim();
                if (version && version === autosaveVersionRef.current) {
                    return true;
                }

                applySessionSnapshot(response.snapshot);
                if (version) {
                    autosaveVersionRef.current = version;
                }
                setLastAutosavedAt(new Date().toLocaleTimeString());
                setStatus('Recovered podcast session from cloud autosave.');
                return true;
            } catch {
                return false;
            }
        };

        const restoredLocal = restoreFromLocalAutosave();
        if (!restoredLocal) {
            void restoreFromServerAutosave();
        }
    }, []);

    useEffect(() => {
        if (!autosaveRestoreAppliedRef.current) {
            return;
        }

        const persistAutosave = async () => {
            const snapshot = buildSessionSnapshot();
            const version = Date.now().toString();

            try {
                localStorage.setItem(PODCAST_AUTOSAVE_STORAGE_KEY, JSON.stringify({ version, snapshot }));
                setLastAutosavedAt(new Date().toLocaleTimeString());
            } catch {
                // Ignore local autosave errors.
            }

            try {
                const response = await authService.savePodcastSessionSnapshot({
                    roomId: 'main',
                    version,
                    snapshot
                });

                const committedVersion = String(response?.version || version).trim();
                autosaveVersionRef.current = committedVersion;
                setLastAutosavedAt(new Date().toLocaleTimeString());
            } catch {
                // Keep local autosave even if cloud snapshot fails.
            }
        };

        const timeoutId = window.setTimeout(() => {
            void persistAutosave();
        }, 1000);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [
        title,
        format,
        scriptText,
        scriptPipeline,
        storyAngle,
        urgency,
        selectedMode,
        runOrderApproved,
        teamMembersList,
        teamCreatorId,
        teamCreatorLabel,
        designeeKeys,
        workspacePages,
        activeWorkspacePageId,
        workflowStage,
        isCameraOn,
        isMuted,
        guestCamOn,
        guestMuted,
        guestConnected
    ]);

    useEffect(() => {
        let active = true;

        const applyRemoteSharedScript = (payload) => {
            const hasSharedScript = payload?.hasSharedScript === true;
            if (!hasSharedScript) {
                return;
            }

            const incomingVersion = String(payload?.version || payload?.sharedAtUtc || '').trim();
            if (incomingVersion && incomingVersion === sharedScriptVersionRef.current) {
                return;
            }

            if (incomingVersion) {
                sharedScriptVersionRef.current = incomingVersion;
            }

            const incomingScript = String(payload?.scriptText || '').trim();
            const incomingPipeline = payload?.scriptPipeline && typeof payload.scriptPipeline === 'object'
                ? {
                    segment1: String(payload.scriptPipeline.segment1 || ''),
                    segment2: String(payload.scriptPipeline.segment2 || ''),
                    segment3: String(payload.scriptPipeline.segment3 || ''),
                    segment4: String(payload.scriptPipeline.segment4 || '')
                }
                : null;

            if (incomingScript) {
                setScriptText(incomingScript);
            }

            if (incomingPipeline) {
                setScriptPipeline(incomingPipeline);
            }

            if (incomingScript && activeWorkspacePage) {
                setWorkspacePages((previous) => previous.map((page) => (
                    page.id === activeWorkspacePage.id
                        ? { ...page, content: incomingScript }
                        : page
                )));
            }

            setStatus('Shared script synced from the team cloud room.');
        };

        const loadSharedScriptFromServer = async () => {
            try {
                const payload = await authService.getSharedPodcastScript('main');
                if (!active) {
                    return;
                }

                applyRemoteSharedScript(payload);
            } catch {
                // Server sync unavailable; keep local tandem sync active.
            }
        };

        void loadSharedScriptFromServer();

        const intervalId = window.setInterval(() => {
            void loadSharedScriptFromServer();
        }, 10000);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void loadSharedScriptFromServer();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            active = false;
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [activeWorkspacePage]);

    useEffect(() => {
        const applySharedPayload = (raw) => {
            try {
                if (!raw) {
                    return;
                }

                const payload = JSON.parse(raw);
                const incomingVersion = String(payload?.version || payload?.sharedAt || '').trim();
                if (incomingVersion && incomingVersion === sharedScriptVersionRef.current) {
                    return;
                }

                if (incomingVersion) {
                    sharedScriptVersionRef.current = incomingVersion;
                }

                const incomingScript = String(payload?.scriptText || '').trim();
                const incomingPipeline = payload?.scriptPipeline && typeof payload.scriptPipeline === 'object'
                    ? {
                        segment1: String(payload.scriptPipeline.segment1 || ''),
                        segment2: String(payload.scriptPipeline.segment2 || ''),
                        segment3: String(payload.scriptPipeline.segment3 || ''),
                        segment4: String(payload.scriptPipeline.segment4 || '')
                    }
                    : null;

                if (incomingScript) {
                    setScriptText(incomingScript);
                }

                if (incomingPipeline) {
                    setScriptPipeline(incomingPipeline);
                }

                if (incomingScript && activeWorkspacePage) {
                    setWorkspacePages((previous) => previous.map((page) => (
                        page.id === activeWorkspacePage.id
                            ? { ...page, content: incomingScript }
                            : page
                    )));
                }

                if (payload?.shared) {
                    setStatus('Shared script received for dissemination.');
                }
            } catch {
                // Ignore malformed shared payload
            }
        };

        const handleSharedPayloadStorage = (event) => {
            if (event.key === SHARED_SCRIPT_STORAGE_KEY && event.newValue) {
                applySharedPayload(event.newValue);
            }
        };

        window.addEventListener('storage', handleSharedPayloadStorage);
        applySharedPayload(localStorage.getItem(SHARED_SCRIPT_STORAGE_KEY));
        return () => {
            window.removeEventListener('storage', handleSharedPayloadStorage);
        };
    }, [activeWorkspacePage]);

    // Recording Functions
    const startRecording = async () => {
        // Only presenting roles (Owner / Producer / Host) may go live.
        if (!permissions.canGoLive) {
            setStatus(`${controlRole} does not present live. Switch to Owner, Producer or Host to run the broadcast.`);
            return;
        }

        try {
            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: isCameraOn,
                    audio: !isMuted
                });
            } catch (err) {
                console.warn('Physical camera/microphone unavailable, initializing canvas fallback stream:', err);
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 360;
                const ctx = canvas.getContext('2d');
                let frameCount = 0;
                const animTimer = setInterval(() => {
                    frameCount++;
                    ctx.fillStyle = '#0f172a';
                    ctx.fillRect(0, 0, 640, 360);
                    ctx.fillStyle = '#38bdf8';
                    ctx.font = 'bold 22px sans-serif';
                    ctx.fillText(`Ravensight Podcast Studio`, 30, 50);
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '16px sans-serif';
                    ctx.fillText(`Title: ${title}`, 30, 90);
                    ctx.fillText(`Role: ${controlRole} | Format: ${format}`, 30, 120);

                    ctx.fillStyle = frameCount % 20 < 10 ? '#ef4444' : '#b91c1c';
                    ctx.beginPath();
                    ctx.arc(40, 160, 12, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#f8fafc';
                    ctx.font = 'bold 16px sans-serif';
                    ctx.fillText(`LIVE RECORDING · ${new Date().toLocaleTimeString()}`, 65, 165);

                    // Simulated Audio Level Waves
                    ctx.fillStyle = '#22c55e';
                    const barHeight = 20 + Math.sin(frameCount * 0.2) * 15;
                    ctx.fillRect(30, 240, 12, barHeight);
                    ctx.fillRect(48, 230, 12, barHeight + 10);
                    ctx.fillRect(66, 235, 12, barHeight + 5);
                }, 100);

                stream = canvas.captureStream(30);
                canvas.onended = () => clearInterval(animTimer);

                try {
                    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = audioCtx.createOscillator();
                    const dst = audioCtx.createMediaStreamDestination();
                    osc.connect(dst);
                    osc.start();
                    const track = dst.stream.getAudioTracks()[0];
                    if (track) stream.addTrack(track);
                } catch {
                    // Audio context fallback
                }
            }

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            recordedChunksRef.current = [];
            setRecordedChunks([]);
            setRecordedVideoUrl(null);
            setRecordedBlob(null);
            setHasSavedRecording(false);
            setSavedRecordingMediaUrl('');

            let mimeType = 'video/webm';
            if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported('video/webm')) {
                mimeType = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4' : '';
            }

            const options = mimeType ? { mimeType } : {};
            const mediaRecorder = new MediaRecorder(stream, options);
            mediaRecorderRef.current = mediaRecorder;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                    setRecordedChunks((prev) => [...prev, e.data]);
                }
            };

            mediaRecorder.onstop = () => {
                const chunks = recordedChunksRef.current;
                if (chunks.length > 0) {
                    const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    setRecordedVideoUrl(url);
                    setRecordedBlob(blob);
                }
            };

            mediaRecorder.start(1000);
            setIsRecording(true);
            setIsPaused(false);
            setRecordingTime(0);
            setStatus(`Recording live session as ${controlRole}...`);

            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
        } catch (error) {
            console.error('Error starting studio recording:', error);
            setStatus(`Recording failure: ${error?.message || 'Media stream error'}`);
        }
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && isRecording && !isPaused) {
            mediaRecorderRef.current.pause();
            setIsPaused(true);
            if (timerRef.current) clearInterval(timerRef.current);
            setStatus('Recording paused.');
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && isRecording && isPaused) {
            mediaRecorderRef.current.resume();
            setIsPaused(false);
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);
            setStatus('Recording resumed.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            try {
                mediaRecorderRef.current.stop();
            } catch (err) {
                console.warn('Stop recorder error:', err);
            }
        }
        setIsRecording(false);
        setIsPaused(false);
        if (timerRef.current) clearInterval(timerRef.current);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }
        setStatus('Recording completed. Review playback or save to Ravensight Library.');
    };

    const saveRecordingToLibrary = async () => {
        const sourceChunks = recordedChunksRef.current;
        if (!recordedBlob && sourceChunks.length === 0) {
            setStatus('No recording captured to save.');
            return;
        }

        setIsSavingRecording(true);
        setStatus('Saving podcast recording to Ravensight Library...');

        const blob = recordedBlob || new Blob(sourceChunks, { type: 'video/webm' });
        const file = new File([blob], `podcast_${Date.now()}.webm`, { type: 'video/webm' });

        try {
            const formData = new FormData();
            formData.append('video', file);
            formData.append('file', file);
            formData.append('title', videoTitle || title || `Podcast Session ${new Date().toLocaleString()}`);
            formData.append('description', `Podcast Control Room session. Story angle: ${storyAngle}. Urgency: ${urgency}`);
            formData.append('privacyStatus', 'unlisted');
            formData.append('destinationFolder', '/wiseravenshare/ravensight/video');
            formData.append('storageMode', 'permanent');

            const response = await ravensightAPI.uploadVideo(formData);
            const uploadedMediaUrl = resolveUploadedMediaUrl(response, recordedVideoUrl || '');
            if (response?.video) {
                upsertLocalVideo({
                    ...response.video,
                    userId: user?.id,
                    channelName: user?.name || 'WiseRaven Podcast Host',
                    channelAvatar: user?.avatar,
                    videoUrl: response.video.videoUrl || response.video.mediaUrl || uploadedMediaUrl,
                    mediaUrl: response.video.mediaUrl || response.video.videoUrl || uploadedMediaUrl
                });
            } else {
                throw new Error('Local store fallback');
            }
            setSavedRecordingMediaUrl(uploadedMediaUrl || recordedVideoUrl || '');
            setHasSavedRecording(true);
            broadcastTandemState({ hasSavedRecording: true });
            setStatus('Podcast recording successfully saved to Ravensight Library!');
        } catch {
            const fallback = buildLocalFallbackVideo({
                file,
                user,
                title: videoTitle || title || `Podcast Session ${new Date().toLocaleString()}`,
                description: `Podcast Control Room session. Story angle: ${storyAngle}`,
                privacyStatus: 'unlisted',
                storageMode: 'permanent'
            });
            upsertLocalVideo(fallback);
            setSavedRecordingMediaUrl(fallback?.mediaUrl || fallback?.videoUrl || recordedVideoUrl || '');
            setHasSavedRecording(true);
            broadcastTandemState({ hasSavedRecording: true });
            setStatus('Podcast recording saved locally to Ravensight Library.');
        } finally {
            setIsSavingRecording(false);
        }
    };

    const openRavensightTab = (tabId, message) => {
        queueRavensightTab(tabId);
        if (typeof onNavigate === 'function') {
            onNavigate('ravensight');
        }
        if (message) {
            setStatus(message);
        }
    };

    const navigateToFeaturePage = (pageId, message) => {
        if (typeof onNavigate === 'function') {
            onNavigate(pageId);
        }
        if (message) {
            setStatus(message);
        }
    };

    const publishEpisodeToFeed = async () => {
        const mediaUrl = String(savedRecordingMediaUrl || recordedVideoUrl || '').trim();
        if (!mediaUrl) {
            setStatus('Save a recording first so there is a media URL to publish to Feed.');
            return;
        }

        setIsPublishingEpisodePost(true);
        try {
            await apiService.createPost({
                content: `🎙 ${videoTitle || title || 'Podcast Episode'}\n\n${storyAngle || 'New episode from Podcast Control Room.'}`.trim(),
                type: 'Video',
                mediaUrl,
                truthDispatch: true
            });
            setStatus('Podcast episode published to Feed. Opening Feed now.');
            navigateToFeaturePage('feed');
        } catch (error) {
            setStatus(error?.message || 'Unable to publish podcast episode to Feed right now.');
        } finally {
            setIsPublishingEpisodePost(false);
        }
    };

    const handleApproveRunOrder = () => {
        if (!canApproveWorkflow) {
            setStatus('Only the team creator or an assigned designee with approval permission can approve this workflow.');
            return;
        }

        setRunOrderApproved(true);
        broadcastTandemState({ runOrderApproved: true });
        setStatus('Segment run order approved and locked for live production.');
    };

    const handleStartRecordingFromFlow = () => {
        if (!String(title || '').trim()) {
            setStatus('Add a podcast title before starting recording.');
            setWorkflowStage('Plan');
            return;
        }

        if (!String(storyAngle || '').trim()) {
            setStatus('Add a story angle before starting recording.');
            setWorkflowStage('Plan');
            return;
        }

        if (!String(scriptText || '').trim()) {
            setStatus('Prepare a live script before starting recording.');
            setWorkflowStage('Script');
            return;
        }

        if (!runOrderApproved) {
            setStatus('Approve run order before going live.');
            setWorkflowStage('Script');
            return;
        }

        setWorkflowStage('Record');
        startRecording();
    };

    // Tandem Member Sync Handler (Username or Email Pairing)
    const handleSyncConnection = (e) => {
        e?.preventDefault();
        const identifier = syncInput.trim();
        if (!identifier) {
            setSyncMessage('Please enter a username or email to pair.');
            return;
        }

        const matchedProfile = matchDirectoryMember(identifier) || {
            name: user?.name || user?.displayName || user?.username || 'Remote User',
            email: user?.email || '',
            handle: user?.handle || user?.username || '',
            username: user?.username || user?.handle || '',
            displayName: user?.displayName || user?.name || ''
        };

        const resolvedName = String(
            matchedProfile?.displayName
            || matchedProfile?.name
            || matchedProfile?.username
            || matchedProfile?.handle
            || (identifier.includes('@') ? identifier.split('@')[0] : identifier.replace(/^@/, ''))
        ).trim();

        const candidateName = resolvedName || 'Remote User';
        const displayName = candidateName.charAt(0).toUpperCase() + candidateName.slice(1);
        const normalizedIdentifier = normalizeLoginIdentifier(identifier || displayName);
        const existingGuest = teamMembersList.find((member) => (
            resolveMemberKey(member) === normalizedIdentifier
        ));

        if (syncRole === 'Guest' && !existingGuest && activeRemoteGuests.length >= MAX_REMOTE_GUEST_MONITORS) {
            setSyncMessage(`Remote guest split monitor is full (${MAX_REMOTE_GUEST_MONITORS}/${MAX_REMOTE_GUEST_MONITORS}).`);
            setStatus('Remote guest split monitor is full. Remove one guest to add another.');
            return;
        }

        const login = resolveLoginStatus(identifier);

        const updatedList = upsertTeamMember({
            name: displayName,
            role: syncRole,
            locale: matchedProfile?.location || 'Remote Tandem',
            device: matchedProfile?.device || 'Paired Sync',
            status: 'Synced in Tandem',
            identifier,
            loginState: login.loginState,
            loginStatus: login.loginStatus
        });

        setTeamMembersList(updatedList);
        setSyncInput('');
        setSyncMessage(`Synced ${identifier} as ${syncRole}. Login status: ${login.loginStatus}.`);

        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Team member ${displayName} synced in tandem as ${syncRole}.`);

        setTimeout(() => setSyncMessage(''), 4500);
    };

    const handleGuestInvite = () => {
        const gName = guestNameInput.trim();
        if (!gName) return;

        const normalizedIdentifier = normalizeLoginIdentifier(gName);
        const existingGuest = teamMembersList.find((member) => (
            resolveMemberKey(member) === normalizedIdentifier
        ));

        if (!existingGuest && activeRemoteGuests.length >= MAX_REMOTE_GUEST_MONITORS) {
            setStatus('Remote guest split monitor is full. Remove one guest to add another.');
            return;
        }

        const login = resolveLoginStatus(gName);
        const updatedList = upsertTeamMember({
            name: gName,
            role: 'Guest',
            locale: 'Connected Remote',
            device: 'Mobile Mosaic',
            status: 'Synced in Tandem',
            identifier: gName,
            loginState: login.loginState,
            loginStatus: login.loginStatus
        });
        setTeamMembersList(updatedList);
        setGuestNameInput('');
        setGuestConnected(true);
        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Guest ${gName} connected to podcast studio!`);

        queueCollaborationHandoff({
            mode: 'create',
            roomName: `${gName} Guest Room`
        });
    };

    const toggleDesignee = (member) => {
        if (!isCreator) {
            setStatus('Only the team creator can assign or remove a workflow designee.');
            return;
        }

        const key = resolveMemberKey(member);
        if (!key) {
            setStatus('This team member must have a username or email before designation.');
            return;
        }

        const next = designeeKeys.includes(key)
            ? designeeKeys.filter((entry) => entry !== key)
            : [...designeeKeys, key];

        setDesigneeKeys(next);
        broadcastTandemState({ designeeKeys: next });
        setStatus(next.includes(key)
            ? `${member.name} is now a workflow designee.`
            : `${member.name} is no longer a workflow designee.`);
    };

    const decoupleTeamMember = (member) => {
        if (!isCreator && !isDesignee) {
            setStatus('Only the team creator or a workflow designee can break podcast sync connections.');
            return;
        }

        const targetKey = resolveMemberKey(member);
        const updatedList = teamMembersList.map((entry) => {
            if (resolveMemberKey(entry) !== targetKey) {
                return entry;
            }

            return {
                ...entry,
                coupled: false,
                status: 'Decoupled from tandem',
                loginState: 'offline',
                loginStatus: 'Decoupled',
                syncedAt: new Date().toLocaleTimeString()
            };
        });

        setTeamMembersList(updatedList);
        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Connection broken for ${member?.name || 'team member'}.`);
    };

    const toggleJoinRoom = (member) => {
        if (!isCreator && !isDesignee) {
            setStatus('Only the team creator or a workflow designee can admit members into the room.');
            return;
        }

        const targetKey = resolveMemberKey(member);
        if (!targetKey) {
            setStatus('This person needs a username/email before room admission can be toggled.');
            return;
        }

        const updatedList = teamMembersList.map((entry) => {
            if (resolveMemberKey(entry) !== targetKey) {
                return entry;
            }

            const currentlyJoined = String(entry?.loginState || '').toLowerCase() === 'online';
            return {
                ...entry,
                coupled: !currentlyJoined,
                loginState: currentlyJoined ? 'pending' : 'online',
                loginStatus: currentlyJoined ? 'Awaiting login in room' : 'Joined room',
                status: currentlyJoined ? 'Waiting for room admission' : 'Synced in Tandem',
                syncedAt: new Date().toLocaleTimeString()
            };
        });

        setTeamMembersList(updatedList);
        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Room admission updated for ${member?.name || 'team member'}.`);
    };

    const addWorkspacePage = () => {
        const page = createWorkspacePage(newPageType, newPageTitle);
        const nextPages = [page, ...workspacePages];
        setWorkspacePages(nextPages);
        setActiveWorkspacePageId(page.id);
        setNewPageTitle('');
        broadcastTandemState({ workspacePages: nextPages, activeWorkspacePageId: page.id });
        setStatus(`${page.type} page created and synced.`);
    };

    const updateWorkspacePage = (pageId, updates) => {
        const nextPages = workspacePages.map((page) => (
            page.id === pageId ? { ...page, ...updates } : page
        ));
        setWorkspacePages(nextPages);

        const current = nextPages.find((page) => page.id === pageId);
        if (current?.type === 'Script' && typeof updates.content === 'string') {
            setScriptText(updates.content);
            setRunOrderApproved(false);
            broadcastTandemState({ workspacePages: nextPages, scriptText: updates.content, runOrderApproved: false });
            return;
        }

        broadcastTandemState({ workspacePages: nextPages });
    };

    const removeWorkspacePage = (pageId) => {
        if (workspacePages.length <= 1) {
            setStatus('Keep at least one workspace page active.');
            return;
        }

        const nextPages = workspacePages.filter((page) => page.id !== pageId);
        const nextActiveId = pageId === activeWorkspacePageId
            ? (nextPages[0]?.id || '')
            : activeWorkspacePageId;

        setWorkspacePages(nextPages);
        setActiveWorkspacePageId(nextActiveId);
        broadcastTandemState({ workspacePages: nextPages, activeWorkspacePageId: nextActiveId });
        setStatus('Workspace page removed and team sync updated.');
    };

    const handleShareScript = () => {
        const sharedAt = new Date().toISOString();
        const sharedPayload = {
            scriptText,
            scriptPipeline,
            shared: true,
            sharedAt,
            version: sharedAt,
            senderRole: controlRole
        };

        try {
            localStorage.setItem('wiseSharedPodcastScript', scriptText);
            localStorage.setItem(SHARED_SCRIPT_STORAGE_KEY, JSON.stringify(sharedPayload));
        } catch {
            // Best effort only.
        }

        broadcastTandemState({ scriptText, scriptPipeline, shared: true, sharedAt });

        const remotePayload = {
            roomId: 'main',
            scriptText,
            scriptPipeline: {
                segment1: String(scriptPipeline.segment1 || ''),
                segment2: String(scriptPipeline.segment2 || ''),
                segment3: String(scriptPipeline.segment3 || ''),
                segment4: String(scriptPipeline.segment4 || '')
            }
        };

        void authService.sharePodcastScript(remotePayload)
            .then((response) => {
                if (response?.version) {
                    sharedScriptVersionRef.current = String(response.version);
                }
                setStatus('Script shared for dissemination across all connected tandem team members.');
            })
            .catch(() => {
                setStatus('Script shared locally. Team cloud sync will retry on next refresh.');
            });
    };

    const updateScriptPipelineSegment = (segmentKey, value) => {
        if (!canEditScriptPipeline) {
            setStatus('Only Owner, Producer, Director/Editor, or Host can fill script pipeline segments.');
            return;
        }

        const nextPipeline = {
            ...scriptPipeline,
            [segmentKey]: value
        };
        setScriptPipeline(nextPipeline);
        setRunOrderApproved(false);
        broadcastTandemState({ scriptPipeline: nextPipeline, runOrderApproved: false });
    };

    const applyScriptPipelineToScript = () => {
        const composed = scriptPipelineSegments
            .map((segment) => {
                const value = String(scriptPipeline[segment.key] || '').trim();
                if (!value) {
                    return '';
                }
                return `${segment.label}:\n${value}`;
            })
            .filter(Boolean)
            .join('\n\n');

        if (!composed) {
            setStatus('Fill at least one script pipeline segment before applying to live script.');
            return;
        }

        setScriptText(composed);
        setRunOrderApproved(false);
        if (activeWorkspacePage) {
            const updatedPages = workspacePages.map((page) => (
                page.id === activeWorkspacePage.id
                    ? { ...page, content: composed }
                    : page
            ));
            setWorkspacePages(updatedPages);
            broadcastTandemState({ scriptText: composed, scriptPipeline, workspacePages: updatedPages, runOrderApproved: false });
            setStatus('Script pipeline applied to live script.');
            return;
        }

        broadcastTandemState({ scriptText: composed, scriptPipeline, runOrderApproved: false });
        setStatus('Script pipeline applied to live script.');
    };

    const setRemoteGuestMode = () => {
        setSelectedMode('Remote guest');
        setGuestConnected(true);
        setStatus('Remote guest mode enabled. Pair and quick join are now ready.');
        broadcastTandemState({ selectedMode: 'Remote guest' });
    };

    const runWorkflowNavigator = () => {
        void runNextStudioAction();
    };

    const handleClearForms = () => {
        if (isRecording) {
            setStatus('Stop recording before clearing podcast forms.');
            return;
        }

        const confirmed = window.confirm(
            'Are you sure you want to clear podcast forms? This will erase title, story angle, script, workspace page content, and current run-order approval.'
        );

        if (!confirmed) {
            setStatus('Clear forms canceled.');
            return;
        }

        const clearedPages = workspacePages.map((page) => ({
            ...page,
            content: ''
        }));

        setTitle('');
        setStoryAngle('');
        setScriptText('');
        setScriptPipeline(createEmptyScriptPipeline());
        setRunOrderApproved(false);
        setWorkspacePages(clearedPages);
        setWorkflowStage('Plan');
        setVideoTitle('');
        setQuickJoinInput('');
        setSyncInput('');
        setGuestNameInput('');
        setNewPageTitle('');

        try {
            localStorage.removeItem('wisePodcastScriptDraft');
            localStorage.removeItem(PODCAST_AUTOSAVE_STORAGE_KEY);
            localStorage.removeItem('wiseSharedPodcastScript');
            localStorage.removeItem(SHARED_SCRIPT_STORAGE_KEY);
        } catch {
            // Best effort cleanup only.
        }

        broadcastTandemState({
            title: '',
            storyAngle: '',
            scriptText: '',
            scriptPipeline: createEmptyScriptPipeline(),
            runOrderApproved: false,
            workspacePages: clearedPages,
            workflowStage: 'Plan'
        });

        setStatus('Podcast forms cleared and synced.');
    };

    const handleQuickJoin = () => {
        const value = quickJoinInput.trim();
        if (!value) {
            setStatus('Paste a room ID or invite link to quick join.');
            return;
        }

        queueCollaborationHandoff({
            mode: 'join',
            roomIdOrLink: value
        });

        if (typeof onNavigate === 'function') {
            onNavigate('collaboration');
        }

        const normalizedJoinInput = normalizeLoginIdentifier(value);
        if (normalizedJoinInput) {
            setTeamMembersList((previous) => previous.map((member) => {
                if (normalizeLoginIdentifier(member?.identifier || member?.name || '') !== normalizedJoinInput) {
                    return member;
                }
                return {
                    ...member,
                    loginState: 'online',
                    loginStatus: 'Joined room',
                    coupled: true,
                    syncedAt: new Date().toLocaleTimeString()
                };
            }));
        }

        setStatus('Opening Collaboration quick join...');
    };

    // Format buttons generate their namesake episode structure:
    // Interview = interview questions · Solo = full solo rundown ·
    // Panel = engagement panel segments · Roundtable = group mind-share segments.
    const handleFormatChange = (nextFormat) => {
        const definition = formatDefinitions[nextFormat];
        if (!definition) return;

        setFormat(nextFormat);
        setRunOrderApproved(false);
        setStatus(`${definition.icon} ${definition.label} format selected. Use your own script and structure for this episode.`);
        broadcastTandemState({ format: nextFormat, runOrderApproved: false });
    };

    // Urgency buttons set their namesake dispatch posture:
    // Breaking = breaking-news fast track · Standard = regular cadence · Feature = special cast.
    const handleUrgencyChange = (nextUrgency) => {
        const definition = urgencyDefinitions[nextUrgency];
        if (!definition) return;

        setUrgency(nextUrgency);
        setStatus(`${definition.icon} ${definition.label}: ${definition.description} Publish window: ${definition.targetPublishWindow}.`);
        broadcastTandemState({ urgency: nextUrgency });
    };

    const formatTime = (totalSeconds) => {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const hasCoreBrief = Boolean(String(title || '').trim()) && Boolean(String(storyAngle || '').trim());
    const hasScriptPipeline = scriptPipelineSegments.some((segment) => Boolean(String(scriptPipeline[segment.key] || '').trim()));
    const hasScript = Boolean(String(scriptText || '').trim()) || hasScriptPipeline;
    const hasTeamReady = teamMembersList.some((member) => member?.coupled !== false);
    const hasRecording = Boolean(recordedVideoUrl || savedRecordingMediaUrl || hasSavedRecording);
    const playbackMediaUrl = String(recordedVideoUrl || savedRecordingMediaUrl || '').trim();

    const flowSteps = [
        { id: 'team', label: 'Tandem team synced', done: hasTeamReady, hint: 'Pair at least one teammate or guest' },
        { id: 'brief', label: 'Episode brief ready', done: hasCoreBrief, hint: 'Set title and story angle' },
        { id: 'format', label: 'Format and urgency selected', done: Boolean(format && urgency), hint: 'Pick show structure and dispatch priority' },
        { id: 'script', label: 'Script prepared', done: hasScript, hint: 'Fill Script Pipeline segments or write your own script' },
        { id: 'approval', label: 'Run order approved', done: runOrderApproved, hint: 'Lock segment order before recording' },
        { id: 'publish', label: 'Recording saved to library', done: hasSavedRecording, hint: 'Record, review, then save to Ravensight Library' }
    ];

    const completedFlowCount = flowSteps.filter((step) => step.done).length;
    const flowProgressPercent = Math.round((completedFlowCount / flowSteps.length) * 100);

    const workflowStages = [
        { id: 'Plan', hint: 'Brief, format, and urgency' },
        { id: 'Script', hint: 'Script and approvals' },
        { id: 'Team', hint: 'Guests and tandem sync' },
        { id: 'Record', hint: 'Live monitor and recording' },
        { id: 'Review', hint: 'Playback and library save' },
        { id: 'Ship', hint: 'Publish and handoff' }
    ];

    const nextRequiredFlow = (() => {
        if (!hasTeamReady) {
            return {
                stage: 'Team',
                actionLabel: 'Sync your team',
                message: 'Pair at least one teammate or guest before moving forward in the flow.'
            };
        }

        if (!hasCoreBrief) {
            return {
                stage: 'Plan',
                actionLabel: 'Complete episode brief',
                message: 'Complete episode title and story angle to lock your recording brief.'
            };
        }

        if (!hasScript) {
            return {
                stage: 'Script',
                actionLabel: 'Write your script',
                message: 'Fill Script Pipeline segments or add your own script content before continuing. No prewritten script is inserted.'
            };
        }

        if (!runOrderApproved) {
            return {
                stage: 'Script',
                actionLabel: 'Approve run order',
                message: 'Approve run order before going live.'
            };
        }

        if (!isRecording && !hasRecording) {
            return {
                stage: 'Record',
                actionLabel: 'Start recording',
                message: 'Start recording when your team and script are ready.'
            };
        }

        if (hasRecording && !hasSavedRecording) {
            return {
                stage: 'Review',
                actionLabel: 'Save recording',
                message: 'Save your recording to Ravensight Library before shipping.'
            };
        }

        return {
            stage: 'Ship',
            actionLabel: 'Flow complete',
            message: 'Podcast flow complete. Recording is saved and ready for Ravensight publishing.'
        };
    })();

    const handleWorkflowStageSelect = (stageId) => {
        if (isGuidedStudioLocked) {
            promptGuidedStudioUpgrade('Guided Studio Flow is locked until a paid plan is active.');
            return;
        }

        if (stageId === nextRequiredFlow.stage || stageId === workflowStage) {
            setWorkflowStage(stageId);
            return;
        }

        const stageOrder = ['Plan', 'Script', 'Team', 'Record', 'Review', 'Ship'];
        const requestedIndex = stageOrder.indexOf(stageId);
        const requiredIndex = stageOrder.indexOf(nextRequiredFlow.stage);

        if (requestedIndex > requiredIndex) {
            setWorkflowStage(nextRequiredFlow.stage);
            setStatus(`Next required stage: ${nextRequiredFlow.stage}. ${nextRequiredFlow.message}`);
            return;
        }

        setWorkflowStage(stageId);
    };

    const runNextStudioAction = async () => {
        if (isGuidedStudioLocked) {
            promptGuidedStudioUpgrade('Guided Studio Flow is locked until a paid plan is active.');
            return;
        }

        setWorkflowStage(nextRequiredFlow.stage);

        if (nextRequiredFlow.stage === 'Plan') {
            setStatus(nextRequiredFlow.message);
            return;
        }

        if (nextRequiredFlow.stage === 'Team') {
            setStatus(nextRequiredFlow.message);
            return;
        }

        if (nextRequiredFlow.stage === 'Script' && !hasScript) {
            setStatus(nextRequiredFlow.message);
            return;
        }

        if (nextRequiredFlow.stage === 'Script' && !runOrderApproved) {
            handleApproveRunOrder();
            return;
        }

        if (nextRequiredFlow.stage === 'Record') {
            handleStartRecordingFromFlow();
            return;
        }

        if (nextRequiredFlow.stage === 'Review') {
            await saveRecordingToLibrary();
            return;
        }

        setStatus(nextRequiredFlow.message);
    };

    const nextFlowActionLabel = nextRequiredFlow.actionLabel;
    const isGuidedStudioUnlocked = Boolean(subscriptionStatus?.hasActiveSubscription);
    const isGuidedStudioLocked = subscriptionStatusLoading || !isGuidedStudioUnlocked;

    const promptGuidedStudioUpgrade = (reason = 'Unlock Guided Studio Flow to continue. Stripe checkout opens with the plan list.') => {
        setSelectedPlan('podcast_pro');
        setShowPricingModal(true);
        setStatus(reason);
    };

    const audienceSummary = useMemo(() => ({
        segments: (formatDefinitions[format]?.segments || scriptBlocks).length,
        collaborators: teamMembersList.length,
        locales: new Set(teamMembersList.map((m) => m.locale)).size
    }), [teamMembersList, format]);

    const stats = [
        { label: 'Active team', value: `${teamMembersList.length}` },
        { label: 'Locales', value: `${audienceSummary.locales}` },
        { label: 'Script segments', value: `${audienceSummary.segments}` },
        { label: 'Recording modes', value: `${studioModes.length}` }
    ];

    return (
        <Compartment badge="Podcast Control Room" title="Podcast Studio & Tandem Hub">
            <div style={{ display: 'grid', gap: '20px' }}>
                {/* Hero / Action Header */}
                <div
                    style={{
                        background: isRecording
                            ? 'linear-gradient(135deg, rgba(225, 29, 72, 0.35), rgba(124, 58, 237, 0.3), rgba(15, 23, 42, 0.95))'
                            : 'linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(14, 116, 144, 0.25), rgba(15, 23, 42, 0.9))',
                        border: isRecording ? '1px solid #f43f5e' : '1px solid var(--border-color)',
                        borderRadius: '18px',
                        padding: '20px',
                        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
                        transition: 'all 0.3s ease'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '12px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                                    Podcast Control Room
                                </span>
                                {isRecording && (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#ef4444',
                                        color: '#fff',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '3px 10px',
                                        borderRadius: '999px',
                                        letterSpacing: '0.08em'
                                    }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} />
                                        REC {formatTime(recordingTime)}
                                    </span>
                                )}
                                {tandemSyncedAt && (
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        background: 'rgba(34, 197, 94, 0.15)',
                                        border: '1px solid rgba(34, 197, 94, 0.4)',
                                        color: '#4ade80',
                                        fontSize: '11px',
                                        padding: '3px 10px',
                                        borderRadius: '999px'
                                    }}>
                                        Tandem Synced ({tandemSyncedAt})
                                    </span>
                                )}
                            </div>
                            <h2 style={{ margin: '8px 0 0', fontSize: '28px' }}>Ravensight Podcast Studio & Live Production</h2>
                        </div>

                        {/* Top Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleForceShutdownFeed}
                                disabled={!canForceShutdownFeed}
                                style={{
                                    border: '1px solid rgba(248, 113, 113, 0.7)',
                                    background: 'rgba(127, 29, 29, 0.5)',
                                    color: '#fecaca',
                                    borderRadius: '999px',
                                    padding: '10px 16px',
                                    fontWeight: '700',
                                    cursor: canForceShutdownFeed ? 'pointer' : 'not-allowed',
                                    opacity: canForceShutdownFeed ? 1 : 0.55
                                }}
                                title="Upper-level control: shut down all active camera and footage feeds"
                            >
                                Cut footage feed
                            </button>

                            {!isRecording ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWorkflowStage('Record');
                                        handleStartRecordingFromFlow();
                                    }}
                                    style={{
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                        color: '#fff',
                                        borderRadius: '999px',
                                        padding: '12px 22px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    🔴 Start recording
                                </button>
                            ) : (
                                <>
                                    {!isPaused ? (
                                        <button
                                            type="button"
                                            onClick={pauseRecording}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                background: 'rgba(255, 255, 255, 0.1)',
                                                color: '#fff',
                                                borderRadius: '999px',
                                                padding: '10px 18px',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ⏸ Pause
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={resumeRecording}
                                            style={{
                                                border: 'none',
                                                background: '#22c55e',
                                                color: '#fff',
                                                borderRadius: '999px',
                                                padding: '10px 18px',
                                                fontWeight: '600',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            ▶ Resume
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={stopRecording}
                                        style={{
                                            border: 'none',
                                            background: '#334155',
                                            color: '#fff',
                                            borderRadius: '999px',
                                            padding: '10px 18px',
                                            fontWeight: '700',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ⏹ Stop recording
                                    </button>
                                </>
                            )}
                        </div>
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

                <div style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '10px 12px',
                    background: 'rgba(15, 23, 42, 0.55)',
                    display: 'grid',
                    gap: '6px'
                }}>
                    <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                        Live Workflow Status
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700 }}>
                        {status}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                        Creator: {teamCreatorLabel || 'Pending'} · Designees: {designeeKeys.length} · Current stage: {workflowStage}
                    </div>
                    {lastAutosavedAt && (
                        <div style={{ fontSize: '12px', color: '#86efac' }}>
                            Autosaved at {lastAutosavedAt}
                        </div>
                    )}
                </div>

                {/* ── Ravensight Podcast Capabilities Dashboard ── */}
                <div style={{
                    background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,15,55,0.92))',
                    border: '1px solid rgba(129,140,248,0.3)',
                    borderRadius: '20px',
                    padding: '22px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px' }}>🎙️</span>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.02em' }}>
                                        Podcast Control Room Capabilities
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                        Podcast Studio now runs inside Ravensight — team recording and publishing in one production lane.
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(34,197,94,0.12)',
                                border: '1px solid rgba(34,197,94,0.3)',
                                borderRadius: '999px',
                                padding: '5px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: '#4ade80'
                            }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                                2 feature groups unlocked
                            </div>
                        </div>
                    </div>

                    {/* Feature cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '18px' }}>
                        {/* Direct publishing — Unlocked */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(15,23,42,0.7))',
                            border: '1px solid rgba(52,211,153,0.35)',
                            borderRadius: '14px',
                            padding: '16px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ fontSize: '22px' }}>📡</div>
                                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#4ade80', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', padding: '2px 8px', borderRadius: '999px' }}>
                                    Unlocked
                                </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>Direct publishing</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                                Send content to connected channels without manual copy-paste steps.
                            </div>
                            <button
                                type="button"
                                onClick={() => openRavensightTab('upload', 'Opening Ravensight Upload...')}
                                style={{ marginTop: '12px', width: '100%', border: '1px solid rgba(52,211,153,0.45)', background: 'rgba(16,185,129,0.12)', color: '#34d399', borderRadius: '8px', padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Publish now →
                            </button>
                        </div>

                        {/* Scheduling & queueing — Unlocked */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(56,189,248,0.10), rgba(15,23,42,0.7))',
                            border: '1px solid rgba(56,189,248,0.3)',
                            borderRadius: '14px',
                            padding: '16px'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ fontSize: '22px' }}>🗓️</div>
                                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#38bdf8', background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', padding: '2px 8px', borderRadius: '999px' }}>
                                    Unlocked
                                </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '4px' }}>Scheduling &amp; queueing</div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                                Plan a content run in advance so publishing keeps moving when the team is offline.
                            </div>
                            <button
                                type="button"
                                onClick={() => navigateToFeaturePage('planner', 'Opening Planner for release scheduling...')}
                                style={{ marginTop: '12px', width: '100%', border: '1px solid rgba(56,189,248,0.35)', background: 'rgba(56,189,248,0.10)', color: '#38bdf8', borderRadius: '8px', padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Open planner →
                            </button>
                        </div>

                        {/* Growth analytics — gated */}
                        <div style={{
                            background: 'rgba(15,23,42,0.5)',
                            border: '1px solid rgba(100,116,139,0.25)',
                            borderRadius: '14px',
                            padding: '16px',
                            opacity: 0.75
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ fontSize: '22px' }}>📊</div>
                                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.25)', padding: '2px 8px', borderRadius: '999px' }}>
                                    Needs growth suite
                                </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>Growth analytics</div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                                Use trend and audience signals to prioritize what gets posted next.
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px', fontStyle: 'italic' }}>
                                Try free for 14 days with Growth Suite
                            </div>
                            <button
                                type="button"
                                onClick={() => { setSelectedPlan('growth_suite'); setShowPricingModal(true); }}
                                style={{ marginTop: '8px', width: '100%', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(148,163,184,0.06)', color: '#64748b', borderRadius: '8px', padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                View pricing →
                            </button>
                        </div>

                        {/* Team workflows — gated */}
                        <div style={{
                            background: 'rgba(15,23,42,0.5)',
                            border: '1px solid rgba(100,116,139,0.25)',
                            borderRadius: '14px',
                            padding: '16px',
                            opacity: 0.75
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ fontSize: '22px' }}>🏗️</div>
                                <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#94a3b8', background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.25)', padding: '2px 8px', borderRadius: '999px' }}>
                                    Needs studio plus
                                </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>Team workflows</div>
                            <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                                Bring reviewers, editors, and operators into the same publishing lane.
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px', fontStyle: 'italic' }}>
                                Try free for 7 days with Studio Plus
                            </div>
                            <button
                                type="button"
                                onClick={() => { setSelectedPlan('studio_plus'); setShowPricingModal(true); }}
                                style={{ marginTop: '8px', width: '100%', border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(148,163,184,0.06)', color: '#64748b', borderRadius: '8px', padding: '7px 0', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                                View pricing →
                            </button>
                        </div>
                    </div>

                    {/* Billing status bar */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(248,113,113,0.08)',
                        border: '1px solid rgba(248,113,113,0.25)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '18px' }}>💳</span>
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#fca5a5' }}>Billing status</div>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                                    Subscription not active — Synced from Stripe with status <strong style={{ color: '#f87171' }}>inactive</strong>.
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigateToFeaturePage('revenue', 'Opening Billing & Revenue...')}
                            style={{
                                border: '1px solid rgba(248,113,113,0.4)',
                                background: 'rgba(248,113,113,0.12)',
                                color: '#fca5a5',
                                borderRadius: '8px',
                                padding: '7px 14px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            Manage billing →
                        </button>
                    </div>
                </div>

                <div style={{
                    background: 'linear-gradient(160deg, rgba(16, 185, 129, 0.12), rgba(15, 23, 42, 0.85))',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    borderRadius: '18px',
                    padding: '20px'
                }}>
                    <div style={{ marginBottom: '14px', display: 'grid', gap: '8px' }}>
                        <div style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#99f6e4', fontWeight: 700 }}>
                            Guided Studio Flow
                        </div>
                        {isGuidedStudioLocked && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '10px',
                                flexWrap: 'wrap',
                                background: 'rgba(129,140,248,0.10)',
                                border: '1px solid rgba(129,140,248,0.28)',
                                borderRadius: '12px',
                                padding: '12px 14px'
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
                                        {subscriptionStatusLoading ? 'Checking billing access...' : 'Guided Studio Flow is locked'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                                        {subscriptionStatusLoading
                                            ? 'Verifying Stripe subscription status before enabling the flow.'
                                            : 'Open the pricing list to attach Stripe checkout and unlock Plan, Script, Record, Review, and Ship.'}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => promptGuidedStudioUpgrade(subscriptionStatusLoading ? 'Checking Stripe access...' : 'Guided Studio Flow is locked until a paid plan is active.')}
                                    style={{
                                        border: '1px solid rgba(129,140,248,0.45)',
                                        background: 'rgba(129,140,248,0.18)',
                                        color: '#c4b5fd',
                                        borderRadius: '10px',
                                        padding: '9px 14px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    View pricing &amp; unlock
                                </button>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {workflowStages.map((stage) => (
                                <button
                                    key={stage.id}
                                    type="button"
                                    onClick={() => (isGuidedStudioLocked ? promptGuidedStudioUpgrade('Guided Studio Flow is locked until a paid plan is active.') : handleWorkflowStageSelect(stage.id))}
                                    style={{
                                        border: workflowStage === stage.id ? '1px solid #34d399' : '1px solid var(--border-color)',
                                        background: workflowStage === stage.id ? 'rgba(16, 185, 129, 0.2)' : isGuidedStudioLocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
                                        color: 'var(--text-color)',
                                        borderRadius: '999px',
                                        padding: '7px 12px',
                                        cursor: isGuidedStudioLocked ? 'pointer' : 'pointer',
                                        fontSize: '12px',
                                        fontWeight: workflowStage === stage.id ? 700 : 500,
                                        opacity: isGuidedStudioLocked && workflowStage !== stage.id ? 0.8 : 1
                                    }}
                                    title={stage.hint}
                                >
                                    {stage.id}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#34d399', fontWeight: 700 }}>
                                Podcast Workflow Navigator
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--light-color)', marginTop: '4px' }}>
                                Follow the flow that reliably ships: brief, script, approval, recording, then library save.
                            </div>
                            <div style={{ fontSize: '12px', color: '#99f6e4', marginTop: '4px' }}>
                                Next required stage: {nextRequiredFlow.stage}
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '11px', color: 'var(--light-color)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Flow progress
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 800 }}>{flowProgressPercent}%</div>
                            {isGuidedStudioLocked && (
                                <div style={{ fontSize: '11px', color: '#c4b5fd', marginTop: '4px' }}>
                                    Paid plan required
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: '14px', display: 'grid', gap: '10px' }}>
                        {flowSteps.map((step, index) => (
                            <div
                                key={step.id}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto 1fr auto',
                                    alignItems: 'center',
                                    gap: '10px',
                                    padding: '10px 12px',
                                    borderRadius: '12px',
                                    border: step.done ? '1px solid rgba(52, 211, 153, 0.45)' : '1px solid var(--border-color)',
                                    background: step.done ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.02)'
                                }}
                            >
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', fontWeight: 700 }}>{index + 1}</div>
                                <div>
                                    <div style={{ fontWeight: 700 }}>{step.label}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>{step.hint}</div>
                                </div>
                                <div style={{ fontSize: '12px', color: step.done ? '#4ade80' : 'var(--light-color)', fontWeight: 700 }}>
                                    {step.done ? 'Done' : 'Pending'}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleClearForms}
                                disabled={isRecording || isSavingRecording}
                                style={{
                                    border: '1px solid rgba(248, 113, 113, 0.55)',
                                    background: 'rgba(127, 29, 29, 0.35)',
                                    color: '#fecaca',
                                    borderRadius: '10px',
                                    padding: '11px 16px',
                                    fontWeight: 700,
                                    cursor: (isRecording || isSavingRecording) ? 'not-allowed' : 'pointer',
                                    opacity: (isRecording || isSavingRecording) ? 0.55 : 1
                                }}
                                title="Clear podcast forms with confirmation"
                            >
                                Clear Forms
                            </button>
                            <button
                                type="button"
                                onClick={() => (isGuidedStudioLocked ? promptGuidedStudioUpgrade('Guided Studio Flow is locked until a paid plan is active.') : runNextStudioAction())}
                                disabled={nextFlowActionLabel === 'Flow complete' || isSavingRecording}
                                style={{
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#fff',
                                    borderRadius: '10px',
                                    padding: '11px 16px',
                                    fontWeight: 700,
                                    cursor: (nextFlowActionLabel === 'Flow complete' || isSavingRecording) ? 'not-allowed' : 'pointer',
                                    opacity: (nextFlowActionLabel === 'Flow complete' || isSavingRecording) ? 0.65 : 1
                                }}
                            >
                                {isSavingRecording ? 'Saving...' : `Next: ${nextFlowActionLabel}`}
                            </button>
                        </div>
                    </div>
                </div>

                {(workflowStage === 'Ship') && (
                <div style={{
                    background: 'linear-gradient(160deg, rgba(79,70,229,0.16), rgba(15,23,42,0.94))',
                    border: '1px solid rgba(129,140,248,0.35)',
                    borderRadius: '20px',
                    padding: '22px'
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '20px' }}>🚀</span>
                                <span style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800, color: '#c4b5fd' }}>
                                    Ship &amp; Distribute
                                </span>
                            </div>
                            <div style={{ fontWeight: 800, fontSize: '20px', color: '#e2e8f0' }}>
                                {title || 'Untitled Episode'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                Format: {format} · Urgency: {urgency} · {storyAngle ? `"${storyAngle.slice(0,60)}"` : 'No story angle set'}
                            </div>
                        </div>
                        {hasSavedRecording && savedRecordingMediaUrl && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.35)', color: '#4ade80', fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '999px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80' }} />
                                Recording ready
                            </span>
                        )}
                    </div>

                    {/* 2-column: publish + queue */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '18px' }}>
                        {/* Publish to platform */}
                        <div style={{
                            background: 'rgba(15,23,42,0.55)',
                            border: '1px solid rgba(129,140,248,0.25)',
                            borderRadius: '14px',
                            padding: '16px'
                        }}>
                            <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700, marginBottom: '12px' }}>
                                Publish to platform
                            </div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => openRavensightTab('upload', 'Sending to Ravensight for publishing...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(129,140,248,0.35)', background: 'rgba(79,70,229,0.14)', color: '#c4b5fd', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>🎬</span>
                                    <span>Ravensight Library</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Upload →</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateToFeaturePage('newsroom-video', 'Opening Newsroom Video...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)', color: '#34d399', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>📺</span>
                                    <span>Newsroom Video desk</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Handoff →</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateToFeaturePage('social-feeds', 'Opening Social Feeds...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(56,189,248,0.3)', background: 'rgba(56,189,248,0.10)', color: '#38bdf8', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>📡</span>
                                    <span>Cross-post to social feeds</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Post →</span>
                                </button>
                            </div>
                        </div>

                        {/* Schedule & queue */}
                        <div style={{
                            background: 'rgba(15,23,42,0.55)',
                            border: '1px solid rgba(234,179,8,0.25)',
                            borderRadius: '14px',
                            padding: '16px'
                        }}>
                            <div style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#fde68a', fontWeight: 700, marginBottom: '12px' }}>
                                Schedule &amp; queue
                            </div>
                            <div style={{ display: 'grid', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => navigateToFeaturePage('planner', 'Opening Planner for release scheduling...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(234,179,8,0.35)', background: 'rgba(234,179,8,0.12)', color: '#fde68a', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>🗓️</span>
                                    <span>Add to release planner</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Schedule →</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigateToFeaturePage('podcast-rights-studio', 'Opening Podcast Rights Studio...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(139,92,246,0.3)', background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>📜</span>
                                    <span>Set episode rights</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Rights →</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => openRavensightTab('library', 'Opening Ravensight Library...')}
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(14,165,233,0.3)', background: 'rgba(14,165,233,0.1)', color: '#7dd3fc', borderRadius: '10px', padding: '11px 14px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
                                >
                                    <span style={{ fontSize: '18px' }}>📚</span>
                                    <span>View episode library</span>
                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>Library →</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Collaboration row */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        background: 'rgba(147,51,234,0.08)',
                        border: '1px solid rgba(147,51,234,0.25)',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        flexWrap: 'wrap'
                    }}>
                        <span style={{ fontSize: '18px' }}>🤝</span>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>Bring in the team</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>Loop reviewers and editors in before final release.</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigateToFeaturePage('collaboration', 'Opening Collaboration room...')}
                            style={{ border: '1px solid rgba(147,51,234,0.4)', background: 'rgba(147,51,234,0.16)', color: '#d8b4fe', borderRadius: '8px', padding: '8px 16px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                            Open collaboration →
                        </button>
                    </div>
                </div>
                )}

                {/* Tandem Sync Connection Panel (Pairing by Username or Email) */}
                {(workflowStage === 'Team') && (
                <div style={{
                    background: 'linear-gradient(160deg, rgba(14, 116, 144, 0.15), rgba(15, 23, 42, 0.8))',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '18px',
                    padding: '20px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                        <div>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 700 }}>
                                Tandem Connection & Participant Pairing
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--light-color)', marginTop: '4px' }}>
                                Sync producers, scriptwriters, guests, and main event hosts together by username or email so everyone operates in live tandem.
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (syncInput.trim()) {
                                    handleSyncConnection();
                                    return;
                                }

                                broadcastTandemState();
                                setSyncMessage('Tandem sync forced across all paired connections.');
                                setTimeout(() => setSyncMessage(''), 3000);
                            }}
                            style={{
                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                background: 'rgba(56, 189, 248, 0.1)',
                                color: '#38bdf8',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            🔄 Sync Now
                        </button>
                    </div>

                    <form onSubmit={handleSyncConnection} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={syncInput}
                            onChange={(e) => setSyncInput(e.target.value)}
                            placeholder="Enter Username or Email (e.g. john.producer@ravensight.com or @scriptwriter_ari)"
                            style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(15, 23, 42, 0.6)',
                                color: 'var(--text-color)',
                                minWidth: '260px'
                            }}
                        />
                        <select
                            value={syncRole}
                            onChange={(e) => setSyncRole(e.target.value)}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '10px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(15, 23, 42, 0.6)',
                                color: 'var(--text-color)',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="Host">Host / Main Event</option>
                            <option value="Guest">Guest</option>
                            <option value="Producer">Producer</option>
                            <option value="Script Lead">Scriptwriter / Script Lead</option>
                            <option value="Editor">Editor</option>
                        </select>
                        <button
                            type="submit"
                            style={{
                                border: 'none',
                                background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                                color: '#fff',
                                borderRadius: '10px',
                                padding: '12px 20px',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            ⚡ Sync Connection
                        </button>
                    </form>
                    {syncMessage && (
                        <div style={{ marginTop: '10px', fontSize: '13px', color: '#4ade80', fontWeight: 600 }}>
                            {syncMessage}
                        </div>
                    )}

                    <div style={{
                        marginTop: '14px',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        borderRadius: '12px',
                        padding: '12px',
                        background: 'rgba(15, 23, 42, 0.55)'
                    }}>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7dd3fc' }}>
                            Remote Guest Split Monitor (Startup Preview)
                        </div>
                        <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                            {splitGuestMonitors.map((guest, index) => (
                                <div
                                    key={`startup-split-${index}`}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '10px',
                                        background: 'rgba(2, 6, 23, 0.7)',
                                        minHeight: '102px',
                                        display: 'grid',
                                        placeItems: 'center',
                                        textAlign: 'center',
                                        padding: '8px'
                                    }}
                                >
                                    {guest ? (
                                        <>
                                            <div style={{ fontSize: '18px' }}>👤</div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, marginTop: '4px' }}>{guest.name}</div>
                                            <div style={{ fontSize: '10px', color: '#93c5fd', marginTop: '2px' }}>
                                                Slot {index + 1} active
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: '16px', opacity: 0.7 }}>➕</div>
                                            <div style={{ fontSize: '11px', color: 'var(--light-color)', marginTop: '4px' }}>
                                                Open slot {index + 1}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#bae6fd' }}>
                            Add guests from Team setup. Up to {MAX_REMOTE_GUEST_MONITORS} remote guest monitors are shown.
                        </div>
                    </div>

                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                        <button type="button" onClick={handleSyncConnection} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(2, 132, 199, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Sync Connection
                        </button>
                        <button type="button" onClick={handleGuestInvite} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Pair Guest Feed
                        </button>
                        <button type="button" onClick={handleQuickJoin} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Quick Join Room
                        </button>
                        <button type="button" onClick={setRemoteGuestMode} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Remote Guest
                        </button>
                        <button type="button" onClick={handleShareScript} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(34, 197, 94, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Share Script
                        </button>
                        <button type="button" onClick={runWorkflowNavigator} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--text-color)', padding: '8px', cursor: 'pointer' }}>
                            Podcast Workflow Navigator
                        </button>
                    </div>
                </div>
                )}

                {/* Video Monitor Grid & Remote Feeds */}
                {(workflowStage === 'Record' || workflowStage === 'Review') && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                        Multi-monitor vision wall & live preview
                    </div>
                    <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                        {/* Program Out Video View */}
                        <div style={{
                            border: isRecording ? '1px solid #ef4444' : '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: '#000',
                            overflow: 'hidden',
                            position: 'relative',
                            minHeight: '180px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}>
                            <video
                                ref={videoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    display: isRecording || streamRef.current ? 'block' : 'none'
                                }}
                            />
                            {(!isRecording && !streamRef.current) && (
                                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--light-color)' }}>
                                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>📡</div>
                                    <div style={{ fontWeight: 700, color: 'var(--text-color)' }}>Program Out (Main Event)</div>
                                    <div style={{ fontSize: '12px', marginTop: '4px' }}>Click "Start recording" to launch main camera feed</div>
                                </div>
                            )}
                            <div style={{
                                position: 'absolute',
                                top: '8px',
                                left: '8px',
                                background: 'rgba(0,0,0,0.75)',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: '#fff'
                            }}>
                                Program Out {isRecording && '• LIVE'}
                            </div>
                        </div>

                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'rgba(15, 23, 42, 0.7)',
                            overflow: 'hidden',
                            position: 'relative',
                            minHeight: '180px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            <div style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid var(--border-color)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#86efac', fontWeight: 700 }}>
                                    Live Video Feed Bridge
                                </span>
                                <span style={{ fontSize: '11px', color: podcastBridgeState.connected ? '#4ade80' : '#fca5a5' }}>
                                    {podcastBridgeState.connected ? 'SignalR connected' : 'SignalR reconnecting'}
                                </span>
                            </div>

                            {podcastBridgeState.activeFootage?.mediaUrl ? (
                                <>
                                    <video
                                        ref={podcastBridgeVideoRef}
                                        src={podcastBridgeState.activeFootage.mediaUrl}
                                        poster={podcastBridgeState.activeFootage.thumbnailUrl || undefined}
                                        controls
                                        autoPlay
                                        playsInline
                                        style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000', flex: 1 }}
                                    />
                                    <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--light-color)' }}>
                                        {podcastBridgeState.activeFootage.title || 'Incoming footage'}
                                    </div>
                                </>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '18px', color: 'var(--light-color)', marginTop: 'auto', marginBottom: 'auto' }}>
                                    Waiting for videographer feed selection from Ravensight Video Feed.
                                </div>
                            )}
                        </div>

                        {/* Remote Guest Split Monitor (up to 3) */}
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                            padding: '14px',
                            position: 'relative'
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--light-color)' }}>
                                Remote Guest Split Monitor (Up To 3)
                            </div>

                            <div style={{
                                marginTop: '12px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                gap: '8px'
                            }}>
                                {splitGuestMonitors.map((guest, index) => (
                                    <div
                                        key={`split-guest-${index}`}
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '10px',
                                            background: 'rgba(15, 23, 42, 0.55)',
                                            minHeight: '132px',
                                            display: 'grid',
                                            placeItems: 'center',
                                            textAlign: 'center',
                                            padding: '10px'
                                        }}
                                    >
                                        {guest ? (
                                            <>
                                                <div style={{ fontSize: '22px' }}>👤</div>
                                                <div style={{ fontWeight: 700, marginTop: '4px' }}>{guest.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--light-color)', marginTop: '2px' }}>
                                                    {guest.locale || 'Remote'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: guestCamOn ? '#4ade80' : '#f87171', marginTop: '4px' }}>
                                                    {guestCamOn ? 'Camera On' : 'Camera Off'}
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ fontSize: '20px', opacity: 0.7 }}>➕</div>
                                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>
                                                    Open slot {index + 1}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setGuestCamOn(!guestCamOn)}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        background: guestCamOn ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {guestCamOn ? '📷 Cam On' : '🚫 Cam Off'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setGuestMuted(!guestMuted)}
                                    style={{
                                        border: '1px solid var(--border-color)',
                                        background: !guestMuted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        padding: '4px 10px',
                                        fontSize: '11px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {!guestMuted ? '🎙️ Mic Active' : '🔇 Muted'}
                                </button>
                            </div>
                            <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px', color: '#bae6fd' }}>
                                Active remote guests: {activeRemoteGuests.length}/{MAX_REMOTE_GUEST_MONITORS}
                            </div>
                        </div>

                        {/* Teleprompter Live Sync */}
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'linear-gradient(160deg, rgba(124, 58, 237, 0.1), rgba(15, 23, 42, 0.5))',
                            padding: '14px'
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c084fc' }}>Teleprompter Track</div>
                            <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: 1.5, height: '80px', overflowY: 'auto', color: 'var(--text-color)', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px' }}>
                                {scriptText || 'No active script loaded...'}
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '11px', color: '#c084fc' }}>
                                Auto-synced with Script Lead edits
                            </div>

                            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                                <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fca5a5' }}>
                                    Director Commands
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => issueControlCommand('cut', 'Cut to next frame now.')}
                                        style={{ border: '1px solid rgba(248, 113, 113, 0.5)', background: 'rgba(127, 29, 29, 0.35)', color: '#fecaca', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                    >
                                        CUT
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => issueControlCommand('hold', 'Hold this shot for continuity.')}
                                        style={{ border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.08)', color: 'var(--text-color)', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                    >
                                        HOLD
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => issueControlCommand('resume', 'Resume normal camera movement.')}
                                        style={{ border: '1px solid rgba(74, 222, 128, 0.45)', background: 'rgba(22, 163, 74, 0.22)', color: '#bbf7d0', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                    >
                                        RESUME
                                    </button>
                                </div>
                                {podcastBridgeState.latestCommand && (
                                    <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                        Last command: {String(podcastBridgeState.latestCommand.command || '').toUpperCase()} {podcastBridgeState.latestCommand.status ? `(${podcastBridgeState.latestCommand.status})` : ''}
                                    </div>
                                )}
                                {podcastBridgeState.commandResponses?.length > 0 && (
                                    <div style={{ maxHeight: '80px', overflowY: 'auto', fontSize: '12px', color: 'var(--light-color)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 8px', background: 'rgba(0,0,0,0.2)' }}>
                                        {podcastBridgeState.commandResponses.slice(-3).map((response) => (
                                            <div key={response.responseId || `${response.responderUserId}-${response.respondedAtUtc}`}>
                                                {response.responderUserName || 'Operator'}: {response.message || 'Acknowledged'}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {/* Recorded Session Preview & Library Export */}
                {(workflowStage === 'Review' || workflowStage === 'Ship') && playbackMediaUrl && (
                    <div style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--highlight-color)',
                        borderRadius: '18px',
                        padding: '20px'
                    }}>
                        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--highlight-color)', fontWeight: 700 }}>
                            Recorded Session Ready
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '14px' }}>
                            <div>
                                <video
                                    src={playbackMediaUrl}
                                    controls
                                    style={{ width: '100%', borderRadius: '12px', background: '#000' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <label style={{ display: 'grid', gap: '6px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--light-color)' }}>Recording Title</span>
                                    <input
                                        type="text"
                                        value={videoTitle}
                                        onChange={(e) => setVideoTitle(e.target.value)}
                                        placeholder="Enter a recording title"
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border-color)',
                                            background: 'rgba(255,255,255,0.04)',
                                            color: 'var(--text-color)'
                                        }}
                                    />
                                </label>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: 'auto' }}>
                                    <button
                                        type="button"
                                        onClick={saveRecordingToLibrary}
                                        disabled={isSavingRecording}
                                        style={{
                                            flex: 1,
                                            border: 'none',
                                            background: 'linear-gradient(135deg, var(--highlight-color), var(--accent-color))',
                                            color: '#fff',
                                            padding: '12px',
                                            borderRadius: '10px',
                                            fontWeight: 700,
                                            cursor: isSavingRecording ? 'wait' : 'pointer'
                                        }}
                                    >
                                        {isSavingRecording ? 'Saving...' : '💾 Save to Ravensight Library'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={publishEpisodeToFeed}
                                        disabled={isPublishingEpisodePost || isSavingRecording || !String(savedRecordingMediaUrl || recordedVideoUrl || '').trim()}
                                        style={{
                                            border: '1px solid rgba(16, 185, 129, 0.55)',
                                            background: 'rgba(16, 185, 129, 0.18)',
                                            color: 'var(--text-color)',
                                            padding: '12px 14px',
                                            borderRadius: '10px',
                                            fontWeight: 700,
                                            cursor: (isPublishingEpisodePost || isSavingRecording || !String(savedRecordingMediaUrl || recordedVideoUrl || '').trim()) ? 'not-allowed' : 'pointer',
                                            opacity: (isPublishingEpisodePost || isSavingRecording || !String(savedRecordingMediaUrl || recordedVideoUrl || '').trim()) ? 0.65 : 1
                                        }}
                                    >
                                        {isPublishingEpisodePost ? 'Publishing...' : '📰 Publish to Feed'}
                                    </button>
                                    <a
                                        href={playbackMediaUrl}
                                        download={`podcast_recording_${Date.now()}.webm`}
                                        style={{
                                            border: '1px solid var(--border-color)',
                                            background: 'rgba(255,255,255,0.05)',
                                            color: 'var(--text-color)',
                                            padding: '12px 18px',
                                            borderRadius: '10px',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            display: 'inline-flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        ⬇ Download
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Control Controls & Session Form */}
                {(workflowStage === 'Plan' || workflowStage === 'Script' || workflowStage === 'Team') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                        <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                            Studio Session & Script Control
                        </div>

                        <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                            <div style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Control Role Permission</span>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {allowedRoleLabels.map((role) => (
                                        <button
                                            key={role}
                                            type="button"
                                            onClick={() => changeControlRole(role)}
                                            disabled={Boolean(syncingRole)}
                                            title={roleDuties[role] || ''}
                                            style={{
                                                border: controlRole === role ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                background: controlRole === role ? 'rgba(255,255,255,0.08)' : 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '8px 14px',
                                                fontWeight: controlRole === role ? 700 : 400,
                                                cursor: syncingRole ? 'wait' : 'pointer'
                                            }}
                                        >
                                            {role}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '4px' }}>
                                    {roleDuties[controlRole] || ''}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px', fontSize: '12px' }}>
                                    <span style={{ color: permissions.canGoLive ? '#4ade80' : 'var(--light-color)' }}>
                                        {permissions.canGoLive ? '✓ Can present live' : '✗ Cannot go live'}
                                    </span>
                                    <span style={{ color: canEditLiveScript ? '#4ade80' : 'var(--light-color)' }}>
                                        {canEditLiveScript ? '✓ Can edit script' : '✗ Script locked'}
                                    </span>
                                    <span style={{ color: permissions.canApproveSegments ? '#4ade80' : 'var(--light-color)' }}>
                                        {permissions.canApproveSegments ? '✓ Can approve segments' : '✗ Cannot approve'}
                                    </span>
                                </div>
                                <div style={{ marginTop: '6px', fontSize: '12px', color: '#bfdbfe' }}>
                                    Workflow approval gate: Creator ({teamCreatorLabel || 'unassigned'}) or creator designee only.
                                </div>
                            </div>

                            <label style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Podcast Title</span>
                                <input
                                    value={title}
                                    placeholder="Enter your episode title"
                                    onChange={(event) => {
                                        setTitle(event.target.value);
                                        setRunOrderApproved(false);
                                        broadcastTandemState({ title: event.target.value, runOrderApproved: false });
                                    }}
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
                                    {Object.values(formatDefinitions).map((definition) => (
                                        <button
                                            key={definition.label}
                                            type="button"
                                            onClick={() => handleFormatChange(definition.label)}
                                            title={definition.description}
                                            style={{
                                                border: definition.label === format ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                background: definition.label === format ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '8px 14px',
                                                fontWeight: definition.label === format ? 700 : 400,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {definition.icon} {definition.label}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#93c5fd', marginTop: '4px' }}>
                                    {formatDefinitions[format]?.description || ''}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Recording Devices</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {studioModes.map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => {
                                                setSelectedMode(mode);
                                                setStatus(`Recording capture device set to ${mode}.`);
                                                broadcastTandemState({ selectedMode: mode });
                                            }}
                                            style={{
                                                border: selectedMode === mode ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                background: selectedMode === mode ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '8px 14px',
                                                fontWeight: selectedMode === mode ? 700 : 400,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Story Angle</span>
                                <input
                                    value={storyAngle}
                                    placeholder="Describe your own angle, goal, or audience impact"
                                    onChange={(event) => {
                                        setStoryAngle(event.target.value);
                                        setRunOrderApproved(false);
                                        broadcastTandemState({ storyAngle: event.target.value, runOrderApproved: false });
                                    }}
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
                                <span style={{ color: 'var(--light-color)' }}>Dispatch Urgency</span>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {['Breaking', 'Standard', 'Feature'].map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => handleUrgencyChange(value)}
                                            style={{
                                                border: urgency === value ? '1px solid var(--highlight-color)' : '1px solid var(--border-color)',
                                                background: urgency === value ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                                                color: 'var(--text-color)',
                                                borderRadius: '999px',
                                                padding: '8px 14px',
                                                fontWeight: urgency === value ? 700 : 400,
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {value}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Live Script (Synced across paired team)</span>
                                <textarea
                                    value={scriptText}
                                    placeholder="Write your own script, producer notes, direction cues, and optional music loop plan"
                                    onChange={(event) => {
                                        setScriptText(event.target.value);
                                        setRunOrderApproved(false);
                                        if (activeWorkspacePage) {
                                            const updatedPages = workspacePages.map((page) => (
                                                page.id === activeWorkspacePage.id
                                                    ? { ...page, content: event.target.value }
                                                    : page
                                            ));
                                            setWorkspacePages(updatedPages);
                                            broadcastTandemState({ scriptText: event.target.value, workspacePages: updatedPages, runOrderApproved: false });
                                            return;
                                        }

                                        broadcastTandemState({ scriptText: event.target.value, runOrderApproved: false });
                                    }}
                                    rows={8}
                                    disabled={!canEditLiveScript}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-color)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'var(--text-color)',
                                        resize: 'vertical',
                                        opacity: canEditLiveScript ? 1 : 0.6
                                    }}
                                />
                                <div style={{ fontSize: '12px', color: '#93c5fd' }}>
                                    Helper only: no prewritten script is inserted. Define your own producer, director, scriptwriter, background music, and prerecorded startup loop details here.
                                </div>
                            </label>

                            <div style={{ display: 'grid', gap: '10px', marginTop: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ color: 'var(--light-color)', fontWeight: 700 }}>Script Pipeline Segment Form (1-4)</span>
                                    <button
                                        type="button"
                                        onClick={applyScriptPipelineToScript}
                                        disabled={!canEditScriptPipeline}
                                        style={{
                                            border: '1px solid var(--highlight-color)',
                                            background: 'rgba(56, 189, 248, 0.15)',
                                            color: 'var(--text-color)',
                                            borderRadius: '10px',
                                            padding: '8px 12px',
                                            cursor: canEditScriptPipeline ? 'pointer' : 'not-allowed',
                                            opacity: canEditScriptPipeline ? 1 : 0.65,
                                            fontWeight: 700
                                        }}
                                    >
                                        Apply Pipeline to Live Script
                                    </button>
                                </div>

                                {scriptPipelineSegments.map((segment) => (
                                    <label key={segment.key} style={{ display: 'grid', gap: '6px' }}>
                                        <span style={{ color: 'var(--light-color)' }}>{segment.label}</span>
                                        <textarea
                                            value={scriptPipeline[segment.key] || ''}
                                            placeholder={segment.helper}
                                            onChange={(event) => updateScriptPipelineSegment(segment.key, event.target.value)}
                                            rows={3}
                                            disabled={!canEditScriptPipeline}
                                            style={{
                                                padding: '10px',
                                                borderRadius: '10px',
                                                border: '1px solid var(--border-color)',
                                                background: 'rgba(255,255,255,0.03)',
                                                color: 'var(--text-color)',
                                                resize: 'vertical',
                                                opacity: canEditScriptPipeline ? 1 : 0.65
                                            }}
                                        />
                                        <span style={{ fontSize: '12px', color: '#93c5fd' }}>{segment.helper}</span>
                                    </label>
                                ))}
                            </div>

                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleClearForms}
                                    disabled={isRecording || isSavingRecording}
                                    style={{
                                        border: '1px solid rgba(248, 113, 113, 0.55)',
                                        background: 'rgba(127, 29, 29, 0.35)',
                                        color: '#fecaca',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontWeight: 700,
                                        cursor: (isRecording || isSavingRecording) ? 'not-allowed' : 'pointer',
                                        opacity: (isRecording || isSavingRecording) ? 0.55 : 1
                                    }}
                                    title="Clear podcast forms with confirmation"
                                >
                                    Clear Forms
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const snapshot = buildSessionSnapshot();
                                        const version = Date.now().toString();
                                        try {
                                            localStorage.setItem('wisePodcastScriptDraft', scriptText);
                                            localStorage.setItem(PODCAST_AUTOSAVE_STORAGE_KEY, JSON.stringify({ version, snapshot }));
                                            autosaveVersionRef.current = version;
                                            setLastAutosavedAt(new Date().toLocaleTimeString());
                                        } catch {
                                            // Ignore local save errors.
                                        }

                                        void authService.savePodcastSessionSnapshot({
                                            roomId: 'main',
                                            version,
                                            snapshot
                                        }).then((response) => {
                                            const committedVersion = String(response?.version || version).trim();
                                            autosaveVersionRef.current = committedVersion;
                                        }).catch(() => {
                                            // Cloud save best effort only.
                                        });

                                        broadcastTandemState({ scriptText });
                                        setStatus('Script draft saved to studio storage and cloud autosave.');
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
                                    onClick={handleShareScript}
                                    style={{
                                        border: '1px solid var(--highlight-color)',
                                        background: 'rgba(56, 189, 248, 0.2)',
                                        color: 'var(--text-color)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Share script
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApproveRunOrder}
                                    disabled={!canApproveWorkflow}
                                    style={{
                                        border: runOrderApproved ? '1px solid #22c55e' : '1px solid var(--border-color)',
                                        background: runOrderApproved ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.03)',
                                        color: runOrderApproved ? '#4ade80' : 'var(--text-color)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontWeight: runOrderApproved ? 700 : 400,
                                        cursor: canApproveWorkflow ? 'pointer' : 'not-allowed',
                                        opacity: canApproveWorkflow ? 1 : 0.65
                                    }}
                                >
                                    {runOrderApproved ? '✓ Run order approved' : 'Approve run order'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Team Room & Guest Management */}
                    <div style={{ display: 'grid', gap: '20px' }}>
                        {/* Guest Quick Connect Box */}
                        {(workflowStage === 'Team') && (
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                                Guest Room & Quick Join
                            </div>
                            <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                                <input
                                    type="text"
                                    value={guestNameInput}
                                    onChange={(e) => setGuestNameInput(e.target.value)}
                                    placeholder="Guest Name or Handle"
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleGuestInvite}
                                    style={{
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #10b981, #059669)',
                                        color: '#fff',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    ➕ Pair Guest Feed
                                </button>
                                <input
                                    type="text"
                                    value={quickJoinInput}
                                    onChange={(e) => setQuickJoinInput(e.target.value)}
                                    placeholder="Room ID or invite link for quick join"
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)',
                                        background: 'rgba(255,255,255,0.04)',
                                        color: 'var(--text-color)'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={handleQuickJoin}
                                    style={{
                                        border: '1px solid rgba(56, 189, 248, 0.5)',
                                        background: 'rgba(56, 189, 248, 0.15)',
                                        color: 'var(--text-color)',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Quick Join Room
                                </button>
                            </div>
                        </div>
                        )}

                        {/* Synced Tandem Team Roster */}
                        {(workflowStage === 'Team') && (
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                                Synced Tandem Team ({teamMembersList.length})
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#bfdbfe' }}>
                                Creator can designate approvers and decouple persistent links.
                            </div>
                            <div style={{ display: 'grid', gap: '10px', marginTop: '14px' }}>
                                {teamMembersList.map((member, i) => (
                                    <div
                                        key={`${member.name}-${i}`}
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
                                            <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {member.name}
                                                <span style={{
                                                    fontSize: '10px',
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    background: member.coupled === false ? 'rgba(248, 113, 113, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                                    color: member.coupled === false ? '#fca5a5' : '#86efac'
                                                }}>
                                                    {member.coupled === false ? 'Decoupled' : 'Coupled'}
                                                </span>
                                                {designeeKeys.includes(resolveMemberKey(member)) && (
                                                    <span style={{
                                                        fontSize: '10px',
                                                        borderRadius: '4px',
                                                        padding: '2px 6px',
                                                        background: 'rgba(59, 130, 246, 0.25)',
                                                        color: '#bfdbfe'
                                                    }}>
                                                        Designee
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: '10px',
                                                    background: member.loginState === 'online'
                                                        ? 'rgba(34, 197, 94, 0.2)'
                                                        : member.loginState === 'identified'
                                                            ? 'rgba(56, 189, 248, 0.2)'
                                                            : 'rgba(234, 179, 8, 0.2)',
                                                    color: member.loginState === 'online'
                                                        ? '#4ade80'
                                                        : member.loginState === 'identified'
                                                            ? '#7dd3fc'
                                                            : '#fcd34d',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px'
                                                }}>
                                                    {member.loginStatus || 'Synced'}
                                                </span>
                                            </div>
                                            <div style={{ color: 'var(--light-color)', fontSize: '12px' }}>{member.role}</div>
                                            {member.identifier && (
                                                <div style={{ color: '#93c5fd', fontSize: '11px' }}>
                                                    Login ID: {member.identifier}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: 'right', color: 'var(--light-color)', fontSize: '12px' }}>
                                            <div>{member.locale}</div>
                                            <div>{member.device}</div>
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleJoinRoom(member)}
                                                    disabled={!isCreator && !isDesignee}
                                                    style={{
                                                        border: '1px solid rgba(16, 185, 129, 0.55)',
                                                        borderRadius: '6px',
                                                        background: member.loginState === 'online'
                                                            ? 'rgba(14, 116, 144, 0.25)'
                                                            : 'rgba(16, 185, 129, 0.25)',
                                                        color: member.loginState === 'online' ? '#bae6fd' : '#86efac',
                                                        fontSize: '11px',
                                                        padding: '4px 8px',
                                                        cursor: (isCreator || isDesignee) ? 'pointer' : 'not-allowed',
                                                        opacity: (isCreator || isDesignee) ? 1 : 0.65,
                                                        fontWeight: 700
                                                    }}
                                                    title="JoinRoom toggle admission"
                                                >
                                                    {member.loginState === 'online' ? 'JoinRoom: ON' : 'JoinRoom: OFF'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDesignee(member)}
                                                    disabled={!isCreator}
                                                    style={{
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '6px',
                                                        background: designeeKeys.includes(resolveMemberKey(member)) ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                                                        color: 'var(--text-color)',
                                                        fontSize: '11px',
                                                        padding: '4px 8px',
                                                        cursor: isCreator ? 'pointer' : 'not-allowed',
                                                        opacity: isCreator ? 1 : 0.65
                                                    }}
                                                >
                                                    {designeeKeys.includes(resolveMemberKey(member)) ? 'Remove designee' : 'Assign designee'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => decoupleTeamMember(member)}
                                                    disabled={!isCreator && !isDesignee}
                                                    style={{
                                                        border: '1px solid rgba(239, 68, 68, 0.45)',
                                                        borderRadius: '6px',
                                                        background: 'rgba(239, 68, 68, 0.16)',
                                                        color: '#fecaca',
                                                        fontSize: '11px',
                                                        padding: '4px 8px',
                                                        cursor: (isCreator || isDesignee) ? 'pointer' : 'not-allowed',
                                                        opacity: (isCreator || isDesignee) ? 1 : 0.65
                                                    }}
                                                >
                                                    Decouple
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        )}

                        {/* Session Status */}
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                                Session Status
                            </div>
                            <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '10px' }}>{status}</div>
                            <div style={{ marginTop: '10px', fontSize: '13px', color: 'var(--light-color)' }}>
                                Role in control: {controlRole} · Urgency: {urgency}
                            </div>
                            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--light-color)' }}>
                                Policy sync: {syncSource === 'server' ? 'server-verified' : syncSource === 'fallback' ? 'token fallback' : syncSource}
                            </div>
                            {syncError && (
                                <div style={{ marginTop: '8px', fontSize: '12px', color: '#fca5a5' }}>{syncError}</div>
                            )}
                        </div>
                    </div>
                </div>
                )}

                {(workflowStage === 'Plan' || workflowStage === 'Script' || workflowStage === 'Team' || workflowStage === 'Ship') && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                        Persistent Workspace Pages
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '13px', color: 'var(--light-color)' }}>
                        Keep unlimited pages for scripts, subject matter, props, and references. Pages persist until your team removes them.
                    </div>

                    <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px' }}>
                        <input
                            type="text"
                            value={newPageTitle}
                            onChange={(event) => setNewPageTitle(event.target.value)}
                            placeholder="Page title (optional: Producer Notes, Director Plan, Music Bed, Intro Loop)"
                            style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-color)'
                            }}
                        />
                        <select
                            value={newPageType}
                            onChange={(event) => setNewPageType(event.target.value)}
                            style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-color)'
                            }}
                        >
                            <option value="Script">Script</option>
                            <option value="Subject">Subject</option>
                            <option value="Props">Props</option>
                            <option value="Reference">Reference</option>
                        </select>
                        <button
                            type="button"
                            onClick={addWorkspacePage}
                            style={{
                                border: 'none',
                                borderRadius: '8px',
                                background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
                                color: '#fff',
                                padding: '10px 12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Add page
                        </button>
                    </div>

                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {workspacePages.map((page) => (
                            <button
                                key={page.id}
                                type="button"
                                onClick={() => {
                                    setActiveWorkspacePageId(page.id);
                                    if (page.type === 'Script') {
                                        setScriptText(page.content || '');
                                    }
                                    broadcastTandemState({ activeWorkspacePageId: page.id });
                                }}
                                style={{
                                    border: page.id === activeWorkspacePageId ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                                    borderRadius: '999px',
                                    background: page.id === activeWorkspacePageId ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
                                    color: 'var(--text-color)',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                }}
                            >
                                {page.type}: {String(page.title || '').trim() || 'Untitled'}
                            </button>
                        ))}
                    </div>

                    {activeWorkspacePage && (
                        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
                            <input
                                type="text"
                                value={activeWorkspacePage.title}
                                onChange={(event) => updateWorkspacePage(activeWorkspacePage.id, { title: event.target.value })}
                                placeholder="Page title"
                                style={{
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)'
                                }}
                            />
                            <textarea
                                value={activeWorkspacePage.content || ''}
                                onChange={(event) => updateWorkspacePage(activeWorkspacePage.id, { content: event.target.value })}
                                rows={8}
                                placeholder="Add your own page content"
                                style={{
                                    padding: '12px',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border-color)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-color)',
                                    resize: 'vertical'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)' }}>
                                    Type: {activeWorkspacePage.type}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeWorkspacePage(activeWorkspacePage.id)}
                                    style={{
                                        border: '1px solid rgba(239, 68, 68, 0.45)',
                                        borderRadius: '8px',
                                        background: 'rgba(239, 68, 68, 0.16)',
                                        color: '#fecaca',
                                        padding: '8px 10px',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Remove page
                                </button>
                            </div>
                        </div>
                    )}
                </div>
                )}
            </div>

            {/* ── Pricing Modal ── */}
            {showPricingModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(15,23,42,0.99), rgba(30,15,55,0.95))',
                        border: '1px solid rgba(129,140,248,0.3)',
                        borderRadius: '24px',
                        padding: '32px',
                        maxWidth: '900px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <div style={{ fontSize: '20px', fontWeight: 800, color: '#e2e8f0', marginBottom: '4px' }}>
                                    🚀 Podcast Studio Plans
                                </div>
                                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                    Choose your tier and start your free trial today — no credit card required.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPricingModal(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    color: '#94a3b8'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Billing cycle toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', justifyContent: 'center' }}>
                            <span style={{ fontSize: '12px', color: billingCycle === 'monthly' ? '#e2e8f0' : '#94a3b8', fontWeight: billingCycle === 'monthly' ? 700 : 400 }}>Monthly</span>
                            <button
                                type="button"
                                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'annual' : 'monthly')}
                                style={{
                                    background: 'rgba(129,140,248,0.2)',
                                    border: '1px solid rgba(129,140,248,0.3)',
                                    borderRadius: '20px',
                                    padding: '4px 12px',
                                    fontSize: '12px',
                                    color: '#a5b4fc',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                {billingCycle === 'monthly' ? 'Switch to Annual' : 'Switch to Monthly'}
                            </button>
                            <span style={{ fontSize: '12px', color: billingCycle === 'annual' ? '#e2e8f0' : '#94a3b8', fontWeight: billingCycle === 'annual' ? 700 : 400 }}>
                                Annual {billingCycle === 'annual' && '(Save 20%)'}
                            </span>
                        </div>

                        {/* Plans grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            {Object.entries(PODCAST_PRICING_PLANS).map(([key, plan]) => {
                                const priceUsd = billingCycle === 'monthly' ? (plan.prices.monthly / 100).toFixed(2) : (plan.prices.annual / 100).toFixed(2);
                                const billingLabel = billingCycle === 'monthly' ? '/month' : '/year';
                                const isSelected = selectedPlan === key;
                                return (
                                    <div
                                        key={key}
                                        style={{
                                            background: isSelected ? 'rgba(129,140,248,0.15)' : 'rgba(30,15,55,0.8)',
                                            border: isSelected ? '2px solid rgba(129,140,248,0.6)' : '1px solid rgba(129,140,248,0.2)',
                                            borderRadius: '16px',
                                            padding: '20px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) e.currentTarget.style.background = 'rgba(129,140,248,0.08)';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) e.currentTarget.style.background = 'rgba(30,15,55,0.8)';
                                        }}
                                        onClick={() => setSelectedPlan(key)}
                                    >
                                        {plan.featured && (
                                            <div style={{ position: 'absolute', top: '-12px', left: '16px', background: 'linear-gradient(135deg, #fbbf24, #f59e0b)', color: '#1f2937', padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                                                BEST VALUE
                                            </div>
                                        )}
                                        <div style={{ marginBottom: '12px' }}>
                                            <div style={{ fontSize: '16px', fontWeight: 800, color: '#e2e8f0', marginBottom: '2px' }}>
                                                {plan.name}
                                            </div>
                                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                                {plan.tagline}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid rgba(129,140,248,0.15)' }}>
                                            <div style={{ fontSize: '28px', fontWeight: 900, color: '#e2e8f0' }}>
                                                ${priceUsd}
                                                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400, marginLeft: '4px' }}>
                                                    {billingLabel}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                                {plan.trial.message}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: '16px', flex: 1 }}>
                                            {plan.features.map((feature, idx) => (
                                                <div key={idx} style={{ fontSize: '12px', color: '#cbd5e1', display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <span style={{ color: '#4ade80', fontWeight: 700 }}>✓</span>
                                                    <span>{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleStartTrial(key)}
                                            style={{
                                                width: '100%',
                                                border: isSelected ? '1px solid rgba(129,140,248,0.6)' : '1px solid rgba(129,140,248,0.3)',
                                                background: isSelected ? 'rgba(129,140,248,0.25)' : 'rgba(129,140,248,0.1)',
                                                color: '#a5b4fc',
                                                borderRadius: '10px',
                                                padding: '10px 16px',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(129,140,248,0.35)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = isSelected ? 'rgba(129,140,248,0.25)' : 'rgba(129,140,248,0.1)';
                                            }}
                                        >
                                            Start {plan.trial.days}-day free trial
                                        </button>
                                    </div>
                                );
                            })}
                        </div>

                        {/* FAQ */}
                        <div style={{ background: 'rgba(30,15,55,0.6)', border: '1px solid rgba(129,140,248,0.15)', borderRadius: '12px', padding: '16px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px' }}>
                                ❓ Common Questions
                            </div>
                            <div style={{ fontSize: '11px', color: '#cbd5e1', display: 'grid', gap: '8px' }}>
                                <div><strong>• Billing:</strong> Your trial auto-converts to a paid subscription on day 15 (or 8/30 depending on plan). Cancel anytime from Settings.</div>
                                <div><strong>• Multiple plans:</strong> You can only have one active subscription. Upgrading cancels your current plan.</div>
                                <div><strong>• Money-back:</strong> Not happy? Email support@wiseravenshare.com within 14 days for a full refund.</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Compartment>
    );
};

export default PodcastStudioPage;
