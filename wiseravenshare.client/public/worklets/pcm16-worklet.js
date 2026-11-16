// Buffer audio frames before sending to AssemblyAI.
// The WebAudio pipeline delivers 128-sample frames (~8 ms at 16 kHz), which is
// below AssemblyAI's 20 ms minimum.  We accumulate until we have TARGET_SAMPLES
// (100 ms) then post the whole chunk at once.
const TARGET_SAMPLES = 1600; // 100 ms @ 16 000 Hz

class Pcm16WriterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(TARGET_SAMPLES);
    this._len = 0;
  }

  process(inputs) {
    const input = inputs?.[0]?.[0];
    if (!input || input.length === 0) return true;

    let srcOffset = 0;
    while (srcOffset < input.length) {
      const space   = TARGET_SAMPLES - this._len;
      const toCopy  = Math.min(space, input.length - srcOffset);
      this._buf.set(input.subarray(srcOffset, srcOffset + toCopy), this._len);
      this._len    += toCopy;
      srcOffset    += toCopy;

      if (this._len >= TARGET_SAMPLES) {
        const pcm16 = new Int16Array(TARGET_SAMPLES);
        for (let i = 0; i < TARGET_SAMPLES; i++) {
          const s = Math.max(-1, Math.min(1, this._buf[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
        this._len = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm16-writer", Pcm16WriterProcessor);
