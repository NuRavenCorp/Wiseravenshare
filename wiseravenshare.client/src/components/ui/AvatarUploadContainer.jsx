import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  Upload,
  Trash2,
  User,
  RefreshCw,
  Check,
  X,
  FlipHorizontal,
  Link as LinkIcon,
  Loader2,
  Timer,
  ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * AvatarUploadContainer
 *
 * A modern, versatile container for photo uploads and webcam photo capture.
 * Features:
 * - Circular, squircle (rounded), or square container shapes with customizable size
 * - Drag-and-drop image file support with glowing drop-state animation
 * - Clipboard image paste (Ctrl+V) support
 * - Native file picker upload from computer/device
 * - Integrated live camera / webcam photo capture with selfie mirror, camera flip, and 3s countdown timer
 * - Automatic 1:1 center-square cropping to canvas
 * - Optional image URL input fallback
 * - Instant optimistic preview, upload progress spinner, and error handling
 * - Fallback user initials or icon when empty
 */
export default function AvatarUploadContainer({
  value = "",
  onChange,
  onUpload,
  onRemove,
  onSuccess,
  onError,
  name = "",
  userId = "me",
  shape = "circle", // "circle" | "rounded" | "square"
  size = "md", // "sm" | "md" | "lg" | "xl"
  label = "Profile Picture / Avatar",
  sublabel = "Upload a photo from your computer, take one with your camera, or drag & drop an image.",
  allowCamera = true,
  allowUpload = true,
  allowUrl = true,
  allowDelete = true,
  disabled = false,
  showControls = true,
  className,
}) {
  const [avatar, setAvatar] = useState(value || "");
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  // Camera capture state
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState("user"); // "user" or "environment"
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null); // { blob, file, dataUrl }
  const [flashActive, setFlashActive] = useState(false);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const dragCounter = useRef(0);
  const countdownIntervalRef = useRef(null);
  const containerRef = useRef(null);

  // Synchronize internal state with incoming value
  useEffect(() => {
    setAvatar(value || "");
  }, [value]);

  // Compute initials from name or fallback
  const getInitials = (n) => {
    if (!n) return "";
    const parts = n.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Dimensions based on size prop
  const sizeClasses = {
    sm: "w-16 h-16 text-lg",
    md: "w-24 h-24 text-2xl",
    lg: "w-32 h-32 text-3xl",
    xl: "w-40 h-40 text-4xl",
  }[size] || "w-24 h-24 text-2xl";

  const shapeClasses = {
    circle: "rounded-full",
    rounded: "rounded-2xl",
    square: "rounded-md",
  }[shape] || "rounded-full";

  // ── File Upload Handler ──────────────────────────────────────────────
  const processImageFile = async (file) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      const err = "Please choose a valid image file (JPG, PNG, WebP, GIF).";
      onError?.(err);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      const err = "Image size must be 20 MB or less.";
      onError?.(err);
      return;
    }

    // Instant local preview
    const previewUrl = URL.createObjectURL(file);
    setAvatar(previewUrl);
    setUploading(true);

    try {
      let finalUrl = previewUrl;
      if (typeof onUpload === "function") {
        finalUrl = await onUpload(file);
      }
      setAvatar(finalUrl);
      onChange?.(finalUrl, file);
      onSuccess?.("Photo saved successfully.");
    } catch (err) {
      const msg = err?.message || "Failed to upload photo.";
      onError?.(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  // ── Drag & Drop Handlers ─────────────────────────────────────────────
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // ── Clipboard Paste Handler ──────────────────────────────────────────
  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          processImageFile(file);
          break;
        }
      }
    }
  }, []);

  // ── Camera (Photo Taken) Handling ────────────────────────────────────
  const startCamera = async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    setCountdown(null);
    setCameraOpen(true);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Webcam/camera access is not supported on this browser.");
      }

      // Stop existing tracks if any
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1080 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      setCameraError(err?.message || "Could not access camera. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
    setCountdown(null);
    setCapturedPhoto(null);
    setCameraOpen(false);
  };

  // Flip camera device (front/back)
  const toggleFacingMode = () => {
    const nextMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(nextMode);
    // Restart camera with new facing mode
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: nextMode, width: { ideal: 1080 }, height: { ideal: 1080 } },
          audio: false,
        })
        .then((s) => {
          setStream(s);
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => setCameraError(err?.message));
    }
  };

  // Trigger snapshot logic with optional countdown
  const initiateSnap = () => {
    if (timerEnabled) {
      setCountdown(3);
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev === 1) {
            clearInterval(countdownIntervalRef.current);
            takeSnapshot();
            return null;
          }
          return prev ? prev - 1 : null;
        });
      }, 1000);
    } else {
      takeSnapshot();
    }
  };

  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video) return;

    // Visual camera shutter flash
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 200);

    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    const cropSize = Math.min(videoWidth, videoHeight);
    const startX = (videoWidth - cropSize) / 2;
    const startY = (videoHeight - cropSize) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");

    if (isMirrored) {
      ctx.translate(512, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, 512, 512);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
        setCapturedPhoto({ blob, file, dataUrl });
      },
      "image/jpeg",
      0.95
    );
  };

  const acceptCapturedPhoto = () => {
    if (capturedPhoto?.file) {
      processImageFile(capturedPhoto.file);
    }
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  };

  // URL link submission
  const handleApplyUrl = () => {
    const trimmed = (urlDraft || "").trim();
    if (!trimmed) return;
    setAvatar(trimmed);
    onChange?.(trimmed);
    onSuccess?.("Image link applied.");
    setUrlDraft("");
    setShowUrlInput(false);
  };

  // Remove photo handler
  const handleRemove = () => {
    setAvatar("");
    if (typeof onRemove === "function") {
      onRemove();
    } else {
      onChange?.("");
    }
  };

  const initials = getInitials(name);

  return (
    <div
      ref={containerRef}
      onPaste={handlePaste}
      tabIndex={0}
      className={cn("outline-none space-y-3", className)}
    >
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm transition-colors">
        {/* ── Main Avatar / Icon Container ── */}
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={cn(
            "relative group flex items-center justify-center overflow-hidden shrink-0 select-none shadow-sm transition-all duration-200 border-2",
            sizeClasses,
            shapeClasses,
            isDragging
              ? "border-primary ring-4 ring-primary/30 scale-105 bg-primary/10"
              : "border-primary/20 bg-muted hover:border-primary/50",
            disabled && "opacity-60 cursor-not-allowed"
          )}
        >
          {/* Avatar Image or Fallback */}
          {avatar ? (
            <img
              src={avatar}
              alt={name || "Avatar"}
              className="w-full h-full object-cover"
              onError={() => {
                setAvatar("");
              }}
            />
          ) : initials ? (
            <span className="font-heading font-semibold text-primary/80 uppercase tracking-wider">
              {initials}
            </span>
          ) : (
            <User className="w-1/2 h-1/2 text-muted-foreground/60" />
          )}

          {/* Drag Overlay Feedback */}
          {isDragging && (
            <div className="absolute inset-0 bg-primary/25 backdrop-blur-xs flex flex-col items-center justify-center p-2 text-center">
              <Upload className="w-6 h-6 text-primary animate-bounce mb-1" />
              <span className="text-[10px] font-semibold text-primary leading-tight">
                Drop image
              </span>
            </div>
          )}

          {/* Uploading Spinner */}
          {uploading && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-xs flex flex-col items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary mb-1" />
              <span className="text-[10px] font-medium text-muted-foreground">Saving…</span>
            </div>
          )}

          {/* Hover Overlay Menu Trigger */}
          {!uploading && !isDragging && !disabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Change avatar photo"
                  className={cn(
                    "absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity cursor-pointer",
                    shapeClasses
                  )}
                >
                  <Camera className="w-5 h-5 mb-0.5 text-white/90" />
                  <span className="text-[10px] font-medium tracking-wide">Change</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                {allowUpload && (
                  <DropdownMenuItem
                    onClick={() => fileInputRef.current?.click()}
                    className="cursor-pointer"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload from Computer
                  </DropdownMenuItem>
                )}
                {allowCamera && (
                  <DropdownMenuItem onClick={startCamera} className="cursor-pointer">
                    <Camera className="w-4 h-4 mr-2" />
                    Take Photo with Camera
                  </DropdownMenuItem>
                )}
                {allowUrl && (
                  <DropdownMenuItem
                    onClick={() => setShowUrlInput((v) => !v)}
                    className="cursor-pointer"
                  >
                    <LinkIcon className="w-4 h-4 mr-2" />
                    {showUrlInput ? "Hide Link Input" : "Use Web Image Link"}
                  </DropdownMenuItem>
                )}
                {allowDelete && avatar && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleRemove}
                      className="text-destructive focus:text-destructive cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove Photo
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Bottom-right Camera Badge */}
          <div
            className={cn(
              "absolute bottom-0 right-0 p-1 rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-background transition-transform group-hover:scale-110",
              shape === "circle" ? "translate-x-0 translate-y-0" : "translate-x-1 translate-y-1"
            )}
          >
            <Camera className="w-3 h-3" />
          </div>
        </div>

        {/* ── Actions & Sublabel ── */}
        {showControls && (
          <div className="flex-1 space-y-2.5">
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              onChange={handleFileInputChange}
              disabled={disabled || uploading}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-2">
              {allowUpload && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || uploading}
                  className="font-medium"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
                  ) : (
                    <Upload className="w-4 h-4 mr-1.5" />
                  )}
                  Upload Photo
                </Button>
              )}

              {allowCamera && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={startCamera}
                  disabled={disabled || uploading}
                  className="border-primary/30 hover:border-primary/60"
                >
                  <Camera className="w-4 h-4 mr-1.5 text-primary" />
                  Take Photo
                </Button>
              )}

              {allowUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUrlInput((v) => !v)}
                  disabled={disabled || uploading}
                  className="text-xs text-muted-foreground"
                >
                  <LinkIcon className="w-3.5 h-3.5 mr-1" />
                  {showUrlInput ? "Hide Link" : "Link"}
                </Button>
              )}

              {allowDelete && avatar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={disabled || uploading}
                  className="text-destructive hover:bg-destructive/10 text-xs ml-auto sm:ml-0"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Remove
                </Button>
              )}
            </div>

            {sublabel && <p className="text-xs text-muted-foreground">{sublabel}</p>}

            {/* Optional Image URL Input Field */}
            {showUrlInput && (
              <div className="flex items-center gap-2 pt-1 max-w-md animate-in fade-in-50 duration-200">
                <Input
                  type="url"
                  placeholder="https://example.com/avatar.jpg"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyUrl();
                    }
                  }}
                  className="text-xs h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleApplyUrl}
                  className="h-8 text-xs shrink-0"
                >
                  Apply
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Live Camera Capture Modal (Photo Taken) ── */}
      <Dialog open={cameraOpen} onOpenChange={(open) => (!open ? stopCamera() : null)}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-6 overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              Take Profile Photo
            </DialogTitle>
            <DialogDescription>
              Center your face or subject inside the frame and snap your photo.
            </DialogDescription>
          </DialogHeader>

          {cameraError ? (
            <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm space-y-3">
              <p>{cameraError}</p>
              <Button type="button" variant="outline" size="sm" onClick={startCamera}>
                <RefreshCw className="w-4 h-4 mr-1.5" /> Try Again
              </Button>
            </div>
          ) : (
            <div className="space-y-4 my-2 flex flex-col items-center">
              {/* Viewport View (Live Camera or Frozen Captured Preview) */}
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 bg-black rounded-full overflow-hidden border-4 border-primary/30 shadow-inner flex items-center justify-center">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto.dataUrl}
                    alt="Captured preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      "w-full h-full object-cover",
                      isMirrored && "-scale-x-100"
                    )}
                  />
                )}

                {/* Shutter White Flash effect */}
                {flashActive && (
                  <div className="absolute inset-0 bg-white opacity-90 transition-opacity duration-150 pointer-events-none" />
                )}

                {/* Countdown Numbers */}
                {countdown !== null && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
                    <span className="text-7xl font-bold text-white drop-shadow-md animate-pulse">
                      {countdown}
                    </span>
                  </div>
                )}

                {/* Framing crosshair guideline (only while camera is live) */}
                {!capturedPhoto && countdown === null && (
                  <div className="absolute inset-4 rounded-full border border-white/20 pointer-events-none" />
                )}
              </div>

              {/* Camera Adjustment Controls (Only while live) */}
              {!capturedPhoto && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMirrored((m) => !m)}
                    className="h-8 px-2.5 text-xs"
                    title="Mirror camera horizontal"
                  >
                    <FlipHorizontal className="w-4 h-4 mr-1.5" />
                    {isMirrored ? "Mirrored" : "Normal"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleFacingMode}
                    className="h-8 px-2.5 text-xs"
                    title="Switch camera lens"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Flip Cam
                  </Button>

                  <Button
                    type="button"
                    variant={timerEnabled ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setTimerEnabled((t) => !t)}
                    className="h-8 px-2.5 text-xs"
                    title="3 second timer"
                  >
                    <Timer className="w-4 h-4 mr-1.5" />
                    {timerEnabled ? "Timer 3s" : "Instant"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row justify-between sm:justify-between items-center gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>
              <X className="w-4 h-4 mr-1" />
              Cancel
            </Button>

            {capturedPhoto ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={retakePhoto}>
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                  Retake
                </Button>
                <Button type="button" variant="default" size="sm" onClick={acceptCapturedPhoto}>
                  <Check className="w-4 h-4 mr-1.5" />
                  Use Photo
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={initiateSnap}
                disabled={!stream || !!cameraError || countdown !== null}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5"
              >
                <Camera className="w-4 h-4 mr-1.5" />
                Snap Photo
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
