import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import AvatarUploadContainer from "@/components/ui/AvatarUploadContainer";
import SavedAvatarPhotoContainer from "@/components/media/SavedAvatarPhotoContainer";
import {
  Loader2,
  Save,
  Check,
  AlertCircle,
  Upload,
  Camera,
  Trash2,
  Link as LinkIcon,
  User as UserIcon,
  Users,
  UserPlus,
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
  const { user, checkUserAuth, updateActiveAvatar } = useAuth();

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
  const [profileMsg, setProfileMsg] = useState(null); // { text, variant }
  const [followStats, setFollowStats] = useState({ followers: 0, following: 0 });

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

        // Fetch follow stats in parallel (best-effort)
        try {
          const [followingRes, followersRes] = await Promise.all([
            apiClient.follows.following().catch(() => null),
            user?.id ? apiClient.follows.followers(user.id).catch(() => null) : Promise.resolve(null),
          ]);
          setFollowStats({
            following: followingRes?.followingCount ?? 0,
            followers: followersRes?.followersCount ?? 0,
          });
        } catch { /* non-critical */ }
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



  useEffect(() => {
    const handleAvatarUpdated = (e) => {
      const next = e.detail?.avatarUrl;
      if (next && next !== avatar) {
        setAvatar(next);
      }
    };
    window.addEventListener("wr_avatar_updated", handleAvatarUpdated);
    return () => window.removeEventListener("wr_avatar_updated", handleAvatarUpdated);
  }, [avatar]);

  const handleRemoveAvatar = async () => {
    setAvatar("");
    if (typeof updateActiveAvatar === "function") {
      updateActiveAvatar("");
    }
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

    if (avatar && typeof updateActiveAvatar === "function") {
      updateActiveAvatar(avatar.trim());
    }

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

        {/* ── Avatar container with computer file upload, webcam photo capture & persistence ── */}
        <AvatarUploadContainer
          value={avatar}
          name={name || user?.displayName || user?.name || user?.email}
          userId={user?.id || "me"}
          disabled={saving}
          onChange={(newUrl) => {
            setAvatar(newUrl);
            if (typeof updateActiveAvatar === "function") {
              updateActiveAvatar(newUrl);
            }
            try {
              const currentCache = {
                name,
                bio,
                location,
                website,
                avatar: newUrl,
              };
              localStorage.setItem(cacheKey, JSON.stringify(currentCache));
            } catch {}
          }}
          onUpload={async (file) => {
            const uploadRes = await apiClient.users.uploadAvatar(user?.id || "me", file);
            const uploadedUrl = uploadRes?.avatarUrl || uploadRes?.avatar || "";
            if (uploadedUrl) {
              setAvatar(uploadedUrl);
              if (typeof updateActiveAvatar === "function") {
                updateActiveAvatar(uploadedUrl);
              }
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
            }
            return uploadedUrl;
          }}
          onRemove={handleRemoveAvatar}
          onSuccess={(msg) => {
            setProfileMsg({ text: msg, variant: "success" });
            setTimeout(() => setProfileMsg(null), 3500);
            checkUserAuth();
          }}
          onError={(err) => {
            setProfileMsg({ text: err, variant: "error" });
          }}
        />

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

        {/* ── Follower / Following counts ── */}
        <div className="pt-3 border-t border-border flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-heading font-semibold text-foreground leading-none">
                {followStats.followers.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">followers</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <UserPlus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-heading font-semibold text-foreground leading-none">
                {followStats.following.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">following</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Saved Avatar & Photo Upload Vault ── */}
      <div className="space-y-4">
        <SavedAvatarPhotoContainer
          onAvatarSelected={(url) => {
            setAvatar(url);
            try {
              const currentCache = {
                name,
                bio,
                location,
                website,
                avatar: url,
              };
              localStorage.setItem(cacheKey, JSON.stringify(currentCache));
            } catch {}
            checkUserAuth();
            setProfileMsg({ text: "Active avatar updated from your vault.", variant: "success" });
            setTimeout(() => setProfileMsg(null), 3500);
          }}
        />
      </div>

      {/* ── Password change ── */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
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
          {changingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
          Update Password
        </Button>
      </div>
    </div>
  );
}
