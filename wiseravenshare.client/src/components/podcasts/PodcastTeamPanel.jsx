import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Plus,
  Users,
  UserPlus,
  CheckCircle,
  AlertCircle,
  Monitor,
  Target,
  Trash2,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { TEAM_ROLES } from "@/components/podcasts/PodcastLaunchWizard";
import RolePermissionsLegend from "@/components/podcasts/RolePermissionsLegend";

export default function PodcastTeamPanel({ podcast, onUpdate }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState("");
  const [inviteEmails, setInviteEmails] = useState({});
  const [inviteStatus, setInviteStatus] = useState({});
  const [creating, setCreating] = useState(false);
  const [inviteRole, setInviteRole] = useState({});
  const [inviteDevice, setInviteDevice] = useState({});
  const [inviteResp, setInviteResp] = useState({});
  const [editingMember, setEditingMember] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [editDevice, setEditDevice] = useState("");
  const [editResp, setEditResp] = useState("");

  const loadTeams = async () => {
    setLoading(true);
    try {
      const page = await apiClient.entities.Team.filter({});
      const allTeams = page.items || [];
      setTeams(allTeams.filter((t) => podcast.team_ids?.includes(t.id)));
    } catch {
      // no teams
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, [podcast.team_ids]);

  const handleCreateTeam = async () => {
    if (!newTeamName) return;
    setCreating(true);
    try {
      const me = await apiClient.auth.me();
      const team = await apiClient.entities.Team.create({
        team_name: newTeamName,
        owner_id: me.id,
        members: [],
        member_details: [],
        focus: podcast.subject_matter,
      });
      await apiClient.entities.Podcast.update(podcast.id, {
        team_ids: [...(podcast.team_ids || []), team.id],
      });
      setNewTeamName("");
      onUpdate();
    } finally {
      setCreating(false);
    }
  };

  const handleInvite = async (teamId) => {
    const identifier = inviteEmails[teamId];
    if (!identifier) return;
    setInviteStatus({ ...inviteStatus, [teamId]: { type: "loading" } });
    try {
      const res = await apiClient.functions.invoke("InviteCollaborator", {
        team_id: teamId,
        identifier,
        role: inviteRole[teamId] || "host",
        responsibility: inviteResp[teamId] || "",
        device: inviteDevice[teamId] || "",
      });
      if (res.data?.error) {
        setInviteStatus({
          ...inviteStatus,
          [teamId]: { type: "error", msg: res.data.error },
        });
      } else {
        setInviteStatus({
          ...inviteStatus,
          [teamId]: { type: "success", msg: "Invitation sent!" },
        });
        setInviteEmails({ ...inviteEmails, [teamId]: "" });
        loadTeams();
      }
    } catch (e) {
      setInviteStatus({
        ...inviteStatus,
        [teamId]: {
          type: "error",
          msg: e?.response?.data?.error || e?.message || "Invite failed",
        },
      });
    }
  };

  const handleRemoveMember = async (team, userId) => {
    const updatedDetails = (team.member_details || []).filter((m) => m.user_id !== userId);
    const updatedMembers = (team.members || []).filter((id) => id !== userId);
    await apiClient.entities.Team.update(team.id, {
      member_details: updatedDetails,
      members: updatedMembers,
    });
    loadTeams();
  };

  const startEditMember = (m) => {
    setEditingMember(m.user_id);
    setEditRole(m.role || "host");
    setEditDevice(m.device || "");
    setEditResp(m.responsibility || "");
  };

  const handleSaveEdit = async (team) => {
    const updatedDetails = (team.member_details || []).map((m) =>
      m.user_id === editingMember
        ? { ...m, role: editRole, device: editDevice, responsibility: editResp }
        : m
    );
    await apiClient.entities.Team.update(team.id, { member_details: updatedDetails });
    setEditingMember(null);
    loadTeams();
  };

  return (
    <div className="space-y-6">
      <RolePermissionsLegend />
      <div className="p-4 rounded-lg border border-border bg-card space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium">Create a Collaboration Team</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Create a team for this podcast, then invite creators to collaborate on
          the script and line-up.
        </p>
        <div className="flex gap-2">
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name (e.g. Production Crew)"
          />
          <Button
            onClick={handleCreateTeam}
            disabled={creating || !newTeamName}
          >
            {creating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Create
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-8">
          <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No teams linked yet. Create one above to start collaborating.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map((team) => {
            const status = inviteStatus[team.id];
            const memberCount = team.members?.length || 0;
            return (
              <div
                key={team.id}
                className="p-4 rounded-lg border border-border bg-card space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {team.team_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {memberCount} member{memberCount !== 1 ? "s" : ""}
                      {team.focus ? ` · ${team.focus}` : ""}
                    </p>
                  </div>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                {team.purpose && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <Target className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" />
                    <span><span className="text-accent font-medium">Purpose:</span> {team.purpose}</span>
                  </p>
                )}

                {/* Existing members with details */}
                {(team.member_details || []).length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    {(team.member_details || []).map((m) => {
                      const role = TEAM_ROLES.find((r) => r.id === m.role);
                      const RoleIcon = role?.icon || Users;
                      const isEditing = editingMember === m.user_id;
                      return (
                        <div key={m.user_id} className="space-y-2">
                          <div className="flex items-start gap-2.5 p-2 rounded-md bg-secondary/30">
                            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                              <RoleIcon className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{m.display_name || m.user_id}</p>
                              <p className="text-xs text-accent">{role?.label || m.role}</p>
                              <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                                {m.device && <span className="flex items-center gap-1"><Monitor className="w-3 h-3" /> {m.device}</span>}
                                {m.responsibility && <span>{m.responsibility}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={() => startEditMember(m)} className="text-muted-foreground hover:text-primary p-1 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleRemoveMember(team, m.user_id)} className="text-muted-foreground hover:text-destructive p-1 rounded">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {isEditing && (
                            <div className="p-3 rounded-md border border-border bg-card space-y-2">
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  value={editRole}
                                  onChange={(e) => setEditRole(e.target.value)}
                                  className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                                >
                                  {TEAM_ROLES.map((r) => (
                                    <option key={r.id} value={r.id}>{r.label}</option>
                                  ))}
                                </select>
                                <Input
                                  value={editDevice}
                                  onChange={(e) => setEditDevice(e.target.value)}
                                  placeholder="Device"
                                />
                              </div>
                              <Input
                                value={editResp}
                                onChange={(e) => setEditResp(e.target.value)}
                                placeholder="Responsibility"
                              />
                              <div className="flex gap-2">
                                <Button onClick={() => handleSaveEdit(team)} size="sm" className="flex-1">
                                  <Check className="w-4 h-4" /> Save Changes
                                </Button>
                                <Button onClick={() => setEditingMember(null)} variant="outline" size="sm">
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Invite form with role/device/responsibility */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Input
                    value={inviteEmails[team.id] || ""}
                    onChange={(e) =>
                      setInviteEmails({ ...inviteEmails, [team.id]: e.target.value })
                    }
                    placeholder="Username or email"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={inviteRole[team.id] || "host"}
                      onChange={(e) => setInviteRole({ ...inviteRole, [team.id]: e.target.value })}
                      className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                    >
                      {TEAM_ROLES.map((r) => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>
                    <Input
                      value={inviteDevice[team.id] || ""}
                      onChange={(e) => setInviteDevice({ ...inviteDevice, [team.id]: e.target.value })}
                      placeholder="Device (e.g. Studio Cam A)"
                    />
                  </div>
                  <Input
                    value={inviteResp[team.id] || ""}
                    onChange={(e) => setInviteResp({ ...inviteResp, [team.id]: e.target.value })}
                    placeholder="Responsibility on this episode"
                  />
                  <Button
                    onClick={() => handleInvite(team.id)}
                    disabled={!inviteEmails[team.id] || status?.type === "loading"}
                    size="sm"
                    className="w-full"
                  >
                    {status?.type === "loading" ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Announce Member
                  </Button>
                </div>
                {status?.type === "success" && (
                  <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> {status.msg}
                  </p>
                )}
                {status?.type === "error" && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {status.msg}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}