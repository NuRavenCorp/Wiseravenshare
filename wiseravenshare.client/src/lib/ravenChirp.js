let audioCtx = null;
let lastChirpAt = 0;

function getAudioContext() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  audioCtx = new Ctx();
  return audioCtx;
}

export function playChirp() {
  try {
    const now = Date.now();
    if (now - lastChirpAt < 350) return;
    lastChirpAt = now;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const start = ctx.currentTime;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.12, start + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    envelope.connect(ctx.destination);

    const chirp1 = ctx.createOscillator();
    chirp1.type = "triangle";
    chirp1.frequency.setValueAtTime(960, start);
    chirp1.frequency.exponentialRampToValueAtTime(1840, start + 0.07);
    chirp1.connect(envelope);
    chirp1.start(start);
    chirp1.stop(start + 0.08);

    const chirp2 = ctx.createOscillator();
    chirp2.type = "triangle";
    chirp2.frequency.setValueAtTime(760, start + 0.1);
    chirp2.frequency.exponentialRampToValueAtTime(1420, start + 0.18);
    chirp2.connect(envelope);
    chirp2.start(start + 0.1);
    chirp2.stop(start + 0.2);
  } catch {
    // noop: alerts should continue even if audio is unavailable
  }
}