import React, { useState } from "react";
import { Shield, ChevronDown, ChevronUp } from "lucide-react";
import { ROLE_PERMISSIONS } from "@/lib/podcastPermissions";
import { TEAM_ROLES } from "@/components/podcasts/PodcastLaunchWizard";

const PERMISSION_LABELS = [
  { key: "canEditScript", label: "Edit Script" },
  { key: "canSubmitScript", label: "Submit Script" },
  { key: "canApproveScript", label: "Approve Script" },
  { key: "canEditLineup", label: "Edit Line-up" },
  { key: "canApproveLineup", label: "Approve Line-up" },
  { key: "canManageMedia", label: "Manage Media" },
  { key: "canManageTeam", label: "Manage Team" },
];

export default function RolePermissionsLegend() {
  const [open, setOpen] = useState(false);

  const roles = TEAM_ROLES.map((r) => ({
    id: r.id,
    label: r.label,
    icon: r.icon,
    perms: ROLE_PERMISSIONS[r.id],
  })).filter((r) => r.perms);

  return (
    <div className="rounded-lg border border-border bg-card/50 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Role Permissions Guide</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 text-muted-foreground font-medium">Role</th>
                {PERMISSION_LABELS.map((p) => (
                  <th key={p.key} className="text-center p-2 text-muted-foreground font-medium whitespace-nowrap">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                const Icon = r.icon;
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3 h-3 text-primary shrink-0" />
                        <span className="text-foreground whitespace-nowrap">{r.label}</span>
                      </div>
                    </td>
                    {PERMISSION_LABELS.map((p) => (
                      <td key={p.key} className="text-center p-2">
                        {r.perms[p.key] ? (
                          <span className="text-green-500">&#10003;</span>
                        ) : (
                          <span className="text-muted-foreground/30">&mdash;</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}