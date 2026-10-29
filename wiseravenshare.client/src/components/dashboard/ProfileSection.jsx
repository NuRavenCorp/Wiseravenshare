import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Check, KeyRound, AlertCircle } from "lucide-react";

function FieldGroup({ id, label, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function StatusBanner({ message, variant = "success" }) {
  if (!message) return null;
  const isError = variant === "error";
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
      isError
        ? "bg-destructive/10 text-destructive border border-destructive/30"
        : "bg-green-500/10 text-green-600 border border-green-500/30"
    }`}>
      {isError ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0" />}
      {message}
    </div>
  );
}

export default function ProfileSection() {
  const { user, checkUserAuth } = useAuth();

  // ── Profile fields ─────────────────────────────────────────────
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [website, setWebsite] = useState("");
  const [avatar, setAvatar] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null); // { text, variant }

  // ── Password change ─────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      try {
        const res = await apiClient.users.getById(user.id);
        setName(res.name ?? res.display_name ?? "");
        setBio(res.bio ?? "");
        setLocation(res.location ?? "");
        setWebsite(res.website ?? "");
        setAvatar(res.avatar ?? res.avatar_uri ?? "");
      } catch {
        // fall back to auth context values
        setName(user.displayName ?? user.name ?? user.full_name ?? user.email?.split("@")[0] ?? "");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setProfileMsg(null);
    try {
      await apiClient.users.updateProfile(user.id, {
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
        avatar: avatar.trim(),
      });
      await checkUserAuth();
      setProfileMsg({ text: "Profile saved.", variant: "success" });
      setTimeout(() => setProfileMsg(null), 3000);
    } catch (err) {
      setProfileMsg({ text: err?.message || "Save failed.", variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (!currentPassword || !newPassword) {
      setPwMsg({ text: "All password fields are required.", variant: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ text: "New passwords do not match.", variant: "error" });
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ text: "New password must be at least 8 characters.", variant: "error" });
      return;
    }
    setChangingPw(true);
    try {
      await apiClient.auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ text: "Password changed successfully.", variant: "success" });
      setTimeout(() => setPwMsg(null), 4000);
    } catch (err) {
      setPwMsg({ text: err?.message || "Password change failed.", variant: "error" });
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* ── Profile card ── */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <h2 className="font-semibold text-foreground">Profile</h2>

        <FieldGroup id="name" label="Display Name">
          <Input
            id="name"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your public name"
          />
        </FieldGroup>

        <FieldGroup id="bio" label="Bio">
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Tell the flock about yourself…"
          />
          <p className="text-xs text-muted-foreground text-right">{bio.length}/500</p>
        </FieldGroup>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup id="location" label="Location">
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City, Country"
            />
          </FieldGroup>
          <FieldGroup id="website" label="Website">
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
            />
          </FieldGroup>
        </div>

        <FieldGroup id="avatar" label="Avatar URL">
          <div className="flex items-center gap-3">
            {avatar && (
              <img
                src={avatar}
                alt="avatar preview"
                className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
            <Input
              id="avatar"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="https://..."
              className="flex-1"
            />
          </div>
        </FieldGroup>

        <StatusBanner message={profileMsg?.text} variant={profileMsg?.variant} />

        <Button onClick={handleSaveProfile} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Profile
        </Button>
      </div>

      {/* ── Account info (read-only) ── */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-3">
        <h2 className="font-semibold text-foreground">Account</h2>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Email</Label>
          <p className="text-sm text-foreground">{user?.email ?? "—"}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-muted-foreground text-xs">Username / Handle</Label>
          <p className="text-sm text-foreground">{user?.handle ?? user?.username ?? "—"}</p>
        </div>
      </div>

      {/* ── Password change ── */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-foreground">Change Password</h2>
        </div>

        <FieldGroup id="current-pw" label="Current Password">
          <Input
            id="current-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
        </FieldGroup>

        <div className="grid grid-cols-2 gap-4">
          <FieldGroup id="new-pw" label="New Password">
            <Input
              id="new-pw"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FieldGroup>
          <FieldGroup id="confirm-pw" label="Confirm New Password">
            <Input
              id="confirm-pw"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FieldGroup>
        </div>

        <StatusBanner message={pwMsg?.text} variant={pwMsg?.variant} />

        <Button onClick={handleChangePassword} disabled={changingPw} variant="secondary">
          {changingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Update Password
        </Button>
      </div>
    </div>
  );
}
