import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import Teleprompter from "@/components/podcasts/Teleprompter";
import CueCardDisplay from "@/components/podcasts/CueCardDisplay";
import IntroOutroControls from "@/components/podcasts/IntroOutroControls";
import {
  Video,
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
  Eye,
  Upload,
  RadioTower,
  CloudUpload,
} from "lucide-react";

const CAM_SLOTS = [
  { label: "Cam 01", role: "Host" },
  { label: "Cam 02", role: "Guest A" },
  { label: "Cam 03", role: "Guest B" },
  { label: "Cam 04", role: "B-Roll" },
];

const DIRECTOR_ROLES = ["director", "producer", "creator"];

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
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

  const streamRefs = useRef([null, null, null, null]);
  const videoRefs = useRef([null, null, null, null]);
  const recorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const segments = podcast.itinerary || [];
  const scriptCues = (podcast.script || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const canDirect = DIRECTOR_ROLES.includes(userRole) || podcast.created_by_id === undefined;

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
      } catch {
        // not logged in
      }
    };
    loadRole();
  }, [podcast.id]);

  // Enumerate video devices (request permission first)
  useEffect(() => {
    const init = async () => {
      try {
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        temp.getTracks().forEach((t) => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === "videoinput"));
      } catch (err) {
        setError("Camera access denied. Allow camera and microphone permissions, then reload.");
      }
    };
    init();
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
      if (videoRefs.current[slotIdx]) {
        videoRefs.current[slotIdx].srcObject = stream;
      }
    } catch (err) {
      setError(`Failed to access camera for ${CAM_SLOTS[slotIdx].label}.`);
    }
  }, []);

  const startRecording = async () => {
    setError(null);
    if (deliveryMode !== "live") {
      setError("Choose Live Screening mode before starting episode capture.");
      return;
    }
    const mainStream = streamRefs.current[mainCam];
    if (!mainStream) {
      setError("Assign a camera to the main slot first.");
      return;
    }
    try {
      audioStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const combined = new MediaStream();
      mainStream.getVideoTracks().forEach((t) => combined.addTrack(t));
      audioStreamRef.current.getAudioTracks().forEach((t) => combined.addTrack(t));

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
      setRecording(true);
      setElapsed(0);
      setActiveSegment(segments.length > 0 ? 0 : -1);
      setScriptCueIndex(scriptCues.length > 0 ? 0 : -1);
      setShowPanel(scriptCues.length > 0 ? "cues" : "prompter");
      if (podcast.intro_uri) {
        setIntroPrompt("live");
      }
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
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
    } catch {
      // keep local mode even if persistence fails
    }
  };

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
          </div>
          {recording && (
            <span className="flex items-center gap-1.5 text-xs text-destructive">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              REC · {fmtTime(elapsed)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {CAM_SLOTS.map((slot, idx) => (
            <div
              key={idx}
              className={`rounded-lg border bg-black overflow-hidden relative ${
                mainCam === idx ? "border-primary ring-1 ring-primary/40" : "border-border"
              }`}
            >
              <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
                <span className="text-[10px] tracking-wider text-foreground/80 bg-background/60 px-1.5 py-0.5 rounded">
                  {slot.label}
                </span>
                <span className="text-[10px] text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded">
                  {slot.role}
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
                    onClick={() => setMainCam(idx)}
                    className={`mt-1.5 w-full text-[10px] py-1 rounded transition-colors ${
                      mainCam === idx
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mainCam === idx ? "★ Recording source" : "Set as main"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Record controls */}
      {deliveryMode === "live" ? (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card">
          {!recording ? (
            <Button onClick={startRecording} disabled={!assignments[mainCam]} className="flex-1">
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
        <div className="p-4 rounded-lg border border-border bg-card space-y-2">
          <p className="text-sm text-muted-foreground">
            Upload mode selected. Use the uploader below to submit the episode media.
          </p>
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
            <Upload className="w-4 h-4" /> Upload Episode Video
          </Button>
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
            <Teleprompter script={podcast.script} autoScrollOnRecord={recording} />
          )}
          {showPanel === "cues" && (
            <CueCardDisplay
              canDirect={canDirect || !userRole}
              scriptCues={scriptCues}
              activeScriptCueIndex={scriptCueIndex}
              onAdvanceScriptCue={() =>
                setScriptCueIndex((idx) =>
                  Math.min(idx + 1, Math.max(scriptCues.length - 1, 0))
                )
              }
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
                onClick={() => {
                  setActiveSegment((s) => s + 1);
                  if (scriptCues.length > 0) {
                    setScriptCueIndex((idx) =>
                      Math.min(idx + 1, Math.max(scriptCues.length - 1, 0))
                    );
                  }
                }}
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