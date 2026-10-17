import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { apiClient, resolveApiUrl } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [commandNote, setCommandNote] = useState("");
  const [responseDrafts, setResponseDrafts] = useState({});
  const [busyCommand, setBusyCommand] = useState("");

  const currentStage = snapshot?.currentStage || "planning";
  const activeFootage = snapshot?.activeFootage || null;
  const commandLog = snapshot?.commandLog || [];

  const stageCounts = useMemo(() => {
    const counts = Object.fromEntries(WORKFLOW_STEPS.map((step) => [step.id, 0]));
    if (currentStage && counts[currentStage] !== undefined) {
      counts[currentStage] += 1;
    }
    return counts;
  }, [currentStage]);

  const loadVideos = useCallback(async () => {
    const items = await apiClient.ravensightMedia.listVideos();
    setVideos((items || []).map((video) => ({
      id: video.id,
      title: video.title || video.caption || video.fileName || "Untitled clip",
      url: video.mediaUrl || video.videoUrl || video.file_uri || "",
      thumbnailUrl: video.thumbnailUrl || video.posterUrl || "",
      description: video.description || "",
      createdAt: video.createdAt || video.created_date || "",
    })));
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
          setError(connectionError?.message || "Could not connect to the Ravensight board.");
          setLoading(false);
        }
      })
      .finally(() => {
        if (!disposed) setConnecting(false);
      });

    loadVideos().catch((loadError) => {
      if (!disposed) {
        setError(loadError?.message || "Could not load footage library.");
      }
    });

    return () => {
      disposed = true;
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
    setBusyCommand(step.command);
    setError("");
    try {
      await invokeHub("IssuePodcastCommand", ROOM_KEY, step.command, commandNote.trim() || step.description, null);
      setCommandNote("");
    } catch (issueError) {
      setError(issueError?.message || "Could not issue the workflow command.");
    } finally {
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
    setUploading(true);
    setError("");
    try {
      const isVideo = file.type.startsWith("video/");
      const upload = isVideo
        ? await apiClient.ravensightMedia.uploadVideo(file, {
            title: file.name.replace(/\.[^/.]+$/, ""),
            destinationFolder: "ravensight-board",
          })
        : await apiClient.ravensightMedia.uploadMusic(file, {
            title: file.name.replace(/\.[^/.]+$/, ""),
            destinationFolder: "ravensight-board",
          });
      await loadVideos();
      const uploadedUrl = upload?.mediaUrl || upload?.file?.mediaUrl || upload?.url || "";
      if (uploadedUrl) {
        const uploadedVideo = {
          id: upload?.id || file.name,
          title: file.name.replace(/\.[^/.]+$/, ""),
          url: uploadedUrl,
          thumbnailUrl: upload?.thumbnailUrl || "",
        };
        setVideos((prev) => [uploadedVideo, ...prev.filter((item) => item.url !== uploadedUrl)]);
      }
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

  return (
    <div className="space-y-6">
      {error && (
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
                      ) : (
                        <Play className="w-3.5 h-3.5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

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
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
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
                      <Square className="w-3.5 h-3.5 mr-1.5" />
                      Start recording
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

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-heading">
                <Upload className="w-5 h-5 text-primary" />
                Upload clip
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                type="file"
                accept="video/*"
                onChange={(e) => uploadClip(e.target.files?.[0])}
                disabled={uploading}
              />
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Uploading clip...
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Upload from PC, then move the clip into the board flow immediately.
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
              <p className="text-sm text-muted-foreground">No video clips in the library yet.</p>
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
