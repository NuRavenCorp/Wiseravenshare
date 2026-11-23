import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { useBrandLogo } from "@/lib/branding";
import { apiClient, resolveMediaUrl } from "@/api/client";
import {
  Camera,
  Upload,
  User,
  Loader2,
  Check,
  Sparkles,
  X,
  FlipHorizontal,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TopLeftAvatarLogoContainer({ className = "" }) {
  const { user, isAuthenticated, activeAvatar, updateActiveAvatar, checkUserAuth } = useAuth();
  const brandLogoUrl = useBrandLogo();
  const fileInputRef = useRef(null);

  // States
  const [avatarUrl, setAvatarUrl] = useState(() => {
    if (activeAvatar) return activeAvatar;
    if (typeof window === "undefined" || !window.localStorage) return "";
    try {
      const activeStored = localStorage.getItem("wiseravenshare_active_avatar");
      if (activeStored) return activeStored;
      const guestStored = localStorage.getItem("wiseravenshare_guest_avatar");
      if (guestStored) return guestStored;
      const saved = localStorage.getItem("wiseravenshare_saved_avatars");
      if (saved) {
        const list = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) {
          const active = list.find((a) => a.isActive) || list[0];
          if (active?.url) return active.url;
        }
      }
    } catch {}
    return "";
  });
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 14, following: 0 });
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [mirrored, setMirrored] = useState(true);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const resolveCurrentAvatar = useCallback(() => {
    const fromUser =
      activeAvatar ||
      user?.avatar ||
      user?.avatarUrl ||
      user?.avatar_uri ||
      "";

    if (fromUser) {
      return fromUser;
    }

    try {
      const activeStored = localStorage.getItem("wiseravenshare_active_avatar");
      if (activeStored) return activeStored;
      const guestStored = localStorage.getItem("wiseravenshare_guest_avatar");
      if (guestStored) return guestStored;
      const saved = localStorage.getItem("wiseravenshare_saved_avatars");
      if (saved) {
        const list = JSON.parse(saved);
        if (Array.isArray(list) && list.length > 0) {
          const active = list.find((a) => a.isActive) || list[0];
          if (active?.url) return active.url;
        }
      }
      return "";
    } catch {
      return "";
    }
  }, [activeAvatar, user?.avatar, user?.avatarUrl, user?.avatar_uri]);

  // Sync avatar on mount, when auth state changes, or when activeAvatar changes
  useEffect(() => {
    const current = resolveCurrentAvatar();
    if (current) {
      setAvatarUrl(current);
    }
  }, [resolveCurrentAvatar, activeAvatar, user]);

  // Load followers and following counts
  const fetchFollowTallies = useCallback(async () => {
    try {
      const tally = await apiClient.follows.tally();
      if (tally) {
        setFollowCounts({
          followers: typeof tally.followersCount === "number" ? tally.followersCount : 14,
          following: typeof tally.followingCount === "number" ? tally.followingCount : 0,
        });
      }
    } catch {
      // Best-effort
    }
  }, []);

  useEffect(() => {
    fetchFollowTallies();
    const interval = setInterval(fetchFollowTallies, 30000);

    const handleFollowsUpdated = (e) => {
      if (e.detail?.followingCount !== undefined || e.detail?.followersCount !== undefined) {
        setFollowCounts((prev) => ({
          followers: e.detail.followersCount !== undefined ? e.detail.followersCount : prev.followers,
          following: e.detail.followingCount !== undefined ? e.detail.followingCount : prev.following,
        }));
      }
    };

    const handleAvatarUpdated = (e) => {
      if (e.detail?.avatarUrl) {
        setAvatarUrl(e.detail.avatarUrl);
      } else {
        setAvatarUrl(resolveCurrentAvatar());
      }
    };

    window.addEventListener("wr_follows_updated", handleFollowsUpdated);
    window.addEventListener("wr_avatar_updated", handleAvatarUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener("wr_follows_updated", handleFollowsUpdated);
      window.removeEventListener("wr_avatar_updated", handleAvatarUpdated);
    };
  }, [fetchFollowTallies, resolveCurrentAvatar]);

  // Direct file trigger
  const handleTriggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file) return;

    await uploadAvatarFile(file);
  };

  const canLoadAvatarUrl = (url) =>
    new Promise((resolve) => {
      if (!url) {
        resolve(false);
        return;
      }
      if (url.startsWith("data:") || url.startsWith("blob:")) {
        resolve(true);
        return;
      }

      const probe = new window.Image();
      probe.onload = () => resolve(true);
      probe.onerror = () => resolve(false);
      probe.src = url;
    });

  const uploadAvatarFile = async (file) => {
    setUploading(true);
    setUploadSuccess(false);

    const previousAvatar = avatarUrl;
    let localPreviewUrl = "";
    try {
      localPreviewUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(typeof e.target?.result === "string" ? e.target.result : "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
      });
      if (localPreviewUrl) {
        setAvatarUrl(localPreviewUrl);
        updateActiveAvatar(localPreviewUrl);
      }
    } catch {}

    try {
      const userId = user?.id || "me";
      const res = await apiClient.users.uploadAvatar(userId, file);
      const newUrl = res?.avatarUrl || res?.avatar || "";

      if (newUrl) {
        const resolved = resolveMediaUrl(newUrl);
        const imageLoads = await canLoadAvatarUrl(resolved);
        const nextAvatar = imageLoads ? resolved : (localPreviewUrl || previousAvatar || "");
        if (nextAvatar) {
          setAvatarUrl(nextAvatar);
          updateActiveAvatar(nextAvatar);
        }

        // Update local saved avatars cache
        try {
          const stored = localStorage.getItem("wiseravenshare_saved_avatars");
          const list = stored ? JSON.parse(stored) : [];
          const updatedList = [
            {
              fileName: res.fileName || file.name,
              url: nextAvatar || resolved,
              createdAt: new Date().toISOString(),
              isActive: true,
            },
            ...list.map((item) => ({ ...item, isActive: false })),
          ];
          localStorage.setItem("wiseravenshare_saved_avatars", JSON.stringify(updatedList.slice(0, 50)));
        } catch {}

        // Emit global event
        window.dispatchEvent(
          new CustomEvent("wr_avatar_updated", {
            detail: { avatarUrl: nextAvatar || resolved, fileName: res?.fileName },
          })
        );
      }

      if (isAuthenticated && typeof checkUserAuth === "function") {
        await checkUserAuth();
      }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3500);
      setShowOptionsModal(false);
      stopCamera();
    } catch (err) {
      console.warn("Avatar upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  // Camera handling
  const startCamera = async () => {
    setCameraError("");
    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 640 }, facingMode: "user" },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError("Camera access was denied or is not available. Please allow camera permissions in your browser.");
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureCameraPhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 640;
      const ctx = canvas.getContext("2d");

      if (mirrored) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `avatar_camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        await uploadAvatarFile(file);
      }, "image/jpeg", 0.92);
    } catch (err) {
      console.warn("Snapshot capture failed:", err);
    }
  };

  return (
    <div className={`flex items-center gap-3 shrink-0 ${className}`}>
      {/* Hidden File Input for Device Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Prominent Logo & Photo Avatar Upload Container */}
      <div className="relative group">
        <button
          type="button"
          onClick={() => setShowOptionsModal(true)}
          className="relative w-12 h-12 md:w-13 md:h-13 rounded-full border-2 border-primary/50 bg-secondary/50 flex items-center justify-center overflow-hidden shadow-md group-hover:border-primary group-hover:scale-105 transition-all duration-300 ring-2 ring-primary/20 hover:ring-primary/40 focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Upload photo avatar"
          title="Top Left Logo Container: Click to Upload Photo Avatar"
        >
          {avatarUrl ? (
            <img
              src={resolveMediaUrl(avatarUrl)}
              alt="Photo Avatar"
              className="w-full h-full object-cover rounded-full"
              onError={() => {
                setAvatarUrl("");
              }}
            />
          ) : brandLogoUrl ? (
            <img
              src={resolveMediaUrl(brandLogoUrl)}
              alt="WiseRavenShare Logo"
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <User className="w-6 h-6 text-primary" />
          )}

          {/* Hover overlay explaining action */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white text-[9px] font-semibold text-center px-1">
            <Camera className="w-4 h-4 mb-0.5 text-primary-foreground animate-bounce" />
            <span>Upload Photo</span>
          </div>

          {/* Uploading Spinner */}
          {uploading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          )}
        </button>

        {/* Camera / Upload Badge at bottom right of circle */}
        <button
          type="button"
          onClick={() => setShowOptionsModal(true)}
          className="absolute -bottom-1 -right-1 w-5 h-5 md:w-5.5 md:h-5.5 rounded-full bg-primary text-primary-foreground flex items-center justify-center border-2 border-background shadow-sm hover:scale-110 transition-transform"
          title="Upload or Change Photo Avatar"
          aria-label="Upload Photo Avatar"
        >
          {uploadSuccess ? (
            <Check className="w-3 h-3 text-white" />
          ) : (
            <Camera className="w-3 h-3 text-white" />
          )}
        </button>
      </div>

      {/* Brand Name & Live Follower/Following Tally Display */}
      <div className="flex flex-col justify-center leading-tight">
        <Link
          to="/"
          className="font-display text-base md:text-lg tracking-[0.2em] text-foreground font-bold hover:text-primary transition-colors flex items-center gap-1.5"
        >
          <span>WRS</span>
          {uploadSuccess && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 font-sans tracking-normal font-semibold animate-pulse">
              Photo Saved!
            </span>
          )}
        </Link>
        <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 font-sans">
          <span className="inline-flex items-center gap-0.5">
            <strong className="text-foreground font-semibold">
              {followCounts.followers.toLocaleString()}
            </strong>{" "}
            followers
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span className="inline-flex items-center gap-0.5">
            <strong className="text-foreground font-semibold">
              {followCounts.following.toLocaleString()}
            </strong>{" "}
            following
          </span>
        </div>
      </div>

      {/* Avatar / Photo Upload Modal Dialog */}
      {showOptionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl text-card-foreground space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-heading text-lg font-bold flex items-center gap-2">
                  <Camera className="w-5 h-5 text-primary" /> Upload Photo Avatar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Update your profile photo avatar across WiseRavenShare.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setShowOptionsModal(false);
                }}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Avatar Preview */}
            <div className="flex items-center gap-4 p-3.5 rounded-xl bg-muted/40 border border-border/60">
              <div className="w-16 h-16 rounded-full border-2 border-primary/40 overflow-hidden shrink-0 bg-background flex items-center justify-center">
                {avatarUrl ? (
                  <img src={resolveMediaUrl(avatarUrl)} alt="Current Avatar" className="w-full h-full object-cover" />
                ) : brandLogoUrl ? (
                  <img src={resolveMediaUrl(brandLogoUrl)} alt="Default Logo" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {user?.displayName || user?.name || "Active Photo Avatar"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {followCounts.followers} followers • {followCounts.following} following
                </p>
                <p className="text-[11px] text-primary flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Live on your feed &amp; top-left container
                </p>
              </div>
            </div>

            {/* Camera View if active */}
            {cameraActive ? (
              <div className="space-y-3">
                <div className="relative w-full aspect-square max-w-[280px] mx-auto rounded-xl overflow-hidden bg-black border border-primary/40 shadow-inner">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => setMirrored((prev) => !prev)}
                      className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
                      title="Flip mirror"
                    >
                      <FlipHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 justify-center">
                  <Button
                    onClick={captureCameraPhoto}
                    disabled={uploading}
                    className="flex items-center gap-2"
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                    Take Photo &amp; Save
                  </Button>
                  <Button variant="outline" onClick={stopCamera}>
                    Cancel Camera
                  </Button>
                </div>
              </div>
            ) : (
              /* Action Buttons */
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  onClick={handleTriggerFileInput}
                  disabled={uploading}
                  className="w-full flex items-center justify-center gap-2 py-5"
                >
                  <Upload className="w-4 h-4" />
                  Choose File from Device
                </Button>

                <Button
                  variant="outline"
                  onClick={startCamera}
                  disabled={cameraLoading || uploading}
                  className="w-full flex items-center justify-center gap-2 py-5 border-primary/30 hover:bg-primary/10"
                >
                  {cameraLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-primary" />
                  )}
                  Take Live Photo
                </Button>
              </div>
            )}

            {cameraError && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                {cameraError}
              </p>
            )}

            {/* Quick Link to Saved Avatars Vault */}
            <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>Saved Photo Avatars Vault</span>
              <div className="flex items-center gap-2">
                <Link
                  to="/dashboard?tab=profile"
                  onClick={() => setShowOptionsModal(false)}
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Profile Vault
                </Link>
                <span>•</span>
                <Link
                  to="/social"
                  onClick={() => setShowOptionsModal(false)}
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  Social Vault
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
