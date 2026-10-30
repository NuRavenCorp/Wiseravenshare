import React, { useMemo, useRef, useState } from "react";
import { StreamingTranscriber } from "assemblyai";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Upload, RotateCcw } from "lucide-react";

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
}

function normalizeLanguageCodes(languageCodes = []) {
  return Array.from(new Set(
    (languageCodes || [])
      .map((value) => String(value || "").trim().replace("_", "-").toLowerCase())
      .filter((value) => value.length >= 2 && value.length <= 12)
  )).slice(0, 10);
}

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function isGuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export default function KaraokeTranscriber({
  sessionId,
  songMetadata = null,
  onScored = null,
}) {
  const transcriberRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingMimeRef = useRef("audio/ogg;codecs=opus");
  const pendingTurnWritesRef = useRef(new Set());
  const finalizedTurnsRef = useRef(new Map());
  const failedTurnOrdersRef = useRef(new Set());

  const [status, setStatus] = useState("idle");
  const [liveText, setLiveText] = useState("");
  const [finalLines, setFinalLines] = useState([]);
  const [lyricScore, setLyricScore] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const [retainedRecording, setRetainedRecording] = useState(null);

  const sessionTokenRef = useRef("");
  const performanceIdRef = useRef("");

  const effectiveSessionId = useMemo(
    () => sessionId || `karaoke-${Date.now()}`,
    [sessionId]
  );

  async function startPcmWorklet(stream) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) throw new Error("AudioContext is not available in this browser.");

    const context = new AudioContextCtor({ sampleRate: 16000 });
    await context.audioWorklet.addModule("/worklets/pcm16-worklet.js");

    const sourceNode = context.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(context, "pcm16-writer");
    const sinkNode = context.createGain();
    sinkNode.gain.value = 0;

    workletNode.port.onmessage = ({ data }) => {
      if (!data || !(data instanceof ArrayBuffer)) return;
      transcriberRef.current?.sendAudio(data);
      recordingChunksRef.current.push(new Uint8Array(data));
    };

    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    sinkNode.connect(context.destination);

    audioContextRef.current = context;
    sourceNodeRef.current = sourceNode;
    workletNodeRef.current = workletNode;
    recordingMimeRef.current = "audio/pcm";
  }

  async function startMediaRecorder(stream) {
    const preferredMime = "audio/ogg;codecs=opus";
    const fallbackMime = "audio/webm;codecs=opus";
    const mime = MediaRecorder.isTypeSupported(preferredMime)
      ? preferredMime
      : MediaRecorder.isTypeSupported(fallbackMime)
      ? fallbackMime
      : null;

    if (!window.MediaRecorder || !mime) {
      await startPcmWorklet(stream);
      return;
    }

    recordingMimeRef.current = mime;
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      recordingChunksRef.current.push(event.data);
      event.data.arrayBuffer().then((buffer) => transcriberRef.current?.sendAudio(buffer));
    };
    recorder.start(100);
    recorderRef.current = recorder;
  }

  function waitMs(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function persistFinalizedTurnWithRetry(turnPayload, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await apiClient.karaoke.persistFinalizedTurn(turnPayload);
        failedTurnOrdersRef.current.delete(Number(turnPayload.turnOrder || 0));
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await waitMs(250 * attempt);
        }
      }
    }

    failedTurnOrdersRef.current.add(Number(turnPayload.turnOrder || 0));
    throw lastError || new Error("Failed to persist finalized transcript turn.");
  }

  async function uploadRecording(performanceId, recordingBlob) {
    setUploadStatus("requesting");
    setUploadProgress(0);
    setUploadError(null);

    const ticket = await apiClient.karaoke.requestRecordingUploadTicket(
      performanceId,
      recordingBlob.type || recordingMimeRef.current
    );

    setUploadStatus("uploading");
    await apiClient.karaoke.uploadRecordingBlob(ticket.uploadUrl, recordingBlob, {
      onProgress: (fraction) => setUploadProgress(Math.round(fraction * 100)),
    });

    setUploadStatus("confirming");
    await apiClient.karaoke.confirmRecording(performanceId);

    setUploadStatus("done");
    setUploadProgress(100);
    setRetainedRecording(null);
  }

  async function retryUpload() {
    if (!retainedRecording || !performanceIdRef.current) return;
    setUploadError(null);
    try {
      await uploadRecording(performanceIdRef.current, retainedRecording);
    } catch (err) {
      setUploadError(err.message || "Upload failed.");
      setUploadStatus("error");
    }
  }

  async function start() {
    setStatus("connecting");
    setLiveText("");
    setLyricScore(null);
    setFinalLines([]);
    setUploadProgress(null);
    setUploadStatus(null);
    setUploadError(null);
    setTranscriptionError(null);
    setRetainedRecording(null);
    recordingChunksRef.current = [];
    finalizedTurnsRef.current = new Map();
    failedTurnOrdersRef.current = new Set();

    sessionTokenRef.current = `${effectiveSessionId}-${createUuid()}`;
    performanceIdRef.current = createUuid();

    if (isGuid(String(songMetadata?.trackId || ""))) {
      await apiClient.karaoke.startPerformance(performanceIdRef.current, {
        songId: songMetadata.trackId,
        startedAtUtc: new Date().toISOString(),
      });
    }

    const tokenPayload = {
      trackId: songMetadata?.trackId || null,
      songLanguage: songMetadata?.language || "",
      languageCodes: normalizeLanguageCodes(songMetadata?.languageCodes || []),
      microphoneProfile: songMetadata?.microphoneProfile || "close-vocal",
      abTest: Boolean(songMetadata?.abTest),
    };

    const tokenResponse = await apiClient.karaoke.issueStreamToken(tokenPayload);
    const token = tokenResponse?.token;
    if (!token) throw new Error("Could not start transcription stream.");

    const languageCodes = normalizeLanguageCodes(
      tokenResponse?.languageCodes || tokenPayload.languageCodes || ["en"]
    );
    const voiceFocus = tokenResponse?.voiceFocus || undefined;

    const transcriber = new StreamingTranscriber({
      token,
      speechModel: "universal-3-6-pro",
      encoding: "ogg_opus",
      mode: "max_accuracy",
      languageCodes,
      ...(voiceFocus ? { voiceFocus } : {}),
    });
    transcriberRef.current = transcriber;

    transcriber.on("open", () => setStatus("listening"));
    transcriber.on("close", () => setStatus("idle"));
    transcriber.on("error", (error) => { console.error(error); setStatus("error"); });
    transcriber.on("turn", (turn) => {
      setLiveText(turn?.transcript || "");
      if (!turn?.end_of_turn || !turn?.transcript?.trim()) return;

      setFinalLines((prev) => [...prev, turn.transcript]);
      setLiveText("");

      const turnPayload = {
        sessionId: sessionTokenRef.current,
        turnOrder: Number(turn.turn_order || 0),
        transcript: turn.transcript,
        endOfTurn: true,
        words: (turn.words || []).map((w) => ({
          word: w.word,
          start: Number(w.start || 0),
          end: Number(w.end || 0),
        })),
      };
      finalizedTurnsRef.current.set(turnPayload.turnOrder, turnPayload);

      const pendingWrite = persistFinalizedTurnWithRetry(turnPayload).catch((error) => {
        setTranscriptionError(
          error?.message || "Some transcript turns failed to save. We'll retry before scoring."
        );
      });
      pendingTurnWritesRef.current.add(pendingWrite);
      pendingWrite.finally(() => pendingTurnWritesRef.current.delete(pendingWrite));
    });

    await transcriber.connect();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    streamRef.current = stream;

    if (isSafariBrowser()) {
      await startPcmWorklet(stream);
    } else {
      await startMediaRecorder(stream);
    }
  }

  async function stop() {
    setStatus("stopping");

    recorderRef.current?.stop();
    recorderRef.current = null;

    try {
      if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
      if (workletNodeRef.current) workletNodeRef.current.disconnect();
      sourceNodeRef.current = null;
      workletNodeRef.current = null;
      if (audioContextRef.current) await audioContextRef.current.close();
    } finally {
      audioContextRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    // Close stream first — billing stops here.
    await transcriberRef.current?.close();
    transcriberRef.current = null;
    await Promise.allSettled(Array.from(pendingTurnWritesRef.current));

    if (failedTurnOrdersRef.current.size > 0) {
      for (const turnOrder of Array.from(failedTurnOrdersRef.current).sort((a, b) => a - b)) {
        const payload = finalizedTurnsRef.current.get(turnOrder);
        if (!payload) continue;
        try {
          await persistFinalizedTurnWithRetry(payload, 2);
        } catch (error) {
          setTranscriptionError(
            error?.message || "Some transcript turns could not be saved."
          );
        }
      }
    }

    // Build recording blob from captured chunks.
    const chunks = recordingChunksRef.current;
    recordingChunksRef.current = [];
    const recordingBlob =
      chunks.length > 0
        ? new Blob(chunks, { type: recordingMimeRef.current })
        : null;

    // Score if we have a valid performance.
    let scoreResult = null;
    if (
      performanceIdRef.current &&
      isGuid(String(songMetadata?.trackId || "")) &&
      sessionTokenRef.current &&
      finalLines.length > 0
    ) {
      try {
        scoreResult = await apiClient.karaoke.completePerformance(performanceIdRef.current, {
          sessionId: sessionTokenRef.current,
          songId: songMetadata.trackId,
        });
        if (typeof scoreResult?.score === "number") {
          setLyricScore(scoreResult.score);
          onScored?.(scoreResult);
        }
      } catch (err) {
        console.error("Karaoke scoring failed", err);
      }
    }

    // Upload recording blob after scoring so it doesn't block the score.
    if (recordingBlob && isGuid(performanceIdRef.current)) {
      try {
        await uploadRecording(performanceIdRef.current, recordingBlob);
      } catch (err) {
        console.error("Recording upload failed", err);
        setRetainedRecording(recordingBlob);
        setUploadError(err.message || "Upload failed — you can retry.");
        setUploadStatus("error");
      }
    }

    setStatus("idle");
  }

  const isBusy = status === "connecting" || status === "stopping";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live karaoke transcript</p>

      <div className="flex items-center gap-2 flex-wrap">
        <Button disabled={status !== "idle" || isBusy} onClick={() => void start()}>
          {isBusy && status === "connecting" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          Start singing
        </Button>
        <Button variant="secondary" disabled={status !== "listening" || isBusy} onClick={() => void stop()}>
          {isBusy && status === "stopping" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
          Stop
        </Button>
        {retainedRecording && uploadStatus === "error" && (
          <Button variant="outline" onClick={() => void retryUpload()}>
            <RotateCcw className="w-4 h-4 mr-1" /> Retry upload
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">Status: {status}</p>

      {typeof lyricScore === "number" && (
        <p className="text-sm font-semibold text-foreground">
          Lyric score: {Math.round(lyricScore)}/100
        </p>
      )}

      {transcriptionError && (
        <p className="text-sm text-destructive">{transcriptionError}</p>
      )}

      {uploadStatus && uploadStatus !== "done" && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Upload className="w-3 h-3" />
            <span>
              {uploadStatus === "requesting" && "Preparing upload…"}
              {uploadStatus === "uploading" && `Uploading recording… ${uploadProgress ?? 0}%`}
              {uploadStatus === "confirming" && "Confirming…"}
              {uploadStatus === "error" && (uploadError || "Upload failed.")}
            </span>
          </div>
          {uploadStatus === "uploading" && typeof uploadProgress === "number" && (
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {finalLines.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-1">
          {finalLines.map((line, index) => (
            <p key={`${index}-${line.slice(0, 16)}`} className="text-sm text-foreground whitespace-pre-wrap">
              {line}
            </p>
          ))}
        </div>
      )}

      {liveText && <p className="text-sm text-foreground/80" aria-live="polite">{liveText}</p>}
    </div>
  );
}
