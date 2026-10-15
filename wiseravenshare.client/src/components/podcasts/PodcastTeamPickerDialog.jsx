import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Monitor, Trash2, UserPlus, Users } from "lucide-react";

export default function PodcastTeamPickerDialog({
  open,
  onOpenChange,
  members,
  onMembersChange,
  roles,
  deviceOptions,
}) {
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState("");
  const [device, setDevice] = useState(deviceOptions[0] || "");
  const [responsibility, setResponsibility] = useState("");

  useEffect(() => {
    if (!open) {
      setIdentifier("");
      setRole("");
      setDevice(deviceOptions[0] || "");
      setResponsibility("");
    }
  }, [deviceOptions, open]);

  const addMember = () => {
    if (!identifier.trim()) return;

    onMembersChange([
      ...members,
      {
        identifier: identifier.trim(),
        role,
        device,
        responsibility: responsibility.trim(),
      },
    ]);
    setIdentifier("");
    setRole("");
    setResponsibility("");
  };

  const removeMember = (index) => {
    onMembersChange(members.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Pick podcast team members
          </DialogTitle>
          <DialogDescription>
            Add collaborators by email, WiseRavenShare user ID, or invite token. Roles can stay blank so the team can self-assign later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs text-muted-foreground">
              Email, WiseRavenShare user ID, or invite token
            </Label>
            <Input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="crew@show.com, user_123, or invite token"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Function / Role</Label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="">Let the crew choose later</option>
              {roles.map((teamRole) => (
                <option key={teamRole.id} value={teamRole.id}>
                  {teamRole.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Device</Label>
            <select
              value={device}
              onChange={(event) => setDevice(event.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              {deviceOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs text-muted-foreground">Responsibility</Label>
            <Input
              value={responsibility}
              onChange={(event) => setResponsibility(event.target.value)}
              placeholder="What they handle in the episode"
            />
          </div>
        </div>

        <div className="flex justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {members.length} team member{members.length === 1 ? "" : "s"} staged for this episode
          </p>
          <Button onClick={addMember} disabled={!identifier.trim()} variant="outline">
            <UserPlus className="w-4 h-4" />
            Add member
          </Button>
        </div>

        <div className="max-h-[280px] overflow-y-auto space-y-2 rounded-lg border border-border bg-card/40 p-3">
          {members.length > 0 ? (
            members.map((member, index) => {
              const matchedRole = roles.find((teamRole) => teamRole.id === member.role);
              return (
                <div
                  key={`${member.identifier}-${index}`}
                  className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground break-all">
                      {member.identifier}
                    </p>
                    <p className="text-xs text-accent">
                      {matchedRole?.label || "Role to be chosen by the crew"}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Monitor className="w-3 h-3" /> {member.device}
                      </span>
                      {member.responsibility && (
                        <span className="flex items-center gap-1">
                          <Check className="w-3 h-3" /> {member.responsibility}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeMember(index)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No team members selected yet.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
