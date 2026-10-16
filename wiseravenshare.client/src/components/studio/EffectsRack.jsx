import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";

const TABS = ["EQ", "Reverb", "Delay", "Distortion", "Compressor"];

export default function EffectsRack({ audioRef }) {
  const [activeTab, setActiveTab] = useState("EQ");
  const [enabled, setEnabled] = useState(false);

  // EQ
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);

  // Reverb
  const [reverbWet, setReverbWet] = useState(0.3);

  // Delay
  const [delayTime, setDelayTime] = useState(0.3);
  const [delayFeedback, setDelayFeedback] = useState(0.3);

  // Distortion
  const [distAmount, setDistAmount] = useState(0);

  // Compressor
  const [compThreshold, setCompThreshold] = useState(-24);
  const [compRatio, setCompRatio] = useState(4);
  const [compAttack, setCompAttack] = useState(0.003);
  const [compRelease, setCompRelease] = useState(0.25);

  const ctxRef = useRef(null);
  const nodesRef = useRef(null);

  const makeDistortionCurve = (amount) => {
    const n = 256;
    const curve = new Float32Array(n);
    const k = amount;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = k > 0 ? ((3 + k) * x * 20) / (Math.PI + k * Math.abs(x)) : x;
    }
    return curve;
  };

  const buildImpulse = (ctx, duration = 2, decay = 2) => {
    const rate = ctx.sampleRate;
    const len = rate * duration;
    const impulse = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return impulse;
  };

  const initAudio = () => {
    if (ctxRef.current || !audioRef?.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);

      // EQ
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 250;

      const midFilter = ctx.createBiquadFilter();
      midFilter.type = "peaking";
      midFilter.frequency.value = 1000;
      midFilter.Q.value = 1;

      const trebleFilter = ctx.createBiquadFilter();
      trebleFilter.type = "highshelf";
      trebleFilter.frequency.value = 4000;

      // Reverb
      const convolver = ctx.createConvolver();
      convolver.buffer = buildImpulse(ctx);
      const reverbDry = ctx.createGain();
      const reverbWetGain = ctx.createGain();
      reverbDry.gain.value = 0.7;
      reverbWetGain.gain.value = 0.3;

      // Delay
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.3;
      const feedbackGain = ctx.createGain();
      feedbackGain.gain.value = 0.3;
      delay.connect(feedbackGain);
      feedbackGain.connect(delay);

      // Distortion
      const waveshaper = ctx.createWaveShaper();
      waveshaper.curve = makeDistortionCurve(0);
      waveshaper.oversample = "4x";

      // Compressor
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Chain: source → EQ → distortion → dry/wet reverb merge → delay → compressor → output
      source.connect(bassFilter);
      bassFilter.connect(midFilter);
      midFilter.connect(trebleFilter);
      trebleFilter.connect(waveshaper);

      // Reverb dry/wet
      waveshaper.connect(reverbDry);
      waveshaper.connect(convolver);
      convolver.connect(reverbWetGain);

      const merger = ctx.createGain();
      reverbDry.connect(merger);
      reverbWetGain.connect(merger);

      merger.connect(delay);
      merger.connect(compressor); // also direct path
      delay.connect(compressor);
      compressor.connect(ctx.destination);

      ctxRef.current = ctx;
      nodesRef.current = {
        bassFilter, midFilter, trebleFilter,
        convolver, reverbDry, reverbWetGain,
        delay, feedbackGain,
        waveshaper,
        compressor,
      };
      setEnabled(true);
    } catch (e) {
      console.error("EffectsRack init error:", e);
    }
  };

  const handleBass = (v) => {
    setBass(v);
    if (nodesRef.current) nodesRef.current.bassFilter.gain.value = Number(v);
  };
  const handleMid = (v) => {
    setMid(v);
    if (nodesRef.current) nodesRef.current.midFilter.gain.value = Number(v);
  };
  const handleTreble = (v) => {
    setTreble(v);
    if (nodesRef.current) nodesRef.current.trebleFilter.gain.value = Number(v);
  };
  const handleReverbWet = (v) => {
    setReverbWet(v);
    if (nodesRef.current) {
      nodesRef.current.reverbWetGain.gain.value = Number(v);
      nodesRef.current.reverbDry.gain.value = 1 - Number(v);
    }
  };
  const handleDelayTime = (v) => {
    setDelayTime(v);
    if (nodesRef.current) nodesRef.current.delay.delayTime.value = Number(v);
  };
  const handleDelayFeedback = (v) => {
    setDelayFeedback(v);
    if (nodesRef.current) nodesRef.current.feedbackGain.gain.value = Number(v);
  };
  const handleDistortion = (v) => {
    setDistAmount(v);
    if (nodesRef.current) nodesRef.current.waveshaper.curve = makeDistortionCurve(Number(v));
  };
  const handleCompThreshold = (v) => {
    setCompThreshold(v);
    if (nodesRef.current) nodesRef.current.compressor.threshold.value = Number(v);
  };
  const handleCompRatio = (v) => {
    setCompRatio(v);
    if (nodesRef.current) nodesRef.current.compressor.ratio.value = Number(v);
  };
  const handleCompAttack = (v) => {
    setCompAttack(v);
    if (nodesRef.current) nodesRef.current.compressor.attack.value = Number(v);
  };
  const handleCompRelease = (v) => {
    setCompRelease(v);
    if (nodesRef.current) nodesRef.current.compressor.release.value = Number(v);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">Effects Rack</span>
        <Button size="sm" variant={enabled ? "default" : "outline"} onClick={initAudio}>
          {enabled ? "Active" : "Enable"}
        </Button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === tab
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {activeTab === "EQ" && (
          <>
            <Slider label="Bass" min={-15} max={15} step={1} value={bass} onChange={handleBass} unit="dB" />
            <Slider label="Mid" min={-15} max={15} step={1} value={mid} onChange={handleMid} unit="dB" />
            <Slider label="Treble" min={-15} max={15} step={1} value={treble} onChange={handleTreble} unit="dB" />
          </>
        )}
        {activeTab === "Reverb" && (
          <Slider label="Wet/Dry" min={0} max={1} step={0.01} value={reverbWet} onChange={handleReverbWet} />
        )}
        {activeTab === "Delay" && (
          <>
            <Slider label="Time" min={0} max={1} step={0.01} value={delayTime} onChange={handleDelayTime} unit="s" />
            <Slider label="Feedback" min={0} max={0.9} step={0.01} value={delayFeedback} onChange={handleDelayFeedback} />
          </>
        )}
        {activeTab === "Distortion" && (
          <Slider label="Amount" min={0} max={100} step={1} value={distAmount} onChange={handleDistortion} />
        )}
        {activeTab === "Compressor" && (
          <>
            <Slider label="Threshold" min={-60} max={0} step={1} value={compThreshold} onChange={handleCompThreshold} unit="dB" />
            <Slider label="Ratio" min={1} max={20} step={0.5} value={compRatio} onChange={handleCompRatio} unit=":1" />
            <Slider label="Attack" min={0} max={1} step={0.001} value={compAttack} onChange={handleCompAttack} unit="s" />
            <Slider label="Release" min={0} max={1} step={0.01} value={compRelease} onChange={handleCompRelease} unit="s" />
          </>
        )}
      </div>
    </div>
  );
}

function Slider({ label, min, max, step, value, onChange, unit = "" }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{Number(value).toFixed(step < 0.1 ? 3 : step < 1 ? 2 : 0)}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary"
      />
    </div>
  );
}
