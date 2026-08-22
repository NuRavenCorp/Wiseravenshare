import React, { useEffect, useMemo, useRef, useState } from 'react';
import Compartment from '../Components/Common/Compartment';
import { consumePodcastHandoffDraft } from '../Services/podcastStudioBridge';
import { authService } from '../Services/Auth.jsx';
import { useAuth } from '../Contexts/AuthContext';
import { upsertLocalVideo, buildLocalFallbackVideo } from '../Services/ravensightVideoStore';
import { ravensightAPI } from '../Services/RavensightAPI';

const initialTeamMembers = [
    { name: 'Maya', role: 'Host', locale: 'New York, USA', device: 'Laptop', status: 'Synced in Tandem', syncedAt: 'Active' },
    { name: 'Luis', role: 'Guest', locale: 'Madrid, Spain', device: 'Tablet', status: 'Synced in Tandem', syncedAt: 'Active' },
    { name: 'Nia', role: 'Producer', locale: 'Nairobi, Kenya', device: 'Phone', status: 'Synced in Tandem', syncedAt: 'Active' },
    { name: 'Ari', role: 'Script Lead', locale: 'Toronto, Canada', device: 'Camera rig', status: 'Synced in Tandem', syncedAt: 'Active' }
];

const scriptBlocks = [
    'Opening hook and audience framing',
    'Guest introduction with context and tone',
    'Three key takeaways and proof points',
    'Call-to-action and audience prompt'
];

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

const PodcastStudioPage = () => {
    const { user } = useAuth();
    const [title, setTitle] = useState('The Social Creator Teams Brief');
    const [format, setFormat] = useState('Interview');
    const [status, setStatus] = useState('Ready to record');
    const [selectedMode, setSelectedMode] = useState('Desktop');
    const [scriptText, setScriptText] = useState(
        'Welcome to today\'s episode. We are building a creator operating system that helps teams produce, publish, and grow from anywhere.'
    );
    const [controlRole, setControlRole] = useState('Owner');
    const [storyAngle, setStoryAngle] = useState('Community impact and verified eyewitness accounts');
    const [urgency, setUrgency] = useState('Standard');
    const [syncSource, setSyncSource] = useState('local');
    const [syncError, setSyncError] = useState('');
    const [syncingRole, setSyncingRole] = useState('');
    const [allowedRoleLabels, setAllowedRoleLabels] = useState(controlRoles);
    const [permissions, setPermissions] = useState(rolePermissions.Owner);

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
    const [tandemSyncedAt, setTandemSyncedAt] = useState(null);
    const [syncMessage, setSyncMessage] = useState('');
    const [guestNameInput, setGuestNameInput] = useState('');

    // Refs
    const videoRef = useRef(null);
    const guestVideoRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const broadcastChannelRef = useRef(null);

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
            // The signed-in user is the team leader (Owner) unless the server says otherwise.
            const resolvedLabel = apiRoleToRoleLabel[String(state?.effectiveRole || '').trim().toLowerCase()] || 'Owner';
            const allowedRoles = Array.isArray(state?.allowedRoles) && state.allowedRoles.length > 0
                ? state.allowedRoles
                    .map((role) => apiRoleToRoleLabel[String(role || '').trim().toLowerCase()])
                    .filter(Boolean)
                : controlRoles;

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
            scriptText: overrides.scriptText ?? scriptText,
            storyAngle: overrides.storyAngle ?? storyAngle,
            urgency: overrides.urgency ?? urgency,
            teamMembersList: overrides.teamMembersList ?? teamMembersList,
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

    useEffect(() => {
        loadPodcastControlPolicy();

        try {
            const channel = new BroadcastChannel('wiseraven_podcast_tandem_sync');
            broadcastChannelRef.current = channel;

            channel.onmessage = (event) => {
                const data = event.data;
                if (data?.type === 'PODCAST_TANDEM_SYNC') {
                    if (data.title) setTitle(data.title);
                    if (data.scriptText) setScriptText(data.scriptText);
                    if (data.storyAngle) setStoryAngle(data.storyAngle);
                    if (data.urgency) setUrgency(data.urgency);
                    if (Array.isArray(data.teamMembersList)) setTeamMembersList(data.teamMembersList);
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
                    if (data.scriptText) setScriptText(data.scriptText);
                    if (data.storyAngle) setStoryAngle(data.storyAngle);
                    if (data.urgency) setUrgency(data.urgency);
                    if (Array.isArray(data.teamMembersList)) setTeamMembersList(data.teamMembersList);
                    setTandemSyncedAt(new Date().toLocaleTimeString());
                } catch {
                    // Ignore parse error
                }
            }
        };

        window.addEventListener('storage', handleStorage);
        return () => {
            if (broadcastChannelRef.current) {
                broadcastChannelRef.current.close();
            }
            window.removeEventListener('storage', handleStorage);
        };
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

        setStatus(`Dispatch handoff received (${handoff.urgency || 'Standard'})`);
    }, []);

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
            if (response?.video) {
                upsertLocalVideo({
                    ...response.video,
                    userId: user?.id,
                    channelName: user?.name || 'WiseRaven Podcast Host',
                    channelAvatar: user?.avatar,
                    videoUrl: response.video.videoUrl || recordedVideoUrl
                });
            } else {
                throw new Error('Local store fallback');
            }
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
            setStatus('Podcast recording saved locally to Ravensight Library.');
        } finally {
            setIsSavingRecording(false);
        }
    };

    // Tandem Member Sync Handler (Username or Email Pairing)
    const handleSyncConnection = (e) => {
        e?.preventDefault();
        const identifier = syncInput.trim();
        if (!identifier) {
            setSyncMessage('Please enter a username or email to pair.');
            return;
        }

        const nameFromEmail = identifier.includes('@') ? identifier.split('@')[0] : identifier.replace(/^@/, '');
        const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);

        const newMember = {
            name: formattedName,
            role: syncRole,
            locale: 'Remote Tandem',
            device: 'Paired Sync',
            status: 'Synced in Tandem',
            syncedAt: new Date().toLocaleTimeString(),
            identifier
        };

        const updatedList = [
            newMember,
            ...teamMembersList.filter((m) => m.identifier !== identifier && m.name !== formattedName)
        ];

        setTeamMembersList(updatedList);
        setSyncInput('');
        setSyncMessage(`Successfully paired ${identifier} as ${syncRole} in tandem!`);

        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Team member ${formattedName} synced in tandem as ${syncRole}.`);

        setTimeout(() => setSyncMessage(''), 4500);
    };

    const handleGuestInvite = () => {
        const gName = guestNameInput.trim();
        if (!gName) return;
        const newGuestMember = {
            name: gName,
            role: 'Guest',
            locale: 'Connected Remote',
            device: 'Mobile Mosaic',
            status: 'Synced in Tandem',
            syncedAt: new Date().toLocaleTimeString()
        };
        const updatedList = [newGuestMember, ...teamMembersList];
        setTeamMembersList(updatedList);
        setGuestNameInput('');
        setGuestConnected(true);
        broadcastTandemState({ teamMembersList: updatedList });
        setStatus(`Guest ${gName} connected to podcast studio!`);
    };

    // Format buttons generate their namesake episode structure:
    // Interview = interview questions · Solo = full solo rundown ·
    // Panel = engagement panel segments · Roundtable = group mind-share segments.
    const handleFormatChange = (nextFormat) => {
        const definition = formatDefinitions[nextFormat];
        if (!definition) return;

        setFormat(nextFormat);
        setScriptText(definition.segments.join('\n'));
        setStatus(`${definition.icon} ${definition.label} format: ${definition.description}`);
        broadcastTandemState({ format: nextFormat, scriptText: definition.segments.join('\n') });
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
                            <h2 style={{ margin: '8px 0 0', fontSize: '28px' }}>Social Creator Teams & Live Production</h2>
                        </div>

                        {/* Top Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {!isRecording ? (
                                <button
                                    type="button"
                                    onClick={startRecording}
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

                {/* Tandem Sync Connection Panel (Pairing by Username or Email) */}
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
                </div>

                {/* Video Monitor Grid & Remote Feeds */}
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

                        {/* Guest Cam A Stream */}
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                            padding: '14px',
                            position: 'relative'
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--light-color)' }}>Guest Cam A (Remote)</div>
                            <div style={{ marginTop: '12px', textAlign: 'center', padding: '16px 0' }}>
                                <div style={{ fontSize: '32px' }}>👤</div>
                                <div style={{ fontWeight: 700, marginTop: '6px' }}>
                                    {teamMembersList.find(m => m.role === 'Guest')?.name || 'Luis (Madrid)'}
                                </div>
                                <div style={{ fontSize: '12px', color: guestCamOn ? '#4ade80' : '#f87171', marginTop: '4px' }}>
                                    {guestCamOn ? 'Connected · Audio Active' : 'Camera Muted'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '6px' }}>
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
                        </div>

                        {/* Guest Cam B Stream */}
                        <div style={{
                            border: '1px solid var(--border-color)',
                            borderRadius: '14px',
                            background: 'linear-gradient(160deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))',
                            padding: '14px'
                        }}>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--light-color)' }}>Guest Cam B (Backup)</div>
                            <div style={{ marginTop: '12px', textAlign: 'center', padding: '16px 0' }}>
                                <div style={{ fontSize: '32px' }}>📱</div>
                                <div style={{ fontWeight: 700, marginTop: '6px' }}>Mobile Backup Feed</div>
                                <div style={{ fontSize: '12px', color: 'var(--light-color)', marginTop: '4px' }}>Standby · WebRTC</div>
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
                        </div>
                    </div>
                </div>

                {/* Recorded Session Preview & Library Export */}
                {recordedVideoUrl && (
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
                                    src={recordedVideoUrl}
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
                                        placeholder={title || 'My Podcast Recording'}
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
                                    <a
                                        href={recordedVideoUrl}
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
                                    <span style={{ color: permissions.canEditScript ? '#4ade80' : 'var(--light-color)' }}>
                                        {permissions.canEditScript ? '✓ Can edit script' : '✗ Script locked'}
                                    </span>
                                    <span style={{ color: permissions.canApproveSegments ? '#4ade80' : 'var(--light-color)' }}>
                                        {permissions.canApproveSegments ? '✓ Can approve segments' : '✗ Cannot approve'}
                                    </span>
                                </div>
                            </div>

                            <label style={{ display: 'grid', gap: '6px' }}>
                                <span style={{ color: 'var(--light-color)' }}>Podcast Title</span>
                                <input
                                    value={title}
                                    onChange={(event) => {
                                        setTitle(event.target.value);
                                        broadcastTandemState({ title: event.target.value });
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
                                    onChange={(event) => {
                                        setStoryAngle(event.target.value);
                                        broadcastTandemState({ storyAngle: event.target.value });
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
                                            onClick={() => {
                                                setUrgency(value);
                                                setStatus(`Dispatch urgency set to ${value}.`);
                                                broadcastTandemState({ urgency: value });
                                            }}
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
                                    onChange={(event) => {
                                        setScriptText(event.target.value);
                                        broadcastTandemState({ scriptText: event.target.value });
                                    }}
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
                                        try {
                                            localStorage.setItem('wisePodcastScriptDraft', scriptText);
                                        } catch {}
                                        broadcastTandemState({ scriptText });
                                        setStatus('Script draft saved successfully to local studio storage.');
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
                                        try {
                                            localStorage.setItem('wiseSharedPodcastScript', scriptText);
                                        } catch {}
                                        broadcastTandemState({ scriptText, shared: true });
                                        setStatus('Script shared and synced across all connected tandem team members.');
                                    }}
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
                                    onClick={() => {
                                        setRunOrderApproved(true);
                                        broadcastTandemState({ runOrderApproved: true });
                                        setStatus('Segment run order approved and locked for live production.');
                                    }}
                                    style={{
                                        border: runOrderApproved ? '1px solid #22c55e' : '1px solid var(--border-color)',
                                        background: runOrderApproved ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.03)',
                                        color: runOrderApproved ? '#4ade80' : 'var(--text-color)',
                                        borderRadius: '10px',
                                        padding: '10px 14px',
                                        fontWeight: runOrderApproved ? 700 : 400,
                                        cursor: 'pointer'
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
                            </div>
                        </div>

                        {/* Synced Tandem Team Roster */}
                        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                            <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                                Synced Tandem Team ({teamMembersList.length})
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
                                                <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '2px 6px', borderRadius: '4px' }}>
                                                    Synced
                                                </span>
                                            </div>
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

                {/* Script Pipeline */}
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '18px', padding: '20px' }}>
                    <div style={{ fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--light-color)' }}>
                        Script Pipeline
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
        </Compartment>
    );
};

export default PodcastStudioPage;

