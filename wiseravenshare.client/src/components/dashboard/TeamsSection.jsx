import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Users, Loader2, X, UserPlus, Crown, Trash2, Mail } from "lucide-react";

const ROLE_PRESETS = ["Producer", "Editor", "Host", "Contributor", "Engineer", "Guest"];

export default function TeamsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ team_name: "", description: "", focus: "" });
  const [inviteInput, setInviteInput] = useState({});
  const [inviteRole, setInviteRole] = useState({});
  const [inviting, setInviting] = useState({});
  const [inviteMsg, setInviteMsg] = useState({});
  const [editRole, setEditRole] = useState({}); // `${teamId}:${userId}` -> role

  const fetchTeams = async () => {
    try {
      const res = await apiClient.entities.Team.filter({}, { sort: "-created_date", limit: 50 });
      setTeams(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchTeams();
  }, [user]);

  const handleCreate = async () => {
    if (!form.team_name) return;
    await apiClient.entities.Team.create({
      ...form,
      owner_id: user.id,
      members: [user.id],
      member_details: [{ user_id: user.id, display_name: user.full_name || user.email, role: "Owner", responsibility: "" }],
    });
    setForm({ team_name: "", description: "", focus: "" });
    setShowForm(false);
    fetchTeams();
  };

  const handleInvite = async (teamId) => {
    const identifier = (inviteInput[teamId] || "").trim();
    if (!identifier) return;
    setInviting({ ...inviting, [teamId]: true });
    setInviteMsg({ ...inviteMsg, [teamId]: null });
    try {
      const res = await apiClient.functions.invoke("InviteCollaborator", {
        team_id: teamId,
        identifier,
        role: inviteRole[teamId] || "",
      });
      if (res.data?.error) throw new Error(res.data.error);
      const label = res.data?.invited === "email"
        ? `Invite email sent to ${identifier}`
        : `Invite sent to ${res.data?.display_name || "collaborator"}!`;
      setInviteMsg({ ...inviteMsg, [teamId]: label });
      setInviteInput({ ...inviteInput, [teamId]: "" });
      setInviteRole({ ...inviteRole, [teamId]: "" });
      fetchTeams();
    } catch (e) {
      setInviteMsg({ ...inviteMsg, [teamId]: e.message || "Could not find that user. Try their email or username." });
    } finally {
      setInviting({ ...inviting, [teamId]: false });
    }
  };

  const updateMemberRole = async (team, memberId, newRole) => {
    const memberDetails = [...(team.member_details || [])];
    const idx = memberDetails.findIndex((m) => m.user_id === memberId);
    if (idx < 0) return;
    memberDetails[idx] = { ...memberDetails[idx], role: newRole };
    try {
      await apiClient.entities.Team.update(team.id, { member_details: memberDetails });
      toast({ title: "Role updated" });
      setEditRole({ ...editRole, [`${team.id}:${memberId}`]: undefined });
      fetchTeams();
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
  };

  const removeMember = async (team, memberId) => {
    const members = (team.members || []).filter((id) => id !== memberId);
    const memberDetails = (team.member_details || []).filter((m) => m.user_id !== memberId);
    try {
      await apiClient.entities.Team.update(team.id, { members, member_details: memberDetails });
      toast({ title: "Member removed" });
      fetchTeams();
    } catch (e) {
      toast({ title: "Removal failed", description: e.message, variant: "destructive" });
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <Button onClick={() => setShowForm(!showForm)} variant="outline">
        {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        {showForm ? "Cancel" : "Create Team"}
      </Button>
      {showForm && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="space-y-2">
            <Label htmlFor="team_name">Team Name</Label>
            <Input id="team_name" value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} placeholder="The Midnight Ravens..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="focus">Focus</Label>
            <Input id="focus" value={form.focus} onChange={(e) => setForm({ ...form, focus: e.target.value })} placeholder="Music production, journalism, podcasting..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>
          <Button onClick={handleCreate} disabled={!form.team_name}>Create Team</Button>
        </div>
      )}
      {teams.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No teams yet. Create one and invite collaborators!</p>
        </div>
      ) : (
        teams.map((t) => {
          const isOwner = t.owner_id === user.id;
          const details = t.member_details || [];
          return (
            <div key={t.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium text-foreground">{t.team_name}</h3>
                {isOwner && <Crown className="w-4 h-4 text-accent" />}
              </div>
              {t.focus && <p className="text-xs text-accent/80 mb-1">{t.focus}</p>}
              {t.description && <p className="text-xs text-muted-foreground mb-2">{t.description}</p>}
              <p className="text-xs text-muted-foreground mb-3">{t.members?.length || 0} member{(t.members?.length || 0) !== 1 ? "s" : ""}</p>

              {/* Member list with role management */}
              {details.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {details.map((m) => {
                    const isMe = m.user_id === user.id;
                    const editKey = `${t.id}:${m.user_id}`;
                    const editing = editRole[editKey] !== undefined;
                    return (
                      <div key={m.user_id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-1.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{m.display_name}{isMe && " (you)"}</p>
                          {!editing ? (
                            <span className="text-[11px] text-muted-foreground">{m.role || "Member"}</span>
                          ) : (
                            <select
                              value={editRole[editKey]}
                              onChange={(e) => setEditRole({ ...editRole, [editKey]: e.target.value })}
                              className="text-[11px] bg-background border border-border rounded px-1 py-0.5 text-foreground"
                            >
                              {ROLE_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
                              <option value="">Member</option>
                            </select>
                          )}
                        </div>
                        {isOwner && !isMe && (
                          <div className="flex items-center gap-1 shrink-0">
                            {editing ? (
                              <>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => updateMemberRole(t, m.user_id, editRole[editKey])}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditRole({ ...editRole, [editKey]: undefined })}>Cancel</Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditRole({ ...editRole, [editKey]: m.role || "" })}>Edit role</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive" onClick={() => removeMember(t, m.user_id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Invite form */}
              {isOwner && (
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <Input
                      placeholder="Email or username..."
                      value={inviteInput[t.id] || ""}
                      onChange={(e) => setInviteInput({ ...inviteInput, [t.id]: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") handleInvite(t.id); }}
                      className="h-8 text-sm"
                    />
                    <select
                      value={inviteRole[t.id] || ""}
                      onChange={(e) => setInviteRole({ ...inviteRole, [t.id]: e.target.value })}
                      className="h-8 text-xs bg-background border border-border rounded px-2 text-foreground"
                    >
                      <option value="">Role (optional)</option>
                      {ROLE_PRESETS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <Button size="sm" onClick={() => handleInvite(t.id)} disabled={inviting[t.id] || !inviteInput[t.id]}>
                      {inviting[t.id] ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
                      Invite
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Enter an email to invite someone new, or a username for existing members.
                  </p>
                </div>
              )}
              {inviteMsg[t.id] && (
                <p className={`text-xs mt-2 ${inviteMsg[t.id].startsWith("Invite") ? "text-accent" : "text-destructive"}`}>{inviteMsg[t.id]}</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}