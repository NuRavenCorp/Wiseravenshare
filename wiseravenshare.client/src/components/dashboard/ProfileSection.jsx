import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Save,
  Check,
  KeyRound,
  AlertCircle,
  Upload,
  Camera,
  Trash2,
  Link as LinkIcon,
  User as UserIcon,
} from "lucide-react";

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
  const fileInputRef = useRef(null);

  const cacheKey = user?.id ? `wr_profile_cache_${user.id}` : "wr_profile_cache";

  // Pre-seed from cache if available so there is zero layout flicker
  const getInitialState = () => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  const initial = getInitialState();

  // ── Profile fields ─────────────────────────────────────────────
  const [name, setName] = useState(initial?.name ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [avatar, setAvatar] = useState(initial?.avatar ?? "");

  const [loading, setLoading] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
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
        const nextName = res.name ?? res.display_name ?? "";
        const nextBio = res.bio ?? "";
        const nextLocation = res.location ?? "";
        const nextWebsite = res.website ?? "";
        const nextAvatar = res.avatar ?? res.avatar_uri ?? "";

        setName(nextName);
        setBio(nextBio);
        setLocation(nextLocation);
        setWebsite(nextWebsite);
        setAvatar(nextAvatar);

        // Retain / persist locally in cache
        try {
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              name: nextName,
              bio: nextBio,
              location: nextLocation,
              website: nextWebsite,
              avatar: nextAvatar,
            })
          );
        } catch {}
      } catch {
        // Fall back to auth context values
        const fallbackName = user.displayName ?? user.name ?? user.full_name ?? user.email?.split("@")[0] ?? "";
        if (!name) setName(fallbackName);
        if (!avatar && (user.avatar || user.avatar_uri || user.avatarUrl)) {
          setAvatar(user.avatar || user.avatar_uri || user.avatarUrl);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, cacheKey]);

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setProfileMsg({ text: "Please select an image file (JPG, PNG, WebP, GIF).", variant: "error" });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setProfileMsg({ text: "Image size must be 15 MB or less.", variant: "error" });
      return;
    }

    // Immediate optimistic local preview
    const localPreview = URL.createObjectURL(file);
    setAvatar(localPreview);
    setUploadingAvatar(true);
    setProfileMsg(null);

    try {
      const uploadedUrl = await apiClient.users.uploadAvatar(user?.id || "me", file);
      if (uploadedUrl) {
        setAvatar(uploadedUrl);

        // Retain / persist immediately
        try {
          const currentCache = {
            name,
            bio,
            location,
            website,
            avatar: uploadedUrl,
          };
          localStorage.setItem(cacheKey, JSON.stringify(currentCache));
        } catch {}

        await checkUserAuth();
        setProfileMsg({ text: "Avatar uploaded & retained.", variant: "success" });
        setTimeout(() => setProfileMsg(null), 3500);
      }
    } catch (err) {
      setProfileMsg({ text: err?.message || "Failed to upload avatar.", variant: "error" });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatar("");
    try {
      const currentCache = { name, bio, location, website, avatar: "" };
      localStorage.setItem(cacheKey, JSON.stringify(currentCache));
    } catch {}

    try {
      await apiClient.users.updateProfile(user.id || "me", {
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
        avatar: "",
      });
      await checkUserAuth();
      setProfileMsg({ text: "Avatar removed.", variant: "success" });
      setTimeout(() => setProfileMsg(null), 3000);
    } catch (err) {
      setProfileMsg({ text: err?.message || "Failed to remove avatar.", variant: "error" });
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setProfileMsg(null);

    // Retain / persist locally immediately
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          name: name.trim(),
          bio: bio.trim(),
          location: location.trim(),
          website: website.trim(),
          avatar: avatar.trim(),
        })
      );
    } catch {}

    try {
      await apiClient.users.updateProfile(user.id || "me", {
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        website: website.trim(),
        avatar: avatar.trim(),
      });
      await checkUserAuth();
      setProfileMsg({ text: "Profile saved & retained.", variant: "success" });
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

        {/* ── Avatar section with computer file upload & persistence ── */}
        <div className="space-y-3 pt-1">
          <Label>Profile Picture / Avatar</Label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm">
            {/* Circular Preview */}
            <div className="relative group w-20 h-20 rounded-full border-2 border-primary/20 bg-muted flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              {avatar ? (
                <img
                  src={avatar}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <UserIcon className="w-10 h-10 text-muted-foreground/60" />
              )}
              {uploadingAvatar && (
                <div className="absolute inset-0 bg-background/70 backdrop-blur-xs flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
            </div>

            {/* Upload Buttons & Options */}
            <div className="flex-1 space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarFileSelect}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar || saving}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1.5" />
                  )}
                  {avatar ? "Change Photo" : "Upload from Computer"}
                </Button>

                {avatar && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    disabled={uploadingAvatar || saving}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Remove
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="text-xs text-muted-foreground"
                >
                  <LinkIcon className="w-3.5 h-3.5 mr-1" />
                  {showUrlInput ? "Hide URL field" : "Use image link"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Supports JPG, PNG, WebP or GIF up to 15 MB. Automatically retains across sessions.
              </p>

              {/* Optional URL input fallback */}
              {showUrlInput && (
                <div className="pt-2">
                  <Input
                    id="avatar-url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://example.com/my-photo.jpg"
                    className="text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

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
