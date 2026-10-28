/**
 * PodcastCrewJoinBanner.jsx
 *
 * Shows a card for each podcast episode the logged-in user has been invited to
 * as a crew member. Allows them to:
 *  1. See their assigned role (or pick one if left blank by the creator)
 *  2. Confirm their device
 *  3. Copy their personalised join link for the recording session
 *
 * Surfaces at the top of PodcastsPanel whenever the user has pending crew
 * invitations on any episode they can access.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Mic, Users, Monitor, Copy, CheckCircle, Loader2, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/api/client";
import { TEAM_ROLES } from "@/components/podcasts/PodcastLaunchWizard";

const DEVICE_OPTIONS = [
  "Studio Cam A",
  "Studio Cam B",
  "Studio PC",
  "MacBook",
  "Tablet / iPad",
  "Android Phone",
  "USB Mic",
  "External Recorder",
];

function buildJoinLink(episodeId, sessionCode, name, role, device) {
  if (!sessionCode || typeof window === "undefined") return null;
  const base = `${window.location.origin}/join-feed`;
  const params = new URLSearchParams({ code: sessionCode });
  if (name)   params.set("name",   name);
  if (role)   params.set("role",   role);
  if (device) params.set("device", device);
  return `${base}?${params.toString()}`;
}

export default function PodcastCrewJoinBanner({ userId, onUpdate }) {
  const [invitations, setInvitations] = useState([]);  // [{episode, team, member, sessionCode}]
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});        // episodeId → bool
  const [roleChoice, setRoleChoice] = useState({});    // episodeId → role string
  const [deviceChoice, setDeviceChoice] = useState({}); // episodeId → device string
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const [copied, setCopied] = useState({});

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const [podcastPage, teamPage] = await Promise.all([
        apiClient.entities.Podcast.filter({}, { limit: 50 }),
        apiClient.entities.Team.filter({}),
      ]);
      const podcasts = podcastPage.items || [];
      const teams = teamPage.items || [];

      const results = [];
      for (const episode of podcasts) {
        if (!episode.team_ids?.length) continue;
        const myTeams = teams.filter((t) => episode.team_ids.includes(t.id));
        for (const team of myTeams) {
          const member = (team.member_details || []).find(
            (m) => m.user_id === userId,
          );
          if (!member) continue;
          // Only surface if not the creator
          if (episode.created_by_id === userId) continue;
          // Try to load live session code from snapshot
          let sessionCode = "";
          try {
            const snapshot = await apiClient.requestJson(
              `/api/auth/team-access/podcast-session-snapshot?roomId=${encodeURIComponent(`podcast-${episode.id}`)}`,
              { method: "GET" },
            ).catch(() => null);
            sessionCode = snapshot?.snapshot?.liveSessionCode || "";
          } catch {
            sessionCode = "";
          }
          results.push({ episode, team, member, sessionCode });
        }
      }
      setInvitations(results);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading || invitations.length === 0) return null;

  const handleConfirmRole = async (invitation) => {
    const { episode, team, member } = invitation;
    const newRole = roleChoice[episode.id] ?? member.role ?? "";
    const newDevice = deviceChoice[episode.id] ?? member.device ?? "";
    setSaving((s) => ({ ...s, [episode.id]: true }));
    try {
      const updatedDetails = (team.member_details || []).map((m) =>
        m.user_id === userId
          ? { ...m, role: newRole, device: newDevice, confirmed: true }
          : m
      );
      await apiClient.entities.Team.update(team.id, { member_details: updatedDetails });
      setSaved((s) => ({ ...s, [episode.id]: true }));
      onUpdate?.();
      await load();
    } finally {
      setSaving((s) => ({ ...s, [episode.id]: false }));
    }
  };

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied((c) => ({ ...c, [key]: true }));
      setTimeout(() => setCopied((c) => ({ ...c, [key]: false })), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <div className="space-y-3 mb-6">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Mic className="w-4 h-4 text-primary" />
        <span>Pending crew invitations ({invitations.length})</span>
      </div>
      {invitations.map(({ episode, team, member, sessionCode }) => {
        const isOpen = expanded[episode.id] ?? false;
        const isSaving = saving[episode.id] ?? false;
        const isSaved = saved[episode.id] ?? false;
        const currentRole = roleChoice[episode.id] ?? member.role ?? "";
        const currentDevice = deviceChoice[episode.id] ?? member.device ?? "";
        const displayName = member.display_name || member.identifier || member.user_id || "You";
        const roleLabel = TEAM_ROLES.find((r) => r.id === currentRole)?.label;
        const RoleIcon = TEAM_ROLES.find((r) => r.id === currentRole)?.icon || Users;
        const joinLink = buildJoinLink(episode.id, sessionCode, displayName, currentRole, currentDevice);
        const needsRole = !member.role || !member.confirmed;

        return (
          <div
            key={`${episode.id}:${team.id}`}
            className={`rounded-xl border bg-card overflow-hidden transition-colors ${
              needsRole
                ? "border-primary/40 bg-primary/5"
                : "border-border"
            }`}
          >
            {/* Header row — always visible */}
            <button
              type="button"
              onClick={() => setExpanded((e) => ({ ...e, [episode.id]: !isOpen }))}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <RoleIcon className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    EP {episode.episode_number} — {episode.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {roleLabel
                      ? `You're the ${roleLabel}`
                      : "Role not yet chosen — tap to claim yours"}
                    {team.team_name ? ` · ${team.team_name}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isSaved && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {needsRole && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                    Action needed
                  </span>
                )}
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                }
              </div>
            </button>

            {/* Expanded body */}
            {isOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-border">
                <p className="text-xs text-muted-foreground pt-3">
                  Choose your role for this episode and confirm your device.
                  Once confirmed, you'll get a personalised join link to share your camera during recording.
                </p>

                {/* Role selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">Your Role</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {TEAM_ROLES.filter((r) => r.id !== "creator").map((r) => {
                      const RIcon = r.icon;
                      const isActive = currentRole === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRoleChoice((c) => ({ ...c, [episode.id]: r.id }))}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                            isActive
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40"
                          }`}
                        >
                          <RIcon className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Device selector */}
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground font-medium">
                    Your Device
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={currentDevice}
                      onChange={(e) => setDeviceChoice((d) => ({ ...d, [episode.id]: e.target.value }))}
                      className="flex-1 h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                    >
                      <option value="">Select device…</option>
                      {DEVICE_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <Input
                      value={currentDevice}
                      onChange={(e) => setDeviceChoice((d) => ({ ...d, [episode.id]: e.target.value }))}
                      placeholder="or type a device name"
                      className="flex-1 text-sm"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Monitor className="w-3 h-3" />
                    This is the device you'll use during the recording session.
                  </p>
                </div>

                {/* Confirm button */}
                <Button
                  onClick={() => handleConfirmRole({ episode, team, member, sessionCode })}
                  disabled={isSaving || !currentRole || !currentDevice}
                  className="w-full"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  Confirm — Join as {roleLabel || "crew member"}
                </Button>

                {/* Join link (only when session code exists) */}
                {sessionCode ? (
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Your personalised join link</p>
                    <p className="text-xs text-foreground font-mono break-all">
                      {joinLink}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(joinLink || "", `link-${episode.id}`)}
                        className="flex-1"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {copied[`link-${episode.id}`] ? "Copied!" : "Copy link"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => joinLink && window.open(joinLink, "_blank", "noopener,noreferrer")}
                        disabled={!joinLink}
                        className="flex-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open join page
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Open this link on your recording device when the session is live.
                      Your camera will appear on the director's monitor wall automatically.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground text-center">
                    Your join link will appear here once the episode host starts the live crew feed room.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
