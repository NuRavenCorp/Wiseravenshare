export const ROLE_PERMISSIONS = {
  creator:       { canEditScript: true,  canSubmitScript: true,  canApproveScript: true,  canEditLineup: true,  canApproveLineup: true,  canManageMedia: true,  canManageTeam: true,  label: "Creator" },
  script_writer: { canEditScript: true,  canSubmitScript: true,  canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: false, canManageTeam: false, label: "Script Writer" },
  host:          { canEditScript: true,  canSubmitScript: true,  canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: false, canManageTeam: false, label: "Host" },
  co_host:       { canEditScript: true,  canSubmitScript: true,  canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: false, canManageTeam: false, label: "Co-Host" },
  director:      { canEditScript: true,  canSubmitScript: true,  canApproveScript: true,  canEditLineup: true,  canApproveLineup: true,  canManageMedia: true,  canManageTeam: false, label: "Director" },
  producer:      { canEditScript: true,  canSubmitScript: true,  canApproveScript: true,  canEditLineup: true,  canApproveLineup: true,  canManageMedia: true,  canManageTeam: true,  label: "Producer" },
  editor:        { canEditScript: false, canSubmitScript: false, canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: true,  canManageTeam: false, label: "Editor" },
  camera:        { canEditScript: false, canSubmitScript: false, canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: true,  canManageTeam: false, label: "Camera Operator" },
  audio:         { canEditScript: false, canSubmitScript: false, canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: true,  canManageTeam: false, label: "Audio Engineer" },
  researcher:    { canEditScript: true,  canSubmitScript: false, canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: false, canManageTeam: false, label: "Researcher" },
  guest:         { canEditScript: false, canSubmitScript: false, canApproveScript: false, canEditLineup: false, canApproveLineup: false, canManageMedia: false, canManageTeam: false, label: "Guest" },
};

const VIEWER_PERMS = {
  canEditScript: false, canSubmitScript: false, canApproveScript: false,
  canEditLineup: false, canApproveLineup: false, canManageMedia: false,
  canManageTeam: false, label: "Viewer",
};

export function resolveUserRole(podcast, teams, userId) {
  if (!userId || !podcast) return null;
  if (podcast.created_by_id === userId) return "creator";
  for (const team of teams) {
    if (!podcast.team_ids?.includes(team.id)) continue;
    const detail = (team.member_details || []).find((m) => m.user_id === userId);
    if (detail) return detail.role || "guest";
  }
  return null;
}

export function getPermissions(role) {
  if (!role) return VIEWER_PERMS;
  return ROLE_PERMISSIONS[role] || VIEWER_PERMS;
}

export function resolvePermissions(podcast, teams, userId) {
  return getPermissions(resolveUserRole(podcast, teams, userId));
}