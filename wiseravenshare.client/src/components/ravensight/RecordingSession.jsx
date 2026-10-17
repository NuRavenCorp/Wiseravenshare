import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Teleprompter from "@/components/podcasts/Teleprompter";
import CueCardDisplay from "@/components/podcasts/CueCardDisplay";
import IntroOutroControls from "@/components/podcasts/IntroOutroControls";
import { TEAM_ROLES } from "@/components/podcasts/PodcastLaunchWizard";
import { useWebRTCHost } from "@/hooks/useWebRTCHost";
import {
  Radio,
  StopCircle,
  Loader2,
  Camera,
  Clock,
  CheckCircle,
  Circle,
  Film,
  AlertCircle,
  Megaphone,
  Type,
  Music,
  Scissors,
  Upload,
  RadioTower,
  CloudUpload,
  Monitor,
  Users,
  Copy,
  ExternalLink,
  Wifi,
  Video,
} from "lucide-react";

const CAM_SLOTS = [
  { label: "Cam 01", role: "Host" },
  { label: "Cam 02", role: "Guest A" },
  { label: "Cam 03", role: "Guest B" },
  { label: "Cam 04", role: "B-Roll" },
];

const DIRECTOR_ROLES = ["director", "producer", "creator"];
const ROLE_PRIORITY = {
  camera: 0,
  host: 1,
  co_host: 2,
  director: 3,
  producer: 4,
  script_writer: 5,
  audio: 6,
  editor: 7,
  researcher: 8,
  guest: 9,
};
const ROLE_LABELS = Object.fromEntries(TEAM_ROLES.map((role) => [role.id, role.label]));

function resolveRoleLabel(role) {
  if (!role) return "Role to be chosen";
  return ROLE_LABELS[role] || role.replace(/_/g, " ");
}

function buildScriptPipeline(script) {
  const lines = (script || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    segment1: lines[0] || "",
    segment2: lines[1] || "",
    segment3: lines[2] || "",
    segment4: lines[3] || "",
  };
}

function normalizeParticipant(participant) {
  return {
    identifier:
      participant?.identifier ||
      participant?.user_id ||
      participant?.userId ||
      participant?.email ||
      "",
    displayName:
      participant?.display_name ||
      participant?.displayName ||
      participant?.identifier ||
      participant?.user_id ||
      participant?.userId ||
      "Crew member",
    role: participant?.role || "",
    device: participant?.device || "Device pending",
    responsibility: participant?.responsibility || "",
    isConnected: participant?.isConnected ?? true,
    addedAtUtc: participant?.addedAtUtc || new Date().toISOString(),
  };
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function generateLiveSessionCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeComparisonValue(value) {
  return (value || "").trim().toLowerCase();
}

function matchPeerToMember(peer, member) {
  if (!peer || !member) return false;

  const peerName = normalizeComparisonValue(peer.name);
  const peerRole = normalizeComparisonValue(peer.role);
  const peerDevice = normalizeComparisonValue(peer.device);
  const memberIdentifier = normalizeComparisonValue(member.identifier);
  const memberDisplayName = normalizeComparisonValue(member.displayName);
  const memberRole = normalizeComparisonValue(member.role);
  const memberDevice = normalizeComparisonValue(member.device);

  return (
    (memberDisplayName && peerName === memberDisplayName) ||
    (memberIdentifier && peerName === memberIdentifier) ||
    (memberRole && peerRole === memberRole && memberDevice && peerDevice === memberDevice)
  );
}

export default function RecordingSession({ podcast, onUpdate }) {
  const [devices, setDevices] = useState([]);
  const [assignments, setAssignments] = useState([null, null, null, null]);
  const [mainCam, setMainCam] = useState(0);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeSegment, setActiveSegment] = useState(-1);
  const [userRole, setUserRole] = useState(null);
  const [showPanel, setShowPanel] = useState("prompter");
  const [deliveryMode, setDeliveryMode] = useState(podcast.recording_mode || "");
  const [scriptCueIndex, setScriptCueIndex] = useState(-1);
  const [introPrompt, setIntroPrompt] = useState(null);
  const [studioScript, setStudioScript] = useState(podcast.script || "");
  const [teamRoster, setTeamRoster] = useState([]);
  const [directorNote, setDirectorNote] = useState("");
  const [directorTarget, setDirectorTarget] = useState("all");
  const [directorNotes, setDirectorNotes] = useState([]);
  const [broadcastCue, setBroadcastCue] = useState(null);
  const [liveScriptDraft, setLiveScriptDraft] = useState("");
  const [scriptSyncing, setScriptSyncing] = useState(false);
  const [snapshotVersion, setSnapshotVersion] = useState("");
  const [selectionVersion, setSelectionVersion] = useState("");
  const [liveSessionCode, setLiveSessionCode] = useState("");
  const [copiedValue, setCopiedValue] = useState("");
  const [newDeviceAlert, setNewDeviceAlert] = useState(null);

  const streamRefs = useRef([null, null, null, null]);
  const videoRefs = useRef([null, null, null, null]);
  const recorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const roomId = `podcast-${podcast.id}`;
  const {
    peers: livePeers,
    streams: liveStreams,
    connected: liveConnected,
    error: liveFeedError,
    sendSessionEvent,
  } = useWebRTCHost(liveSessionCode);
  const segments = podcast.itinerary || [];
  const scriptCues = (studioScript || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const canDirect = DIRECTOR_ROLES.includes(userRole) || podcast.created_by_id === undefined;
  const canEditStudioScript =
    canDirect ||
    ["script_writer", "host", "co_host", "researcher"].includes(userRole || "");
  const sortedRoster = useMemo(
    () =>
      [...teamRoster].sort((left, right) => {
        const leftPriority = ROLE_PRIORITY[left.role] ?? 99;
        const rightPriority = ROLE_PRIORITY[right.role] ?? 99;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return (left.displayName || left.identifier).localeCompare(
          right.displayName || right.identifier
        );
      }),
    [teamRoster]
  );
  const monitorRoster = useMemo(
    () => CAM_SLOTS.map((_, index) => sortedRoster[index] || null),
    [sortedRoster]
  );
  const remotePeers = useMemo(
    () => livePeers.filter((peer) => peer.role !== "host"),
    [livePeers]
  );
  const monitorFeeds = useMemo(() => {
    const unmatchedPeers = [...remotePeers];

    return CAM_SLOTS.map((_, index) => {
      const member = monitorRoster[index];
      let peerIndex = unmatchedPeers.findIndex((peer) => matchPeerToMember(peer, member));

      if (peerIndex < 0 && member?.role) {
        peerIndex = unmatchedPeers.findIndex(
          (peer) => normalizeComparisonValue(peer.role) === normalizeComparisonValue(member.role)
        );
      }

      if (peerIndex < 0 && !member) {
        peerIndex = 0;
      }

      const peer = peerIndex >= 0 ? unmatchedPeers.splice(peerIndex, 1)[0] : null;
      return {
        member,
        peer,
        stream: peer ? liveStreams[peer.id] || null : null,
      };
    });
  }, [liveStreams, monitorRoster, remotePeers]);

  const publishStudioState = useCallback(
    async (overrides = {}) => {
      if (!liveSessionCode) return;

      const nextSegmentIndex =
        overrides.activeSegment ?? activeSegment;
      const nextCueIndex =
        overrides.scriptCueIndex ?? scriptCueIndex;
      const nextRecording =
        overrides.recording ?? overrides.isRecording ?? recording;
      const nextMainCam = overrides.mainCam ?? mainCam;
      const nextCue =
        nextCueIndex >= 0 && nextCueIndex < scriptCues.length
          ? scriptCues[nextCueIndex]
          : "";
      const nextSegment =
        nextSegmentIndex >= 0 && nextSegmentIndex < segments.length
          ? segments[nextSegmentIndex]
          : null;
      const nextFeed = monitorFeeds[nextMainCam] || null;
      const nextAssignment = nextFeed?.member || null;
      const nextPeer = nextFeed?.peer || null;
      const shotPrompt = nextAssignment
        ? `${CAM_SLOTS[nextMainCam]?.label || "Live feed"} · ${resolveRoleLabel(
            nextAssignment.role || nextPeer?.role || ""
          )}${nextAssignment.responsibility ? ` · ${nextAssignment.responsibility}` : ""}`
        : `${CAM_SLOTS[nextMainCam]?.label || "Live feed"} standing by`;

      await sendSessionEvent("studio-state", {
        roomId,
        isRecording: nextRecording,
        deliveryMode: overrides.deliveryMode ?? deliveryMode,
        activeSegmentIndex: nextSegmentIndex,
        activeSegmentTitle: nextSegment?.segment_title || "",
        currentCue: nextCue,
        cueNumber: nextCueIndex >= 0 ? nextCueIndex + 1 : 0,
        totalCues: scriptCues.length,
        mainCam: nextMainCam,
        mainCamLabel: CAM_SLOTS[nextMainCam]?.label || "",
        shotPrompt,
        mainAssignment: nextAssignment
          ? {
              identifier: nextAssignment.identifier,
              displayName: nextAssignment.displayName,
              role: nextAssignment.role,
              device: nextAssignment.device,
              responsibility: nextAssignment.responsibility,
            }
          : null,
        mainPeer: nextPeer
          ? {
              name: nextPeer.name,
              role: nextPeer.role,
              device: nextPeer.device,
            }
          : null,
        feeds: monitorFeeds.map((feed, index) => ({
          slotLabel: CAM_SLOTS[index]?.label || `Cam ${index + 1}`,
          role: feed?.member?.role || feed?.peer?.role || "",
          device: feed?.member?.device || feed?.peer?.device || "",
          displayName: feed?.member?.displayName || feed?.peer?.name || "",
          responsibility: feed?.member?.responsibility || "",
          isLive: index === nextMainCam && nextRecording,
        })),
        updatedAt: new Date().toISOString(),
      });
    },
    [
      activeSegment,
      deliveryMode,
      liveSessionCode,
      mainCam,
      monitorFeeds,
      recording,
      roomId,
      scriptCueIndex,
      scriptCues,
      segments,
      sendSessionEvent,
    ]
  );

  const buildStudioSnapshot = useCallback(
    (overrides = {}) => ({
      podcastId: podcast.id,
      roomId,
      deliveryMode,
      mainCam,
      activeSegment,
      scriptCueIndex,
      isRecording: recording,
      liveSessionCode,
      directorNotes,
      teamRoster: teamRoster.map((member) => ({
        identifier: member.identifier,
        displayName: member.displayName,
        role: member.role,
        device: member.device,
        responsibility: member.responsibility,
      })),
      updatedAt: new Date().toISOString(),
      ...overrides,
    }),
    [
      podcast.id,
      roomId,
      deliveryMode,
      mainCam,
      activeSegment,
      scriptCueIndex,
      recording,
      liveSessionCode,
      directorNotes,
      teamRoster,
    ]
  );

  const saveStudioSnapshot = useCallback(
    async (snapshot, version = snapshotVersion) => {
      try {
        const response = await apiClient.requestJson(
          "/api/auth/team-access/podcast-session-snapshot",
          {
            method: "POST",
            body: JSON.stringify({
              roomId,
              snapshot,
              version,
            }),
          }
        );
        if (response?.version) {
          setSnapshotVersion(response.version);
        }
      } catch (syncError) {
        console.error("Failed to sync podcast session snapshot.", syncError);
      }
    },
    [roomId, snapshotVersion]
  );

  const saveTeamSelection = useCallback(
    async (participants, version = selectionVersion) => {
      try {
        const response = await apiClient.requestJson(
          "/api/auth/team-access/podcast-team-selection",
          {
            method: "POST",
            body: JSON.stringify({
              roomId,
              requestedMaxParticipants: Math.min(
                Math.max(participants.length || 1, 1),
                5
              ),
              deviceCapacity: Math.max(CAM_SLOTS.length, participants.length || 1),
              participants: participants.map((member) => ({
                identifier: member.identifier,
                displayName: member.displayName,
                role: member.role,
                device: member.device,
                isConnected: member.isConnected,
                addedAtUtc: member.addedAtUtc,
              })),
              version,
            }),
          }
        );
        if (response?.version) {
          setSelectionVersion(response.version);
        }
      } catch (syncError) {
        console.error("Failed to sync podcast team selection.", syncError);
      }
    },
    [roomId, selectionVersion]
  );

  // Load user's role from team membership
  useEffect(() => {
    const loadRole = async () => {
      try {
        const me = await apiClient.auth.me();
        if (!me) return;
        if (podcast.created_by_id === me.id) {
          setUserRole("creator");
          return;
        }
        const teamPage = await apiClient.entities.Team.filter({});
        const myTeams = (teamPage.items || []).filter((t) =>
          podcast.team_ids?.includes(t.id)
        );
        for (const team of myTeams) {
          const member = (team.member_details || []).find(
            (m) => m.user_id === me.id
          );
          if (member?.role) {
            setUserRole(member.role);
            return;
          }
        }
      } catch (loadError) {
        console.error("Failed to resolve podcast team role.", loadError);
      }
    };
    loadRole();
  }, [podcast.id]);

  useEffect(() => {
    setStudioScript(podcast.script || "");
  }, [podcast.id, podcast.script]);

  useEffect(() => {
    let cancelled = false;

    const loadStudioContext = async () => {
      try {
        const [teamPage, selectionResponse, snapshotResponse, sharedScriptResponse] =
          await Promise.all([
            apiClient.entities.Team.filter({}),
            apiClient
              .requestJson(
                `/api/auth/team-access/podcast-team-selection?roomId=${encodeURIComponent(roomId)}`,
                { method: "GET" }
              )
              .catch((syncError) => {
                console.error("Failed to load podcast team selection.", syncError);
                return null;
              }),
            apiClient
              .requestJson(
                `/api/auth/team-access/podcast-session-snapshot?roomId=${encodeURIComponent(roomId)}`,
                { method: "GET" }
              )
              .catch((syncError) => {
                console.error("Failed to load podcast session snapshot.", syncError);
                return null;
              }),
            apiClient
              .requestJson(
                `/api/auth/team-access/podcast-shared-script?roomId=${encodeURIComponent(roomId)}`,
                { method: "GET" }
              )
              .catch((syncError) => {
                console.error("Failed to load shared podcast script.", syncError);
                return null;
              }),
          ]);

        if (cancelled) return;

        const linkedTeams = (teamPage.items || []).filter((team) =>
          podcast.team_ids?.includes(team.id)
        );

        const participantsByIdentifier = new Map();
        linkedTeams.forEach((team) => {
          (team.member_details || []).forEach((member) => {
            const normalized = normalizeParticipant(member);
            const dedupeKey =
              normalized.identifier || normalized.displayName.toLowerCase();
            if (!participantsByIdentifier.has(dedupeKey)) {
              participantsByIdentifier.set(dedupeKey, normalized);
            }
          });
        });

        const rosterFromTeams = Array.from(participantsByIdentifier.values());
        const selectionParticipants = selectionResponse?.hasSelection
          ? (selectionResponse.participants || []).map((participant) =>
              normalizeParticipant(participant)
            )
          : [];
        const nextRoster =
          selectionParticipants.length > 0 ? selectionParticipants : rosterFromTeams;

        setTeamRoster(nextRoster);
        setSelectionVersion(selectionResponse?.version || "");

        if (selectionParticipants.length === 0 && rosterFromTeams.length > 0) {
          void saveTeamSelection(rosterFromTeams, selectionResponse?.version || "");
        }

        const snapshot = snapshotResponse?.hasSnapshot
          ? snapshotResponse.snapshot || {}
          : null;
        if (snapshot) {
          if (typeof snapshot.mainCam === "number") {
            setMainCam(Math.min(Math.max(snapshot.mainCam, 0), CAM_SLOTS.length - 1));
          }
          if (typeof snapshot.activeSegment === "number") {
            setActiveSegment(snapshot.activeSegment);
          }
          if (typeof snapshot.scriptCueIndex === "number") {
            setScriptCueIndex(snapshot.scriptCueIndex);
          }
          if (Array.isArray(snapshot.directorNotes)) {
            setDirectorNotes(snapshot.directorNotes);
          }
          if (!podcast.recording_mode && typeof snapshot.deliveryMode === "string") {
            setDeliveryMode(snapshot.deliveryMode);
          }
          if (typeof snapshot.liveSessionCode === "string") {
            setLiveSessionCode(snapshot.liveSessionCode);
          }
          setSnapshotVersion(snapshotResponse?.version || "");
        }

        if (sharedScriptResponse?.hasSharedScript && sharedScriptResponse.scriptText) {
          setStudioScript(sharedScriptResponse.scriptText);
        }
      } catch (loadError) {
        console.error("Failed to load podcast studio context.", loadError);
      }
    };

    loadStudioContext();

    return () => {
      cancelled = true;
    };
  }, [
    podcast.id,
    podcast.recording_mode,
    podcast.team_ids,
    roomId,
    saveTeamSelection,
  ]);

  useEffect(() => {
    videoRefs.current.forEach((videoElement, index) => {
      if (!videoElement) return;

      const remoteStream = monitorFeeds[index]?.stream || null;
      const localStream = streamRefs.current[index] || null;
      const nextStream = remoteStream || localStream;

      if (videoElement.srcObject !== nextStream) {
        videoElement.srcObject = nextStream;
      }
    });
  }, [assignments, monitorFeeds]);

  useEffect(() => {
    if (recording) return;

    const preferredIndex = monitorFeeds.findIndex((feed, index) => {
      const resolvedRole = feed?.peer?.role || feed?.member?.role || "";
      return (
        (feed?.stream || streamRefs.current[index]) &&
        ["camera", "host", "co_host", "director", "producer"].includes(resolvedRole)
      );
    });

    if (preferredIndex >= 0) {
      const currentFeed = monitorFeeds[mainCam];
      const currentHasSource = Boolean(currentFeed?.stream || streamRefs.current[mainCam]);
      if (!currentHasSource || preferredIndex !== mainCam) {
        setMainCam(preferredIndex);
        void saveStudioSnapshot(buildStudioSnapshot({ mainCam: preferredIndex }));
        void publishStudioState({ mainCam: preferredIndex });
      }
    }
  }, [
    buildStudioSnapshot,
    mainCam,
    monitorFeeds,
    publishStudioState,
    recording,
    saveStudioSnapshot,
  ]);

  // Enumerate video devices, immediately activate the first camera, detect BT/new cameras
  useEffect(() => {
    const enumerate = async () => {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === "videoinput");
    };

    const init = async () => {
      try {
        // Keep the stream alive — route it to slot 0 so the camera activates immediately
        const permStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        const cams = await enumerate();
        setDevices(cams);

        if (cams.length > 0) {
          streamRefs.current[0] = permStream;
          setAssignments((prev) => {
            const next = [...prev];
            next[0] = cams[0].deviceId;
            return next;
          });
        } else {
          permStream.getTracks().forEach((t) => t.stop());
        }
      } catch (err) {
        setError("Camera access denied. Allow camera and microphone permissions, then reload.");
      }
    };

    init();

    // Detect BT or newly connected cameras at any time
    const onDeviceChange = async () => {
      try {
        const updated = await enumerate();
        setDevices((prev) => {
          const prevIds = new Set(prev.map((d) => d.deviceId));
          const newCam = updated.find((d) => !prevIds.has(d.deviceId));
          if (newCam) {
            setNewDeviceAlert(newCam.label || "New camera detected — select it from the camera list");
          }
          return updated;
        });
      } catch (_) {}
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
  }, []);

  const assignDevice = useCallback(async (slotIdx, deviceId) => {
    if (streamRefs.current[slotIdx]) {
      streamRefs.current[slotIdx].getTracks().forEach((t) => t.stop());
      streamRefs.current[slotIdx] = null;
    }
    setAssignments((prev) => {
      const next = [...prev];
      next[slotIdx] = deviceId || null;
      return next;
    });
    if (!deviceId) {
      if (videoRefs.current[slotIdx]) videoRefs.current[slotIdx].srcObject = null;
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: false,
      });
      streamRefs.current[slotIdx] = stream;
    } catch (err) {
      setError(`Failed to access camera for ${CAM_SLOTS[slotIdx].label}.`);
    }
  }, []);

  const ensureLiveSessionCode = useCallback(() => {
    if (liveSessionCode) {
      return liveSessionCode;
    }

    const nextCode = generateLiveSessionCode();
    setLiveSessionCode(nextCode);
    void saveStudioSnapshot(
      buildStudioSnapshot({
        liveSessionCode: nextCode,
      })
    );
    return nextCode;
  }, [buildStudioSnapshot, liveSessionCode, saveStudioSnapshot]);

  const copyText = useCallback(async (value, key) => {
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(key);
      window.setTimeout(() => setCopiedValue(""), 2000);
    } catch (copyError) {
      console.error("Failed to copy studio link.", copyError);
      setError("Could not copy the live feed link.");
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    if (deliveryMode !== "live") {
      setError("Choose Live Screening mode before starting episode capture.");
      return;
    }
    const mainStream = monitorFeeds[mainCam]?.stream || streamRefs.current[mainCam];
    const usingRemoteFeed = Boolean(monitorFeeds[mainCam]?.stream);
    if (!mainStream) {
      setError("Assign a local camera or connect a live crew feed to the main slot first.");
      return;
    }
    try {
      ensureLiveSessionCode();
      const combined = new MediaStream();
      mainStream.getVideoTracks().forEach((t) => combined.addTrack(t));

      const mainAudioTracks = mainStream.getAudioTracks();
      if (mainAudioTracks.length > 0) {
        mainAudioTracks.forEach((track) => combined.addTrack(track));
      } else if (!usingRemoteFeed) {
        audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        audioStreamRef.current.getAudioTracks().forEach((t) => combined.addTrack(t));
      }

      const mimeType = MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";
      const recorder = new MediaRecorder(combined, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = handleUpload;
      recorderRef.current = recorder;
      recorder.start(5000);
      const nextActiveSegment = segments.length > 0 ? 0 : -1;
      const nextScriptCueIndex = scriptCues.length > 0 ? 0 : -1;
      setRecording(true);
      setElapsed(0);
      setActiveSegment(nextActiveSegment);
      setScriptCueIndex(nextScriptCueIndex);
      setShowPanel(scriptCues.length > 0 ? "cues" : "prompter");
      if (podcast.intro_uri) {
        setIntroPrompt("live");
      }
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      void saveStudioSnapshot(
        buildStudioSnapshot({
          isRecording: true,
          activeSegment: nextActiveSegment,
          scriptCueIndex: nextScriptCueIndex,
        })
      );
      void publishStudioState({
        recording: true,
        activeSegment: nextActiveSegment,
        scriptCueIndex: nextScriptCueIndex,
      });
    } catch (err) {
      setError("Failed to start recording: " + (err.message || "Unknown error"));
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((t) => t.stop());
      audioStreamRef.current = null;
    }
    setRecording(false);
    if (podcast.intro_uri) {
      setIntroPrompt("post");
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    void saveStudioSnapshot(buildStudioSnapshot({ isRecording: false }));
    void publishStudioState({ recording: false });
  };

  const handleUpload = async () => {
    if (chunksRef.current.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const blob = new Blob(chunksRef.current, { type: chunksRef.current[0].type });
      const ext = blob.type.includes("webm") ? "webm" : "mp4";
      const file = new File([blob], `ep-${podcast.episode_number}-raw-${Date.now()}.${ext}`, {
        type: blob.type,
      });
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: `Episode ${podcast.episode_number} Raw Capture`,
        description: podcast.title || "Podcast raw capture",
      });
      const fileUri = upload.mediaUrl || upload.file?.mediaUrl || "";
      const updateData = {
        raw_media_uri: fileUri,
        status: "recording",
        board_stage: "editing",
      };
      if (!podcast.episode_media_uri) {
        updateData.episode_media_uri = fileUri;
      }
      await apiClient.entities.Podcast.update(podcast.id, updateData);
      onUpdate();
    } catch (err) {
      setError("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const promoteRawToEdited = async () => {
    if (!podcast.raw_media_uri) return;
    await apiClient.entities.Podcast.update(podcast.id, {
      episode_media_uri: podcast.raw_media_uri,
      board_stage: "review",
    });
    onUpdate();
  };

  const uploadEdited = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: `${podcast.title || "Podcast"} Edited Episode`,
        description: "Edited podcast upload",
      });
      await apiClient.entities.Podcast.update(podcast.id, {
        episode_media_uri: upload.mediaUrl || upload.file?.mediaUrl || "",
        board_stage: "review",
      });
      onUpdate();
    } catch {
      setError("Edited upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const saveDeliveryMode = async (mode) => {
    setDeliveryMode(mode);
    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        recording_mode: mode,
      });
      onUpdate?.();
      void saveStudioSnapshot(buildStudioSnapshot({ deliveryMode: mode }));
      void publishStudioState({ deliveryMode: mode });
    } catch (saveError) {
      console.error("Failed to persist recording mode.", saveError);
      setError("Episode mode changed locally, but the update could not be saved.");
    }
  };

  const appendLiveScript = async () => {
    if (!liveScriptDraft.trim()) return;

    const nextScript = [studioScript.trimEnd(), liveScriptDraft.trim()]
      .filter(Boolean)
      .join("\n");

    setStudioScript(nextScript);
    setLiveScriptDraft("");
    setScriptSyncing(true);
    setError(null);

    try {
      await apiClient.entities.Podcast.update(podcast.id, {
        script: nextScript,
      });
      await apiClient.requestJson("/api/auth/team-access/podcast-shared-script", {
        method: "POST",
        body: JSON.stringify({
          roomId,
          scriptText: nextScript,
          scriptPipeline: buildScriptPipeline(nextScript),
        }),
      });
      onUpdate?.();
      void publishStudioState();
    } catch (syncError) {
      console.error("Failed to sync live script updates.", syncError);
      setError(
        "Live script changes were applied locally, but could not be shared with the studio."
      );
    } finally {
      setScriptSyncing(false);
    }
  };

  const sendDirectorNote = async () => {
    if (!directorNote.trim()) return;

    const targetLabel =
      directorTarget === "all"
        ? "All feeds"
        : CAM_SLOTS[Number(directorTarget)]?.label || "Main feed";
    const nextEntry = {
      id: `dir-${Date.now()}`,
      target: targetLabel,
      text: directorNote.trim(),
      author: resolveRoleLabel(userRole || "director"),
      createdAt: new Date().toISOString(),
    };
    const nextNotes = [nextEntry, ...directorNotes].slice(0, 8);

    setDirectorNotes(nextNotes);
    setBroadcastCue(`${targetLabel}: ${nextEntry.text}`);
    setDirectorNote("");
    setShowPanel("cues");
    await sendSessionEvent("director-note", {
      ...nextEntry,
      roomId,
    });
    await saveStudioSnapshot(
      buildStudioSnapshot({
        directorNotes: nextNotes,
      })
    );
  };

  const handleSelectMainCam = (idx) => {
    setMainCam(idx);
    void saveStudioSnapshot(buildStudioSnapshot({ mainCam: idx }));
    void publishStudioState({ mainCam: idx });
  };

  const handleAdvanceSegment = () => {
    const nextSegment = Math.min(activeSegment + 1, segments.length - 1);
    const nextCueIndex =
      scriptCues.length > 0
        ? Math.min(scriptCueIndex + 1, Math.max(scriptCues.length - 1, 0))
        : scriptCueIndex;

    setActiveSegment(nextSegment);
    if (scriptCues.length > 0) {
      setScriptCueIndex(nextCueIndex);
    }

    void saveStudioSnapshot(
      buildStudioSnapshot({
        activeSegment: nextSegment,
        scriptCueIndex: nextCueIndex,
      })
    );
    setBroadcastCue(
      nextCueIndex >= 0 && nextCueIndex < scriptCues.length
        ? scriptCues[nextCueIndex]
        : null
    );
    void publishStudioState({
      activeSegment: nextSegment,
      scriptCueIndex: nextCueIndex,
    });
  };

  const handleAdvanceScriptCue = () => {
    const nextCueIndex = Math.min(
      scriptCueIndex + 1,
      Math.max(scriptCues.length - 1, 0)
    );

    setScriptCueIndex(nextCueIndex);
    setBroadcastCue(
      nextCueIndex >= 0 && nextCueIndex < scriptCues.length
        ? scriptCues[nextCueIndex]
        : null
    );
    void saveStudioSnapshot(buildStudioSnapshot({ scriptCueIndex: nextCueIndex }));
    void publishStudioState({ scriptCueIndex: nextCueIndex });
  };

  const buildJoinLink = useCallback(
    (member) => {
      if (!liveSessionCode || typeof window === "undefined") return "";

      const params = new URLSearchParams({
        code: liveSessionCode,
        name: member.displayName || member.identifier || "Team Member",
        role: member.role || "camera",
        device: member.device || "Tablet / iPad",
      });

      return `${window.location.origin}/join-feed?${params.toString()}`;
    },
    [liveSessionCode]
  );

  const rosterConnectionMap = useMemo(() => {
    const matches = new Map();

    sortedRoster.forEach((member, index) => {
      const slotFeed = monitorFeeds.find((feed) => feed.member === member) || monitorFeeds[index];
      if (slotFeed?.peer) {
        matches.set(member.identifier || member.displayName, slotFeed.peer);
      }
    });

    return matches;
  }, [monitorFeeds, sortedRoster]);

  useEffect(() => {
    if (!liveConnected || !liveSessionCode) return;
    void publishStudioState();
  }, [liveConnected, liveSessionCode, publishStudioState, scriptCues.length]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      streamRefs.current.forEach((s) => s?.getTracks().forEach((t) => t.stop()));
    };
  }, []);

  const PANELS = [
    { id: "prompter", label: "Teleprompter", icon: Type },
    { id: "cues", label: "Cue Cards", icon: Megaphone },
    { id: "intro", label: "Intro / Outro", icon: Music },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            01 · Script flow
          </p>
          <p className="text-sm text-foreground font-medium">
            Script writers drive cue cards and the teleprompter.
          </p>
          <p className="text-xs text-muted-foreground">
            Each non-empty line becomes a cue card, and new lines can be added live while the episode is rolling.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            02 · Crew wall
          </p>
          <p className="text-sm text-foreground font-medium">
            Keep every camera, laptop, tablet, and Mac view on one screen.
          </p>
          <p className="text-xs text-muted-foreground">
            The monitor wall below highlights assigned devices so the creator can see the whole show at once.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 space-y-1.5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            03 · Start episode
          </p>
          <p className="text-sm text-foreground font-medium">
            Press Start Episode to take the selected camera feed live.
          </p>
          <p className="text-xs text-muted-foreground">
            Director notes, cue cards, and the active segment remain visible without leaving the studio screen.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            Selected team members
          </span>
          <span className="text-xs text-muted-foreground">
            chosen by the episode setup owner
          </span>
        </div>
        {sortedRoster.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {sortedRoster.map((member) => (
              <div
                key={`${member.identifier}-${member.device}`}
                className="rounded-lg border border-border/70 bg-secondary/20 p-3 space-y-2"
              >
                {(() => {
                  const matchedPeer =
                    rosterConnectionMap.get(member.identifier || member.displayName) || null;
                  const joinLink = buildJoinLink(member);
                  return (
                    <>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {member.displayName}
                  </p>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            matchedPeer
                              ? "bg-green-500/15 text-green-500"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {matchedPeer ? "Feed live" : resolveRoleLabel(member.role)}
                        </span>
                      </div>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {member.identifier || "Pending identifier"}
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {member.device}
                  </span>
                  {member.responsibility && <span>{member.responsibility}</span>}
                </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-muted-foreground">
                          {matchedPeer
                            ? `${matchedPeer.name} connected`
                            : liveSessionCode
                            ? "Ready for join link"
                            : "Live feed room starts when you enable crew feeds"}
                        </span>
                        {liveSessionCode && joinLink && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              copyText(joinLink, `join:${member.identifier || member.displayName}`)
                            }
                          >
                            <Copy className="w-3.5 h-3.5" />
                            {copiedValue === `join:${member.identifier || member.displayName}`
                              ? "Copied"
                              : "Copy join link"}
                          </Button>
                        )}
                      </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add collaborators from the Team tab to assign devices, roles, and responsibilities for the monitor wall.
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium text-foreground">Live crew feed room</p>
            <p className="text-xs text-muted-foreground">
              Use one join room for tablets, Macs, and PCs. Starting the episode will automatically keep this room active.
            </p>
          </div>
          {!liveSessionCode ? (
            <Button variant="outline" onClick={ensureLiveSessionCode}>
              <Wifi className="w-4 h-4" /> Prepare live crew feeds
            </Button>
          ) : (
            <span
              className={`text-xs px-3 py-1 rounded-full ${
                liveConnected
                  ? "bg-green-500/15 text-green-500"
                  : "bg-secondary/40 text-muted-foreground"
              }`}
            >
              {liveConnected ? "Host room connected" : "Connecting host room"}
            </span>
          )}
        </div>

        {liveFeedError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {liveFeedError}
          </div>
        )}

        {liveSessionCode ? (
          <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] gap-3">
            <div className="rounded-lg border border-border/70 bg-secondary/20 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">Session code</p>
              <p className="font-mono text-2xl tracking-[0.35em] text-foreground">
                {liveSessionCode}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyText(liveSessionCode, "session-code")}
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedValue === "session-code" ? "Copied" : "Copy code"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    typeof window !== "undefined" &&
                    window.open(`${window.location.origin}/join-feed?code=${encodeURIComponent(liveSessionCode)}`, "_blank", "noopener,noreferrer")
                  }
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open join page
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-secondary/10 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">
                  {remotePeers.length} live device feed{remotePeers.length === 1 ? "" : "s"} connected
                </p>
                <span className="text-xs text-muted-foreground">
                  Match a join link to each camera person’s tablet, Mac, or PC.
                </span>
              </div>
              {remotePeers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {remotePeers.map((peer) => (
                    <div
                      key={peer.id}
                      className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {peer.name || "Crew feed"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {resolveRoleLabel(peer.role)}{peer.device ? ` · ${peer.device}` : ""}
                        </p>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-green-500/15 text-green-500">
                        Live
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No remote crew feeds are connected yet. Share a join link or the session code with your camera operators.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Prepare the live room to generate personalized join links for the selected crew.
          </div>
        )}
      </div>

      {/* Multi-camera grid */}
      <div>
        <div className="mb-3 p-3 rounded-lg border border-border bg-card space-y-2">
          <p className="text-sm font-medium text-foreground">
            Episode Mode (required before Start Episode)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <button
              onClick={() => saveDeliveryMode("live")}
              className={`text-left p-3 rounded-md border transition-colors ${
                deliveryMode === "live"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/20 hover:border-primary/40"
              }`}
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <RadioTower className="w-4 h-4 text-primary" />
                Live Screening (real-time)
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Uses assigned camera feed and starts recording when Start Episode is pressed.
              </p>
            </button>
            <button
              onClick={() => saveDeliveryMode("upload")}
              className={`text-left p-3 rounded-md border transition-colors ${
                deliveryMode === "upload"
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/20 hover:border-primary/40"
              }`}
            >
              <span className="flex items-center gap-2 text-sm text-foreground">
                <CloudUpload className="w-4 h-4 text-primary" />
                Upload Final Video
              </span>
              <p className="text-xs text-muted-foreground mt-1">
                Skip live capture and upload your edited episode directly.
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Multi-Camera Sources</span>
            <span className="text-[11px] text-muted-foreground">({devices.length} detected)</span>
          </div>
          <div className="flex items-center gap-2">
            {!recording && (
              <button
                onClick={async () => {
                  try {
                    const all = await navigator.mediaDevices.enumerateDevices();
                    setDevices(all.filter((d) => d.kind === "videoinput"));
                  } catch (_) {}
                }}
                className="text-[11px] text-primary hover:text-primary/80 underline"
                title="Re-scan for BT or newly connected cameras"
              >
                Refresh cameras
              </button>
            )}
            {recording && (
              <span className="flex items-center gap-1.5 text-xs text-destructive">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                REC · {fmtTime(elapsed)}
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CAM_SLOTS.map((slot, idx) => (
            <div
              key={idx}
              className={`rounded-lg border bg-black overflow-hidden relative ${
                mainCam === idx ? "border-primary ring-1 ring-primary/40" : "border-border"
              }`}
            >
              {!assignments[idx] && !monitorFeeds[idx]?.stream && (
                <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-black/65 text-center px-4">
                  <Monitor className="w-6 h-6 text-primary/80" />
                  <div className="space-y-0.5">
                    <p className="text-xs text-foreground">
                      {monitorRoster[idx]?.displayName || slot.label} standby
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Waiting for {monitorRoster[idx]?.device || "tablet, Mac, or PC feed"}
                    </p>
                  </div>
                </div>
              )}
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                <span className="text-[10px] tracking-wider text-foreground/80 bg-background/60 px-1.5 py-0.5 rounded">
                  {slot.label}
                </span>
                <span className="text-[10px] text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded">
                  {monitorRoster[idx]?.role
                    ? resolveRoleLabel(monitorRoster[idx].role)
                    : slot.role}
                </span>
              </div>
              {mainCam === idx && (
                <span className="absolute top-2 right-2 z-10 text-[9px] tracking-wider text-primary bg-background/60 px-1.5 py-0.5 rounded uppercase">
                  Main
                </span>
              )}
              <video
                ref={(el) => (videoRefs.current[idx] = el)}
                autoPlay
                muted
                playsInline
                className="w-full aspect-video object-cover"
              />
              <div className="p-2 bg-card border-t border-border">
                <select
                  value={assignments[idx] || ""}
                  onChange={(e) => assignDevice(idx, e.target.value)}
                  disabled={recording}
                  className="w-full text-xs bg-transparent border border-border rounded px-2 py-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">— No camera —</option>
                  {devices.map((d, di) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Camera ${di + 1}`}
                    </option>
                  ))}
                </select>
                {!recording && assignments[idx] && (
                  <button
                    onClick={() => handleSelectMainCam(idx)}
                    className={`mt-1.5 w-full text-[10px] py-1 rounded transition-colors ${
                      mainCam === idx
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mainCam === idx ? "★ Recording source" : "Set as main"}
                  </button>
                )}
                <div className="mt-2 rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5 text-[11px] text-muted-foreground space-y-0.5">
                  <p className="text-foreground truncate">
                    {monitorRoster[idx]?.displayName || "Assign a crew member"}
                  </p>
                  <p className="truncate">
                    {monitorFeeds[idx]?.peer
                      ? `${monitorFeeds[idx].peer.name || "Live feed"} · ${monitorFeeds[idx].peer.device || "Remote device"}`
                      : monitorRoster[idx]?.device || "No linked tablet / Mac / PC yet"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Record controls */}
      {deliveryMode === "live" ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
          {!recording ? (
            <Button
              onClick={startRecording}
              disabled={!assignments[mainCam] && !monitorFeeds[mainCam]?.stream}
              className="flex-1"
            >
              <Radio className="w-4 h-4" /> Start Episode Recording
            </Button>
          ) : (
            <Button variant="destructive" onClick={stopRecording} className="flex-1">
              <StopCircle className="w-4 h-4" /> Stop &amp; Save Raw Take
            </Button>
          )}
          {uploading && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
            </span>
          )}
        </div>
      ) : deliveryMode === "upload" ? (
        <div className="p-4 rounded-lg border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Record or Upload Episode</p>
            <span className="text-xs text-muted-foreground">
              {devices.length > 0
                ? `${devices.length} camera${devices.length !== 1 ? "s" : ""} available`
                : "No cameras found"}
            </span>
          </div>
          {(assignments[mainCam] || monitorFeeds[mainCam]?.stream) && (
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
              <video
                ref={(el) => (videoRefs.current[mainCam] = el)}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              {recording && (
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 rounded px-2 py-1">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs text-white font-mono">REC · {fmtTime(elapsed)}</span>
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {!recording ? (
              <Button
                onClick={startRecording}
                disabled={!assignments[mainCam] && !monitorFeeds[mainCam]?.stream}
              >
                <Radio className="w-4 h-4" /> Record Episode
              </Button>
            ) : (
              <Button variant="destructive" onClick={stopRecording}>
                <StopCircle className="w-4 h-4" /> Stop &amp; Save
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = "video/*";
                input.onchange = (e) => uploadEdited(e.target.files?.[0]);
                input.click();
              }}
            >
              <Upload className="w-4 h-4" /> Upload a File Instead
            </Button>
          </div>
          {!assignments[mainCam] && devices.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No camera detected. Allow camera access or use file upload.
            </p>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-lg border border-border bg-card text-sm text-muted-foreground">
          Choose an Episode Mode to continue.
        </div>
      )}

      {introPrompt && (
        <div className="p-3 rounded-lg border border-primary/30 bg-primary/10 flex items-center justify-between gap-3">
          <p className="text-sm text-foreground">
            {introPrompt === "live"
              ? "Live stage is active. Prompt intro music now."
              : "Recording ended. Add intro music before publishing if needed."}
          </p>
          <Button
            size="sm"
            onClick={() => {
              setShowPanel("intro");
              setIntroPrompt(null);
            }}
          >
            <Music className="w-4 h-4" /> Open Intro Panel
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {newDeviceAlert && (
        <div className="flex items-center justify-between gap-2 p-3 rounded-lg border border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-primary shrink-0" />
            <p className="text-sm text-foreground">
              Camera connected: <span className="font-medium">{newDeviceAlert}</span>
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                setNewDeviceAlert(null);
                if (devices.length > 0) assignDevice(0, devices[devices.length - 1].deviceId);
              }}
            >
              Use it
            </Button>
            <button
              onClick={() => setNewDeviceAlert(null)}
              className="text-muted-foreground hover:text-foreground text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Director console</p>
              <p className="text-xs text-muted-foreground">
                Key in live directional notes for the crew without leaving the studio view.
              </p>
            </div>
            <Megaphone className="w-4 h-4 text-primary" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[160px,1fr] gap-3">
            <select
              value={directorTarget}
              onChange={(e) => setDirectorTarget(e.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
              disabled={!canDirect}
            >
              <option value="all">All feeds</option>
              {CAM_SLOTS.map((slot, idx) => (
                <option key={slot.label} value={String(idx)}>
                  {slot.label}
                </option>
              ))}
            </select>
            <Textarea
              value={directorNote}
              onChange={(e) => setDirectorNote(e.target.value)}
              placeholder="Call out framing changes, pacing notes, or who should take the next question."
              className="min-h-[92px]"
              disabled={!canDirect}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={sendDirectorNote}
              disabled={!canDirect || !directorNote.trim()}
            >
              <Megaphone className="w-4 h-4" /> Send Direction
            </Button>
            {!canDirect && (
              <span className="text-xs text-muted-foreground">
                Only directors, producers, or the creator can broadcast studio directions.
              </span>
            )}
          </div>
          {directorNotes.length > 0 && (
            <div className="space-y-2">
              {directorNotes.map((note) => (
                <div
                  key={note.id}
                  className="rounded-md border border-border/60 bg-secondary/20 p-3"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{note.target}</span>
                    <span>{new Date(note.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm text-foreground mt-1">{note.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {note.author}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-foreground">Live script updates</p>
              <p className="text-xs text-muted-foreground">
                Add fresh lines in real time so the teleprompter and cue cards stay in sync.
              </p>
            </div>
            <Type className="w-4 h-4 text-primary" />
          </div>
          <Textarea
            value={liveScriptDraft}
            onChange={(e) => setLiveScriptDraft(e.target.value)}
            placeholder="Paste new lines from the script writer here..."
            className="min-h-[132px]"
            disabled={!canEditStudioScript}
          />
          <div className="flex items-center gap-2">
            <Button
              onClick={appendLiveScript}
              disabled={!canEditStudioScript || !liveScriptDraft.trim() || scriptSyncing}
            >
              {scriptSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              Add to Studio Script
            </Button>
            <span className="text-xs text-muted-foreground">
              {scriptCues.length} live cue card{scriptCues.length === 1 ? "" : "s"} ready
            </span>
          </div>
          {!canEditStudioScript && (
            <p className="text-xs text-muted-foreground">
              Ask a script writer, director, producer, host, or creator to push live script changes.
            </p>
          )}
        </div>
      </div>

      {/* Studio tools: teleprompter + cues + intro/outro */}
      <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
        <div className="flex border-b border-border">
          {PANELS.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => setShowPanel(p.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                  showPanel === p.id
                    ? "border-primary text-foreground bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4" /> {p.label}
              </button>
            );
          })}
        </div>
        <div className="p-4">
          {showPanel === "prompter" && (
            <Teleprompter script={studioScript} autoScrollOnRecord={recording} />
          )}
          {showPanel === "cues" && (
            <CueCardDisplay
              canDirect={canDirect || !userRole}
              scriptCues={scriptCues}
              activeScriptCueIndex={scriptCueIndex}
              broadcastCue={broadcastCue}
              onAdvanceScriptCue={handleAdvanceScriptCue}
            />
          )}
          {showPanel === "intro" && (
            <IntroOutroControls podcast={podcast} onUpdate={onUpdate} />
          )}
        </div>
      </div>

      {/* Production timeline */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Production Timeline</span>
          {segments.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {segments.reduce((s, seg) => s + (seg.duration_minutes || 0), 0)}m total
            </span>
          )}
        </div>
        {segments.length === 0 ? (
          <div className="p-6 rounded-lg border border-dashed border-border text-center">
            <Film className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No segments yet. Add them in the Line-up tab to build your production timeline.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {segments.map((seg, idx) => {
              const isActive = activeSegment === idx;
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card"
                  }`}
                >
                  <button
                    onClick={() => recording && setActiveSegment(idx)}
                    disabled={!recording}
                    className="shrink-0"
                  >
                    {isActive ? (
                      <CheckCircle className="w-5 h-5 text-primary" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${isActive ? "text-primary" : "text-foreground"}`}>
                      {seg.segment_title}
                    </p>
                    {seg.notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">{seg.notes}</p>
                    )}
                  </div>
                  {seg.duration_minutes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                      <Clock className="w-3 h-3" /> {seg.duration_minutes}m
                    </span>
                  )}
                  {isActive && recording && (
                    <span className="text-xs text-primary font-mono">{fmtTime(elapsed)}</span>
                  )}
                </div>
              );
            })}
            {recording && activeSegment < segments.length - 1 && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleAdvanceSegment}
              >
                Advance to Next Segment →
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Raw vs Edited product */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Scissors className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Takes &amp; Edited Product</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Raw take */}
          <div className="p-3 rounded-lg border border-border bg-card space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Film className="w-4 h-4 text-orange-400" />
              <span className="font-medium text-foreground">Raw Take</span>
              <span className="text-xs text-muted-foreground">(before editing)</span>
            </div>
            {podcast.raw_media_uri ? (
              <video src={podcast.raw_media_uri} controls className="w-full rounded-md border border-border max-h-[200px]" />
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground rounded-md border border-dashed border-border">
                No raw take yet. Record to capture one.
              </div>
            )}
          </div>

          {/* Edited product */}
          <div className="p-3 rounded-lg border border-border bg-card space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="font-medium text-foreground">Edited Product</span>
              <span className="text-xs text-muted-foreground">(after editing)</span>
            </div>
            {podcast.episode_media_uri ? (
              <>
                <video src={podcast.episode_media_uri} controls className="w-full rounded-md border border-border max-h-[200px]" />
                {podcast.raw_media_uri && podcast.raw_media_uri !== podcast.episode_media_uri && (
                  <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Edited version uploaded
                  </p>
                )}
              </>
            ) : podcast.raw_media_uri ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Raw take saved. Upload your edited cut or promote the raw take.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={promoteRawToEdited} className="flex-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Use Raw as Final
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = "video/*";
                      input.onchange = (e) => uploadEdited(e.target.files?.[0]);
                      input.click();
                    }}
                  >
                    <Upload className="w-3.5 h-3.5" /> Upload Edited
                  </Button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground rounded-md border border-dashed border-border">
                No edited product yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}