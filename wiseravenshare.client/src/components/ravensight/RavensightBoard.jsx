import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { apiClient, resolveApiUrl } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Loader2,
  Clapperboard,
  Camera,
  Play,
  Square,
  CheckCircle2,
  MessageSquare,
  Upload,
  Film,
  RadioTower,
  Clock3,
  Sparkles,
  WifiOff,
  ArrowRight,
  Send,
} from "lucide-react";

const ROOM_KEY = "main";

const WORKFLOW_STEPS = [
  {
    id: "planning",
    label: "Planning",
    command: "plan",
    icon: Sparkles,
    description: "Lock the shot list, notes, and creative direction.",
  },
  {
    id: "selected",
    label: "Footage Selected",
    command: "select",
    icon: Film,
    description: "Choose the clip or upload that will drive the take.",
  },
  {
    id: "camera_setup",
    label: "Camera Setup",
    command: "setup",
    icon: Camera,
    description: "Match cameras, angles, and live device inputs.",
  },
  {
    id: "recording",
    label: "Recording",
    command: "record",
    icon: RadioTower,
    description: "Run the take and keep the live feed active.",
  },
  {
    id: "review",
    label: "Review",
    command: "review",
    icon: Clock3,
    description: "Check the footage, notes, and quality before publish.",
  },
  {
    id: "published",
    label: "Published",
    command: "publish",
    icon: CheckCircle2,
    description: "Final footage is ready for release and distribution.",
  },
];

const STAGE_TITLES = Object.fromEntries(WORKFLOW_STEPS.map((step) => [step.id, step.label]));

const getAccessToken = () => {
  if (typeof window === "undefined" || !window.localStorage) return "";
  return window.localStorage.getItem("wiseravenshare_access_token") || window.localStorage.getItem("token") || "";
};

const normalizeStage = (command) => {
  const value = (command || "").trim().toLowerCase();
  switch (value) {
    case "plan":
    case "planning":
      return "planning";
    case "select":
    case "selected":
      return "selected";
    case "setup":
    case "camera_setup":
    case "camera-setup":
      return "camera_setup";
    case "record":
    case "start":
    case "live":
      return "recording";
    case "review":
    case "edit":
    case "cut":
      return "review";
    case "publish":
    case "export":
    case "wrap":
      return "published";
    default:
      return null;
  }
};

export default function RavensightBoard() {
  const connectionRef = useRef(null);
  const workflowRequestRef = useRef(false);
  const footageCardRef = useRef(null);
  const uploadInputRef = useRef(null);
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const [hubOffline, setHubOffline] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [commandNote, setCommandNote] = useState("");
  const [responseDrafts, setResponseDrafts] = useState({});
  const [busyCommand, setBusyCommand] = useState("");
  const [planningNotes, setPlanningNotes] = useState("");
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const { toast } = useToast();

  const currentStage = snapshot?.currentStage || "planning";
  const activeFootage = snapshot?.activeFootage || null;
  const commandLog = snapshot?.commandLog || [];

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(WORKFLOW_STEPS.map((step) => [step.id, 0]));
    for (const command of snapshot?.commandLog || []) {
      const stage = normalizeStage(command.command);
      if (stage && counts[stage] !== undefined) counts[stage] += 1;
    }
    return counts;
  }, [snapshot?.commandLog]);

  const loadVideos = useCallback(async () => {
    const response = await apiClient.ravensightMedia.listVideos();
    const items = Array.isArray(response)
      ? response
      : Array.isArray(response?.items)
        ? response.items
        : Array.isArray(response?.data)
          ? response.data
          : [];
    const mapped = items.map((video) => ({
      id: video.id || video.videoId || video.mediaAssetId || video.fileName,
      title: video.title || video.caption || video.fileName || "Untitled clip",
      url: video.mediaUrl || video.videoUrl || video.file_uri || video.filePath || "",
      thumbnailUrl: video.thumbnailUrl || video.posterUrl || "",
      description: video.description || "",
      createdAt: video.createdAt || video.created_date || video.savedAtUtc || "",
    })).filter((video) => video.id && video.url);
    setVideos(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    let disposed = false;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(resolveApiUrl("/api/hubs/collaboration"), {
        accessTokenFactory: () => getAccessToken(),
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;

    connection.on("PodcastBridgeSnapshot", (nextSnapshot) => {
      if (disposed) return;
      setSnapshot(nextSnapshot || null);
      setLoading(false);
    });

    connection.on("PodcastBridgePresence", () => {});

    connection.on("PodcastFootageSelected", ({ footage, updatedAtUtc }) => {
      if (disposed) return;
      setSnapshot((prev) => ({
        ...(prev || {}),
        activeFootage: footage || null,
        currentStage: "selected",
        updatedAtUtc: updatedAtUtc || prev?.updatedAtUtc || new Date().toISOString(),
      }));
    });

    connection.on("PodcastCommandIssued", ({ command }) => {
      if (disposed || !command) return;
      setSnapshot((prev) => {
        if (!prev) return prev;
        const nextStage = normalizeStage(command.command) || prev.currentStage || "planning";
        const existing = prev.commandLog || [];
        const nextLog = existing.some((item) => item.commandId === command.commandId)
          ? existing.map((item) => (item.commandId === command.commandId ? command : item))
          : [...existing, command];
        nextLog.sort((a, b) => new Date(a.issuedAtUtc) - new Date(b.issuedAtUtc));
        return {
          ...prev,
          commandLog: nextLog,
          currentStage: nextStage,
        };
      });
    });

    connection.on("PodcastCommandResponse", ({ command }) => {
      if (disposed || !command) return;
      setSnapshot((prev) => {
        if (!prev) return prev;
        const nextLog = (prev.commandLog || []).some((item) => item.commandId === command.commandId)
          ? prev.commandLog.map((item) => (item.commandId === command.commandId ? command : item))
          : [...(prev.commandLog || []), command];
        nextLog.sort((a, b) => new Date(a.issuedAtUtc) - new Date(b.issuedAtUtc));
        return { ...prev, commandLog: nextLog };
      });
    });

    connection.onclose((connectionError) => {
      if (!disposed && connectionError) {
        setError(connectionError.message || "The board connection closed unexpectedly.");
      }
    });

    connection.onreconnected(async () => {
      try {
        await connection.invoke("JoinPodcastBridge", ROOM_KEY);
      } catch (reconnectError) {
        if (!disposed) {
          setError(reconnectError?.message || "Could not rejoin the Ravensight board.");
        }
      }
    });

    connection
      .start()
      .then(() => connection.invoke("JoinPodcastBridge", ROOM_KEY))
      .catch((connectionError) => {
        if (!disposed) {
          setHubOffline(true);
          setError(connectionError?.message || "Could not connect to the Ravensight board.");
          setLoading(false);
        }
      })
      .finally(() => {
        if (!disposed) setConnecting(false);
      });

    // Safety timeout: if the server never sends a snapshot, stop the spinner after 5s.
    const snapshotTimeout = setTimeout(() => {
      if (!disposed) {
        setLoading(false);
        setConnecting(false);
      }
    }, 5000);

    loadVideos().catch((loadError) => {
      if (!disposed) {
        setError(loadError?.message || "Could not load footage library.");
      }
    });

    return () => {
      disposed = true;
      clearTimeout(snapshotTimeout);
      const activeConnection = connectionRef.current;
      connectionRef.current = null;
      if (activeConnection) {
        Promise.resolve()
          .then(() => {
            if (activeConnection.state === signalR.HubConnectionState.Connected) {
              return activeConnection.invoke("LeavePodcastBridge", ROOM_KEY);
            }
            return null;
          })
          .catch(() => undefined)
          .finally(() => activeConnection.stop());
      }
    };
  }, [loadVideos]);

  const invokeHub = useCallback(async (method, ...args) => {
    const connection = connectionRef.current;
    if (!connection) throw new Error("The board connection is not ready.");
    if (connection.state !== signalR.HubConnectionState.Connected) {
      await connection.start();
      await connection.invoke("JoinPodcastBridge", ROOM_KEY);
    }
    return connection.invoke(method, ...args);
  }, []);

  const issueWorkflowStep = async (step) => {
    if (workflowRequestRef.current) return;
    workflowRequestRef.current = true;
    setBusyCommand(step.command);
    setError("");
    // Optimistic update
    const nextStage = normalizeStage(step.command) || currentStage;
    setSnapshot((prev) => ({
      ...(prev || { commandLog: [] }),
      currentStage: nextStage,
    }));
    try {
      await invokeHub("IssuePodcastCommand", ROOM_KEY, step.command, commandNote.trim() || step.description, null);
      setCommandNote("");
      toast({ title: `Stage: ${step.label}`, description: step.description });
      // Stage-specific side effects
      if (step.id === "selected") {
        setTimeout(() => footageCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      }
      if (step.id === "published") {
        setShowPublishConfirm(true);
      }
    } catch (issueError) {
      // Revert optimistic update on failure
      setSnapshot((prev) => ({ ...(prev || {}), currentStage: currentStage }));
      setError(issueError?.message || "Could not issue the workflow command.");
    } finally {
      workflowRequestRef.current = false;
      setBusyCommand("");
    }
  };

  const acknowledgeCommand = async (commandId) => {
    const response = (responseDrafts[commandId] || "").trim();
    if (!response) return;
    setBusyCommand(commandId);
    setError("");
    try {
      await invokeHub("AcknowledgePodcastCommand", ROOM_KEY, commandId, response);
      setResponseDrafts((prev) => ({ ...prev, [commandId]: "" }));
    } catch (ackError) {
      setError(ackError?.message || "Could not acknowledge the command.");
    } finally {
      setBusyCommand("");
    }
  };

  const selectFootage = async (video) => {
    const mediaUrl = await getPlayableUrl(video.url);
    if (!mediaUrl) return;
    setBusyCommand(video.id);
    setError("");
    try {
      await invokeHub("PublishPodcastFootageSelection", ROOM_KEY, {
        footageId: video.id,
        videoId: video.id,
        title: video.title,
        mediaUrl,
        thumbnailUrl: video.thumbnailUrl || "",
        sourceUserId: "",
        sourceUserName: "Ravensight Studio",
      });
      setSelectedVideoId(video.id);
    } catch (selectError) {
      setError(selectError?.message || "Could not publish the selected footage.");
    } finally {
      setBusyCommand("");
    }
  };

  const uploadClip = async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const videoExts = ["mp4", "mov", "webm", "m4v", "avi", "mkv", "mpg", "mpeg", "3gp", "ts"];
    const isVideo = file.type.startsWith("video/") || videoExts.includes(ext);
    if (!isVideo) {
      setError("Choose a video clip to add it to the footage library.");
      return;
    }

    setUploading(true);
    setError("");
    try {
      const title = file.name.replace(/\.[^/.]+$/, "");
      const upload = await apiClient.ravensightMedia.uploadMedia(file, {
        title,
        destinationFolder: "ravensight-board",
      });
      const uploadedUrl = upload?.mediaUrl
        || upload?.file?.mediaUrl
        || upload?.video?.videoUrl
        || upload?.filePath
        || upload?.url
        || "";
      if (!uploadedUrl) {
        throw new Error("The upload finished without returning a playable clip URL.");
      }

      const refreshedVideos = await loadVideos();
      const normalizeUrl = (value) => String(value || "").trim().replace(/\/$/, "");
      const uploadedVideo = refreshedVideos.find((video) => normalizeUrl(video.url) === normalizeUrl(uploadedUrl)) || {
        id: upload?.video?.id || upload?.mediaAssetId || `upload-${Date.now()}`,
        title,
        url: uploadedUrl,
        thumbnailUrl: upload?.thumbnailUrl || upload?.video?.thumbnailUrl || "",
        description: upload?.video?.description || "",
        createdAt: new Date().toISOString(),
      };
      setVideos((previous) => [uploadedVideo, ...previous.filter((video) => video.id !== uploadedVideo.id && normalizeUrl(video.url) !== normalizeUrl(uploadedUrl))]);
      await selectFootage(uploadedVideo);
      toast({ title: "Clip uploaded", description: `${title} is on the board.` });
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  if (loading || connecting) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Stage-specific action prompt shown below the stage grid when a stage is active.
  const stageActions = {
    planning: (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">Lock the shot list</p>
        <p className="text-xs text-muted-foreground">Write your notes, angles, and creative direction. Then click <strong>Footage Selected</strong> when you have a clip chosen.</p>
        <Textarea
          value={planningNotes}
          onChange={(e) => setPlanningNotes(e.target.value)}
          placeholder="Shot list, host positions, B-roll notes..."
          rows={3}
        />
        <Button
          size="sm"
          onClick={() => issueWorkflowStep(WORKFLOW_STEPS[1])}
          disabled={Boolean(busyCommand)}
        >
          <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
          Proceed to Footage Selection
        </Button>
      </div>
    ),
    selected: (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Select your footage clip</p>
        <p className="text-xs text-muted-foreground">Upload a clip below or pick one from your library. Once selected, proceed to Camera Setup.</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload clip
          </Button>
          {activeFootage && (
            <Button size="sm" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[2])} disabled={Boolean(busyCommand)}>
              <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
              Camera Setup
            </Button>
          )}
        </div>
      </div>
    ),
    camera_setup: (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Set up cameras and angles</p>
        <p className="text-xs text-muted-foreground">Connect cameras via the Podcasts tab or any connected device. When cameras are ready, start the recording.</p>
        <Button size="sm" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[3])} disabled={Boolean(busyCommand)}>
          <RadioTower className="w-3.5 h-3.5 mr-1.5" />
          Start Recording
        </Button>
      </div>
    ),
    recording: (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground flex items-center gap-2">
          <RadioTower className="w-4 h-4 text-red-500 animate-pulse" />
          Take is live
        </p>
        <p className="text-xs text-muted-foreground">Recording in progress. When finished, proceed to review before publishing.</p>
        <Button size="sm" variant="outline" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[4])} disabled={Boolean(busyCommand)}>
          <Square className="w-3.5 h-3.5 mr-1.5" />
          Stop & Review
        </Button>
      </div>
    ),
    review: (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Review before publishing</p>
        <p className="text-xs text-muted-foreground">Check the footage quality and notes. Publish when ready.</p>
        <Button size="sm" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[5])} disabled={Boolean(busyCommand)}>
          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
          Mark as Published
        </Button>
      </div>
    ),
    published: (
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-2">
        <p className="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          Footage published
        </p>
        <p className="text-xs text-muted-foreground">This take is complete and ready for distribution. Start a new session from Planning if you need another take.</p>
        <Button size="sm" variant="outline" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[0])} disabled={Boolean(busyCommand)}>
          <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
          New Take
        </Button>
      </div>
    ),
  };

  return (
    <div className="space-y-6">
      {hubOffline && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-2 text-sm text-yellow-600 dark:text-yellow-400">
          <WifiOff className="w-4 h-4 shrink-0" />
          Live sync unavailable — board works in local mode only.
        </div>
      )}
      {error && !hubOffline && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr,0.7fr]">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-xl">
              <Clapperboard className="w-5 h-5 text-primary" />
              Footage recording board
            </CardTitle>
            <CardDescription>
              Move through the actual Ravensight footage steps and keep the live room synced.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {WORKFLOW_STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = currentStage === step.id;
                return (
                  <button
                    key={step.id}
                    onClick={() => issueWorkflowStep(step)}
                    disabled={Boolean(busyCommand)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/20 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium text-foreground">{step.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                      <Badge variant={isActive ? "default" : "secondary"} className="shrink-0">
                        {stageCounts[step.id] || (isActive ? 1 : 0)}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                        Command: {step.command}
                      </span>
                      {busyCommand === step.command ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      ) : isActive ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {stageActions[currentStage]}

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium text-foreground">Workflow note</p>
                  <p className="text-xs text-muted-foreground">Optional note attached to the next command.</p>
                </div>
                <Badge variant="outline">Current stage: {STAGE_TITLES[currentStage] || currentStage}</Badge>
              </div>
              <Textarea
                value={commandNote}
                onChange={(e) => setCommandNote(e.target.value)}
                placeholder="Example: lock the host angle and roll into the B-roll take."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-heading">
                <Film className="w-5 h-5 text-primary" />
                Active footage
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeFootage ? (
                <>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {activeFootage.title || "Untitled footage"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Selected by {activeFootage.sourceUserName || "Ravensight Studio"}
                    </p>
                    {activeFootage.selectedAtUtc && (
                      <p className="text-[11px] text-muted-foreground/70">
                        {new Date(activeFootage.selectedAtUtc).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[2])}>
                      <Camera className="w-3.5 h-3.5 mr-1.5" />
                      Camera setup
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => issueWorkflowStep(WORKFLOW_STEPS[3])}>
                      <RadioTower className="w-3.5 h-3.5 mr-1.5" />
                      Record
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick a clip below to put it on the board.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border" ref={footageCardRef}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-heading">
                <Upload className="w-5 h-5 text-primary" />
                Upload clip
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={uploadInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  void uploadClip(file);
                }}
                disabled={uploading}
              />
              <Button
                variant="outline"
                className="w-full"
                onClick={() => uploadInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? "Uploading…" : "Choose video file"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Upload from PC — the clip goes straight to the board and footage library.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-heading">
              <Film className="w-5 h-5 text-primary" />
              Footage library
            </CardTitle>
            <CardDescription>Choose a clip from the library and publish it to the board.</CardDescription>
          </CardHeader>
          <CardContent>
            {videos.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-sm text-muted-foreground">No video clips in the library yet.</p>
                <Button variant="outline" size="sm" onClick={() => uploadInputRef.current?.click()} disabled={uploading}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload your first clip
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {videos.map((video) => {
                  const isSelected = selectedVideoId === video.id || activeFootage?.videoId === video.id;
                  return (
                    <div
                      key={video.id}
                      className={`rounded-xl border p-3 space-y-3 ${
                        isSelected ? "border-primary bg-primary/10" : "border-border bg-secondary/20"
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground line-clamp-2">{video.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{video.description || "No description"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => selectFootage(video)}
                          disabled={busyCommand === video.id}
                        >
                          {busyCommand === video.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                          Use footage
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-heading">
              <MessageSquare className="w-5 h-5 text-primary" />
              Command log
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {commandLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workflow commands yet.</p>
            ) : (
              <div className="space-y-3 max-h-[38rem] overflow-y-auto pr-1">
                {commandLog.map((command) => (
                  <div key={command.commandId} className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">{command.command}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Issued by {command.issuedByUserName || "Studio"} · {new Date(command.issuedAtUtc).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={command.status === "acknowledged" ? "default" : "secondary"}>
                        {command.status || "issued"}
                      </Badge>
                    </div>
                    {command.note && (
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap">{command.note}</p>
                    )}
                    {(command.responses || []).length > 0 && (
                      <div className="space-y-1">
                        {(command.responses || []).map((response) => (
                          <div key={response.responseId} className="rounded-md border border-border bg-card px-2 py-1.5">
                            <p className="text-xs text-foreground">{response.message}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {response.responderUserName || "Operator"} · {new Date(response.respondedAtUtc).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Input
                        value={responseDrafts[command.commandId] || ""}
                        onChange={(e) =>
                          setResponseDrafts((prev) => ({ ...prev, [command.commandId]: e.target.value }))
                        }
                        placeholder="Response or handoff note"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => acknowledgeCommand(command.commandId)}
                        disabled={busyCommand === command.commandId || !(responseDrafts[command.commandId] || "").trim()}
                      >
                        {busyCommand === command.commandId ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Acknowledge
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
