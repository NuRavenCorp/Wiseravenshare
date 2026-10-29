import React, { useMemo, useRef, useState } from "react";
import { StreamingTranscriber } from "assemblyai";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2 } from "lucide-react";

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

export default function KaraokeTranscriber({
  sessionId,
  songMetadata = null,
  referenceLyrics = "",
}) {
  const transcriberRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const workletNodeRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [liveText, setLiveText] = useState("");
  const [finalLines, setFinalLines] = useState([]);

  const effectiveSessionId = useMemo(
    () => sessionId || `karaoke-${Date.now()}`,
    [sessionId]
  );

  async function startPcmWorklet(stream) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("AudioContext is not available in this browser.");
    }

    const context = new AudioContextCtor({ sampleRate: 16000 });
    await context.audioWorklet.addModule("/worklets/pcm16-worklet.js");

    const sourceNode = context.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(context, "pcm16-writer");
    const sinkNode = context.createGain();
    sinkNode.gain.value = 0;

    workletNode.port.onmessage = ({ data }) => {
      if (!data || !(data instanceof ArrayBuffer)) return;
      transcriberRef.current?.sendAudio(data);
    };

    sourceNode.connect(workletNode);
    workletNode.connect(sinkNode);
    sinkNode.connect(context.destination);

    audioContextRef.current = context;
    sourceNodeRef.current = sourceNode;
    workletNodeRef.current = workletNode;
  }

  async function startMediaRecorder(stream) {
    const preferredMime = "audio/ogg;codecs=opus";
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(preferredMime)) {
      await startPcmWorklet(stream);
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
    recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      event.data.arrayBuffer().then((buffer) => transcriberRef.current?.sendAudio(buffer));
    };
    recorder.start(100);
    recorderRef.current = recorder;
  }

  async function start() {
    setStatus("connecting");
    setLiveText("");

    const tokenPayload = {
      trackId: songMetadata?.trackId || null,
      songLanguage: songMetadata?.language || "",
      languageCodes: normalizeLanguageCodes(songMetadata?.languageCodes || []),
      microphoneProfile: songMetadata?.microphoneProfile || "close-vocal",
      abTest: Boolean(songMetadata?.abTest),
    };

    const tokenResponse = await apiClient.karaoke.issueStreamToken(tokenPayload);
    const token = tokenResponse?.token;
    if (!token) {
      throw new Error("Could not start transcription stream.");
    }

    const languageCodes = normalizeLanguageCodes(tokenResponse?.languageCodes || tokenPayload.languageCodes || ["en"]);
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
    transcriber.on("error", (error) => {
      console.error(error);
      setStatus("error");
    });
    transcriber.on("turn", (turn) => {
      setLiveText(turn?.transcript || "");
      if (!turn?.end_of_turn || !turn?.transcript?.trim()) return;

      setFinalLines((prev) => [...prev, turn.transcript]);
      setLiveText("");

      apiClient.karaoke.persistFinalizedTurn({
        sessionId: effectiveSessionId,
        turnOrder: Number(turn.turn_order || 0),
        transcript: turn.transcript,
        endOfTurn: true,
        referenceLyrics: referenceLyrics || "",
        words: (turn.words || []).map((w) => ({
          word: w.word,
          start: Number(w.start || 0),
          end: Number(w.end || 0),
        })),
      }).catch(() => {});
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

    // Streaming is billed while socket is open, so close immediately when done.
    await transcriberRef.current?.close();
    transcriberRef.current = null;
    setStatus("idle");
  }

  const isBusy = status === "connecting" || status === "stopping";

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Live karaoke transcript</p>
      <div className="flex items-center gap-2">
        <Button disabled={status !== "idle" || isBusy} onClick={() => void start()}>
          {isBusy && status === "connecting" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
          Start singing
        </Button>
        <Button variant="secondary" disabled={status !== "listening" || isBusy} onClick={() => void stop()}>
          {isBusy && status === "stopping" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
          Stop
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Status: {status}</p>
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
