import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/api/client";
import {
  Loader2,
  Upload,
  Film,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  UserPlus,
  Trash2,
  Monitor,
  Smartphone,
  Video,
  Mic,
  Headphones,
  Scissors,
  Clapperboard,
  Search,
  Eye,
  Radio,
  FileText,
} from "lucide-react";

export const TEAM_ROLES = [
  { id: "creator", label: "Creator", icon: Clapperboard },
  { id: "script_writer", label: "Script Writer", icon: FileText },
  { id: "host", label: "Host", icon: Mic },
  { id: "co_host", label: "Co-Host", icon: Radio },
  { id: "director", label: "Director", icon: Eye },
  { id: "producer", label: "Producer", icon: Clapperboard },
  { id: "camera", label: "Camera Operator", icon: Video },
  { id: "audio", label: "Audio Engineer", icon: Headphones },
  { id: "editor", label: "Editor", icon: Scissors },
  { id: "researcher", label: "Researcher", icon: Search },
  { id: "guest", label: "Guest", icon: Users },
];

const DEVICE_OPTIONS = ["Studio Cam A", "Studio Cam B", "Laptop Webcam", "iPhone", "Android", "USB Mic", "External Recorder"];

const STEPS = [
  { id: "team", label: "Team & Collab", icon: Users },
  { id: "basics", label: "Episode Setup", icon: Film },
  { id: "video", label: "Video Upload", icon: Upload },
];

export default function PodcastLaunchWizard({ onComplete, onCancel }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Step 1: basics
  const [title, setTitle] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [subjectMatter, setSubjectMatter] = useState("");
  const [episodeScript, setEpisodeScript] = useState("");

  // Step 2: video
  const [videoUri, setVideoUri] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Step 3: team
  const [teamName, setTeamName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [members, setMembers] = useState([]);
  const [memberInput, setMemberInput] = useState("");
  const [memberRole, setMemberRole] = useState("host");
  const [memberDevice, setMemberDevice] = useState(DEVICE_OPTIONS[0]);
  const [memberResp, setMemberResp] = useState("");
  const [inviting, setInviting] = useState(false);

  const createdRef = useRef(null);

  const createPodcastIfNeeded = async () => {
    if (createdRef.current) return createdRef.current;
    const pod = await apiClient.entities.Podcast.create({
      title,
      episode_number: Number(episodeNumber),
      subject_matter: subjectMatter,
      script: episodeScript,
      script_status: "draft",
      status: "planning",
      is_premium: true,
      price_monthly: 499,
    });
    createdRef.current = pod;
    return pod;
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const pod = await createPodcastIfNeeded();
      const upload = await apiClient.ravensightMedia.uploadVideo(file, {
        title: file.name.replace(/\.[^/.]+$/, ""),
      });
      const fileUri = upload.mediaUrl || upload.file?.mediaUrl || "";
      await apiClient.entities.Podcast.update(pod.id, { episode_media_uri: fileUri });
      setVideoUri(fileUri);
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addMemberToList = () => {
    if (!memberInput.trim()) return;
    setMembers([
      ...members,
      {
        identifier: memberInput.trim(),
        role: memberRole,
        device: memberDevice,
        responsibility: memberResp.trim(),
      },
    ]);
    setMemberInput("");
    setMemberResp("");
  };

  const removeMember = (idx) => {
    setMembers(members.filter((_, i) => i !== idx));
  };

  const handleFinish = async () => {
    setSaving(true);
    setError("");
    try {
      const pod = await createPodcastIfNeeded();

      // Create team if team name provided
      if (teamName.trim()) {
        const me = await apiClient.auth.me();
        const team = await apiClient.entities.Team.create({
          team_name: teamName.trim(),
          owner_id: me.id,
          members: [],
          member_details: [],
          focus: subjectMatter,
          purpose: purpose.trim(),
        });
        await apiClient.entities.Podcast.update(pod.id, {
          team_ids: [...(pod.team_ids || []), team.id],
        });

        // Invite each member
        for (const m of members) {
          await apiClient.functions.invoke("InviteCollaborator", {
            team_id: team.id,
            identifier: m.identifier,
            role: m.role,
            responsibility: m.responsibility,
            device: m.device,
          });
        }
      }

      onComplete(pod);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to create episode");
    } finally {
      setSaving(false);
    }
  };

  const canNextTeam = teamName.trim() && members.length > 0;
  const canNextBasics = title && episodeNumber && subjectMatter;
  const current = STEPS[step];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <React.Fragment key={s.id}>
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : done
                    ? "text-green-500"
                    : "text-muted-foreground"
                }`}
              >
                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                <span className="hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground/40" />}
            </React.Fragment>
          );
        })}
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Team & Collab */}
      {step === 0 && (
        <div className="space-y-5">
          <div>
            <h3 className="font-heading text-lg text-foreground mb-1">Build Your Collaboration Team First</h3>
            <p className="text-sm text-muted-foreground">Select team members and assign roles before episode setup.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Team Name</Label>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Production Crew" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Purpose</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Why this team exists" />
            </div>
          </div>

          {/* Add member form */}
          <div className="p-4 rounded-lg border border-border bg-card space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="w-4 h-4 text-primary" /> Add Team Member
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Username or Email</Label>
                <Input value={memberInput} onChange={(e) => setMemberInput(e.target.value)} placeholder="creator@email.com or @username" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Function / Role</Label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Device Registered</Label>
                <select
                  value={memberDevice}
                  onChange={(e) => setMemberDevice(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
                >
                  {DEVICE_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Responsibility</Label>
                <Input value={memberResp} onChange={(e) => setMemberResp(e.target.value)} placeholder="What they handle on this episode" />
              </div>
            </div>
            <Button onClick={addMemberToList} disabled={!memberInput.trim()} variant="outline" size="sm">
              <UserPlus className="w-4 h-4" /> Add to Team
            </Button>
          </div>

          {/* Member list */}
          {members.length > 0 && (
            <div className="space-y-2">
              {members.map((m, i) => {
                const role = TEAM_ROLES.find((r) => r.id === m.role);
                const RoleIcon = role?.icon || Users;
                return (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <RoleIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{m.identifier}</p>
                      <p className="text-xs text-accent">{role?.label || m.role}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {m.device}</span>
                        {m.responsibility && <span className="flex items-center gap-1"><Check className="w-3 h-3" /> {m.responsibility}</span>}
                      </div>
                    </div>
                    <button onClick={() => removeMember(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!canNextTeam}>
              Next: Episode Setup <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Basics */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-heading text-lg text-foreground mb-1">Start a New Episode</h3>
            <p className="text-sm text-muted-foreground">Set title/topic and draft your episode script (used as cue cards during recording).</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Episode #</Label>
              <Input type="number" min="1" value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} placeholder="1" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject Matter</Label>
              <Input value={subjectMatter} onChange={(e) => setSubjectMatter(e.target.value)} placeholder="Topic of the episode" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Episode Script (cue-card source)</Label>
            <Textarea
              value={episodeScript}
              onChange={(e) => setEpisodeScript(e.target.value)}
              placeholder="Write script lines. Each non-empty line can be shown as a cue card while recording."
              className="min-h-[160px]"
            />
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canNextBasics}>
              Next: Upload Video <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Video Upload */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="font-heading text-lg text-foreground mb-1">Upload Episode Video</h3>
            <p className="text-sm text-muted-foreground">Upload your full episode video (stored privately). You can skip this and add it later.</p>
          </div>

          {videoUri ? (
            <video src={videoUri} controls className="w-full max-h-[300px] rounded-lg border border-border" />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full aspect-video rounded-lg border border-dashed border-border flex flex-col items-center justify-center bg-card/50 hover:border-primary/40 transition-colors"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-foreground">Click to upload video</p>
                  <p className="text-xs text-muted-foreground mt-1">MP4, WebM, MOV</p>
                </>
              )}
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleVideoUpload} className="hidden" />

          {videoUri && !uploading && (
            <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
              <Upload className="w-4 h-4" /> Replace Video
            </Button>
          )}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={handleFinish} disabled={saving || !canNextBasics || !canNextTeam}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Launch Episode
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}