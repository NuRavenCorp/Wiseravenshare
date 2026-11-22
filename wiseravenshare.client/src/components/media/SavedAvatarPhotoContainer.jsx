import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Camera,
  Upload,
  Image as ImageIcon,
  Check,
  Trash2,
  Share2,
  RefreshCw,
  Sparkles,
  AlertCircle,
  X,
  FlipHorizontal,
  Eye,
  Loader2,
  ShieldCheck,
  User,
} from "lucide-react";

export default function SavedAvatarPhotoContainer({ onAvatarSelected, onAttachToPost, className = "" }) {
  const [avatars, setAvatars] = useState([]);
  const [activeAvatar, setActiveAvatar] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selecting, setSelecting] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [countdown, setCountdown] = useState(0);

  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load active user and saved avatars
  const fetchAvatars = useCallback(async () => {
    try {
      let me = null;
      try {
        me = await apiClient.auth.me();
      } catch {
        // Visitor/unauthenticated mode
      }
      setCurrentUser(me);
      if (me?.avatar) {
        setActiveAvatar(me.avatar);
      }

      // Read locally cached avatars
      let localCached = [];
      try {
        const stored = localStorage.getItem("wiseravenshare_saved_avatars");
        if (stored) {
          localCached = JSON.parse(stored);
        }
      } catch {}

      // Fetch from backend
      const serverList = await apiClient.users.getSavedAvatars(me?.id || "me");
      const normalizedServerList = (Array.isArray(serverList) ? serverList : []).map((item) => ({
        fileName: item.fileName || item.fileName || item.url?.split("/").pop(),
        url: item.url || item.avatarUrl || `/uploads/avatars/${item.fileName}`,
        createdAt: item.createdAt || new Date().toISOString(),
        isActive: Boolean(item.isActive),
      }));

      // Merge and deduplicate by fileName or url
      const seen = new Set();
      const combined = [];

      for (const item of [...normalizedServerList, ...localCached]) {
        const key = item.fileName || item.url;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        combined.push({
          ...item,
          isActive: Boolean(
            item.isActive ||
            (me?.avatar && (me.avatar === item.url || me.avatar.endsWith(item.fileName)))
          ),
        });
      }

      setAvatars(combined);
      try {
        localStorage.setItem("wiseravenshare_saved_avatars", JSON.stringify(combined.slice(0, 50)));
      } catch {}
    } catch (err) {
      console.warn("Could not load saved avatars:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvatars();
    const handleAvatarUpdated = () => fetchAvatars();
    window.addEventListener("wr_avatar_updated", handleAvatarUpdated);
    return () => window.removeEventListener("wr_avatar_updated", handleAvatarUpdated);
  }, [fetchAvatars]);

  // Clean up camera stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError("");
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
    } catch (err) {
      setError("Unable to access camera. Please allow camera permissions in your browser.");
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
    setCountdown(0);
  };

  const takeSnapshot = () => {
    if (!videoRef.current) return;
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          captureFrame();
          return 0;
        }
        return prev - 1;
      });
    }, 800);
  };

  const captureFrame = async () => {
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

      stopCamera();

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" });
        await handleUploadFile(file);
      }, "image/jpeg", 0.92);
    } catch (err) {
      setError("Failed to capture photo from webcam.");
    }
  };

  const handleUploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccessMsg("");

    try {
      const uploadRes = await apiClient.users.uploadAvatar(currentUser?.id || "me", file);
      const avatarUrl = uploadRes?.avatarUrl || uploadRes?.avatar || "";
      if (avatarUrl) {
        const fileName = avatarUrl.split("/").pop();
        const newAvatar = {
          fileName,
          url: avatarUrl,
          createdAt: new Date().toISOString(),
          isActive: true,
        };

        setActiveAvatar(avatarUrl);
        setAvatars((prev) => [
          newAvatar,
          ...prev.map((a) => ({ ...a, isActive: false })).filter((a) => a.url !== avatarUrl),
        ]);

        try {
          const stored = [newAvatar, ...avatars.filter((a) => a.url !== avatarUrl)].slice(0, 50);
          localStorage.setItem("wiseravenshare_saved_avatars", JSON.stringify(stored));
        } catch {}

        setSuccessMsg("Photo uploaded and saved to your avatar vault!");
        setTimeout(() => setSuccessMsg(""), 3500);

        window.dispatchEvent(new CustomEvent("wr_avatar_updated", { detail: { avatarUrl } }));
        onAvatarSelected?.(avatarUrl);
      }
    } catch (err) {
      setError(err?.message || "Failed to upload avatar.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSelectActive = async (avatar) => {
    setSelecting(avatar.url);
    setError("");
    try {
      await apiClient.users.selectAvatar(currentUser?.id || "me", {
        avatarUrl: avatar.url,
        fileName: avatar.fileName,
      });

      setActiveAvatar(avatar.url);
      setAvatars((prev) =>
        prev.map((a) => ({
          ...a,
          isActive: a.url === avatar.url || a.fileName === avatar.fileName,
        }))
      );

      setSuccessMsg("Profile avatar updated!");
      setTimeout(() => setSuccessMsg(""), 3000);

      window.dispatchEvent(new CustomEvent("wr_avatar_updated", { detail: { avatarUrl: avatar.url } }));
      onAvatarSelected?.(avatar.url);
    } catch (err) {
      setError(err?.message || "Could not set avatar.");
    } finally {
      setSelecting(null);
    }
  };

  const handleAttach = (avatar) => {
    window.dispatchEvent(new CustomEvent("wr_attach_media", { detail: { url: avatar.url } }));
    onAttachToPost?.(avatar.url);
    setSuccessMsg("Photo attached to post composer!");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const handleDelete = async (avatar) => {
    try {
      if (avatar.fileName) {
        await apiClient.users.deleteAvatar(currentUser?.id || "me", avatar.fileName).catch(() => {});
      }
      setAvatars((prev) => prev.filter((a) => a.url !== avatar.url && a.fileName !== avatar.fileName));
      try {
        const next = avatars.filter((a) => a.url !== avatar.url && a.fileName !== avatar.fileName);
        localStorage.setItem("wiseravenshare_saved_avatars", JSON.stringify(next));
      } catch {}
    } catch (err) {
      console.warn("Delete avatar error:", err);
    }
  };

  return (
    <Card className={`border border-primary/30 bg-card/90 shadow-md backdrop-blur-sm overflow-hidden ${className}`}>
      <CardHeader className="pb-3 border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {activeAvatar ? (
                <img
                  src={activeAvatar}
                  alt="Current Avatar"
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-primary ring-offset-2 ring-offset-background shadow-inner"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center ring-2 ring-primary/40 ring-offset-2 ring-offset-background">
                  <User className="w-6 h-6 text-primary" />
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-1 ring-background">
                <Check className="h-2.5 w-2.5" />
              </span>
            </div>
            <div>
              <CardTitle className="font-heading text-lg flex items-center gap-2">
                <span>Avatar &amp; Photo Vault</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25 font-sans font-medium">
                  {avatars.length} saved
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Upload, snap webcam photos, and manage your saved avatars for profiles &amp; posts.
              </CardDescription>
            </div>
          </div>

          {/* Action triggers */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleUploadFile(e.target.files?.[0])}
              accept="image/*"
              className="hidden"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={uploading || cameraActive}
              onClick={() => fileInputRef.current?.click()}
              className="text-xs flex items-center gap-1.5 border-primary/30 hover:bg-primary/10"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-primary" />}
              Upload Photo
            </Button>

            <Button
              size="sm"
              variant={cameraActive ? "destructive" : "default"}
              disabled={cameraLoading}
              onClick={cameraActive ? stopCamera : startCamera}
              className="text-xs flex items-center gap-1.5"
            >
              {cameraLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : cameraActive ? (
                <>
                  <X className="w-3.5 h-3.5" /> Close Camera
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5" /> Snap Photo
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Live Camera View */}
        {cameraActive && (
          <div className="relative rounded-xl overflow-hidden border-2 border-primary/40 bg-black flex flex-col items-center justify-center p-2">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`max-h-72 w-full max-w-sm rounded-lg object-cover ${mirrored ? "-scale-x-100" : ""}`}
            />

            {countdown > 0 && (
              <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center">
                <span className="text-6xl font-bold text-white animate-ping">{countdown}</span>
              </div>
            )}

            <div className="flex items-center gap-3 mt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMirrored((m) => !m)}
                className="text-xs flex items-center gap-1 border-border/80"
              >
                <FlipHorizontal className="w-3.5 h-3.5" /> Flip Mirror
              </Button>
              <Button
                size="sm"
                onClick={takeSnapshot}
                disabled={countdown > 0}
                className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
              >
                <Camera className="w-3.5 h-3.5" /> Take Snapshot
              </Button>
            </div>
          </div>
        )}

        {/* Saved Photo Grid */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : avatars.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border/80 hover:border-primary/50 transition-colors rounded-xl p-8 text-center cursor-pointer bg-background/40 hover:bg-primary/5"
          >
            <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium text-foreground">Your photo vault is currently empty</p>
            <p className="text-xs text-muted-foreground mt-1">
              Drag &amp; drop an image, browse your files, or snap a camera snapshot to save your first photo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {avatars.map((avatar, idx) => {
              const isActive =
                avatar.isActive ||
                activeAvatar === avatar.url ||
                (activeAvatar && avatar.fileName && activeAvatar.endsWith(avatar.fileName));

              return (
                <div
                  key={avatar.fileName || avatar.url || idx}
                  className={`group relative rounded-xl border overflow-hidden transition-all bg-card/60 hover:shadow-md ${
                    isActive
                      ? "border-primary ring-2 ring-primary/40 shadow-sm"
                      : "border-border/60 hover:border-primary/40"
                  }`}
                >
                  <div className="aspect-square w-full overflow-hidden bg-muted/40 relative">
                    <img
                      src={avatar.url}
                      alt={avatar.fileName || `Saved Photo ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                    />

                    {isActive && (
                      <span className="absolute top-1.5 right-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary text-primary-foreground shadow-sm">
                        <Check className="w-3 h-3" /> Active
                      </span>
                    )}

                    {/* Quick action overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2 gap-1.5 backdrop-blur-xs">
                      {!isActive && (
                        <button
                          onClick={() => handleSelectActive(avatar)}
                          disabled={selecting === avatar.url}
                          className="w-full py-1 px-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-medium flex items-center justify-center gap-1 shadow-xs"
                        >
                          {selecting === avatar.url ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-3 h-3" /> Set Avatar
                            </>
                          )}
                        </button>
                      )}

                      <button
                        onClick={() => handleAttach(avatar)}
                        className="w-full py-1 px-2 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground text-[11px] font-medium flex items-center justify-center gap-1 shadow-xs"
                        title="Attach this photo to post"
                      >
                        <Share2 className="w-3 h-3" /> Attach to Post
                      </button>

                      <button
                        onClick={() => handleDelete(avatar)}
                        className="w-full py-0.5 px-2 rounded-md text-[10px] text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 flex items-center justify-center gap-1"
                        title="Delete photo"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
