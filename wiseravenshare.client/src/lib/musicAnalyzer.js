// WiseRavenShare Music Analysis Engine
// Analyzes the first 10 bars of a music track to determine its core metrics
// and generate a unique fingerprint stamp. Uses Web Audio API for decoding
// and a custom FFT for spectral analysis. Designed to be as foolproof as possible.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Krumhansl-Schmuckler key profiles (empirically derived tonal hierarchies)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.30, 1.70];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 1.71];

// --- FFT (Cooley-Tukey radix-2, in-place) ---
function fft(real, imag) {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // Butterfly operations
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curWReal = 1;
      let curWImag = 0;
      for (let j = i; j < i + halfLen; j++) {
        const evenR = real[j];
        const evenI = imag[j];
        const oddR = real[j + halfLen] * curWReal - imag[j + halfLen] * curWImag;
        const oddI = real[j + halfLen] * curWImag + imag[j + halfLen] * curWReal;
        real[j] = evenR + oddR;
        imag[j] = evenI + oddI;
        real[j + halfLen] = evenR - oddR;
        imag[j + halfLen] = evenI - oddI;
        const newW = curWReal * wReal - curWImag * wImag;
        curWImag = curWReal * wImag + curWImag * wReal;
        curWReal = newW;
      }
    }
  }
}

function hanningWindow(data) {
  const n = data.length;
  for (let i = 0; i < n; i++) {
    data[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

// --- BPM detection via normalized autocorrelation on energy envelope ---
function detectBPM(data, sampleRate) {
  const windowSize = 1024;
  const envelope = [];
  for (let i = 0; i < data.length - windowSize; i += windowSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += data[i + j] * data[i + j];
    envelope.push(sum / windowSize);
  }

  const envRate = sampleRate / windowSize;
  const minLag = Math.floor((envRate * 60) / 200); // 200 BPM max
  const maxLag = Math.floor((envRate * 60) / 60); // 60 BPM min

  let bestLag = minLag;
  let bestCorr = 0;

  for (let lag = minLag; lag < maxLag; lag++) {
    let corr = 0;
    let norm = 0;
    for (let i = 0; i < envelope.length - lag; i++) {
      corr += envelope[i] * envelope[i + lag];
      norm += envelope[i] * envelope[i];
    }
    corr = norm > 0 ? corr / norm : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  let bpm = (envRate * 60) / bestLag;
  // Octave correction: bring into 80-180 BPM range
  while (bpm < 80) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return { bpm: Math.round(bpm), confidence: bestCorr };
}

function calculateRMS(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

function calculateCrestFactor(data) {
  let peak = 0;
  const rms = calculateRMS(data);
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  return rms > 0 ? peak / rms : 0;
}

// --- Spectral analysis: chroma, band energies, spectral centroid ---
function computeSpectrum(data, sampleRate) {
  const fftSize = 8192;
  const numWindows = Math.max(1, Math.floor(data.length / fftSize));

  const chroma = new Array(12).fill(0);
  let bass = 0, mid = 0, treble = 0;
  let centroidSum = 0, totalMag = 0;

  for (let w = 0; w < numWindows; w++) {
    const start = w * fftSize;
    const real = new Float32Array(fftSize);
    const imag = new Float32Array(fftSize);

    for (let i = 0; i < fftSize && start + i < data.length; i++) {
      real[i] = data[start + i];
    }
    hanningWindow(real);
    fft(real, imag);

    for (let i = 1; i < fftSize / 2; i++) {
      const freq = (i * sampleRate) / fftSize;
      const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);

      centroidSum += freq * mag;
      totalMag += mag;

      if (freq < 250) bass += mag;
      else if (freq < 4000) mid += mag;
      else treble += mag;

      // Map frequency to chroma bin (MIDI note number)
      if (freq > 30 && freq < 5000) {
        const noteNum = 12 * Math.log2(freq / 440) + 69;
        const chromaIndex = ((Math.round(noteNum) % 12) + 12) % 12;
        chroma[chromaIndex] += mag;
      }
    }
  }

  const chromaSum = chroma.reduce((a, b) => a + b, 0);
  const normalizedChroma = chroma.map((c) => (chromaSum > 0 ? c / chromaSum : 0));

  const totalBand = bass + mid + treble;
  const bassE = totalBand > 0 ? bass / totalBand : 0;
  const midE = totalBand > 0 ? mid / totalBand : 0;
  const trebleE = totalBand > 0 ? treble / totalBand : 0;

  const centroid = totalMag > 0 ? centroidSum / totalMag : 0;
  const keyResult = detectKey(normalizedChroma);

  return {
    bass_energy: bassE,
    mid_energy: midE,
    treble_energy: trebleE,
    spectral_centroid: centroid,
    key: keyResult.key,
    key_confidence: keyResult.confidence,
  };
}

function detectKey(chroma) {
  let bestCorr = -Infinity;
  let bestKey = 'C';
  let bestMode = 'major';

  for (let shift = 0; shift < 12; shift++) {
    const majorCorr = pearsonCorr(chroma, MAJOR_PROFILE, shift);
    if (majorCorr > bestCorr) {
      bestCorr = majorCorr;
      bestKey = NOTE_NAMES[shift];
      bestMode = 'major';
    }
    const minorCorr = pearsonCorr(chroma, MINOR_PROFILE, shift);
    if (minorCorr > bestCorr) {
      bestCorr = minorCorr;
      bestKey = NOTE_NAMES[shift];
      bestMode = 'minor';
    }
  }

  return {
    key: `${bestKey} ${bestMode}`,
    confidence: Math.max(0, Math.min(1, (bestCorr + 1) / 2)),
  };
}

function pearsonCorr(chroma, profile, shift) {
  const n = 12;
  let sA = 0, sB = 0, sAB = 0, sA2 = 0, sB2 = 0;
  for (let i = 0; i < n; i++) {
    const a = chroma[i];
    const b = profile[(i + shift) % n];
    sA += a;
    sB += b;
    sAB += a * b;
    sA2 += a * a;
    sB2 += b * b;
  }
  const num = n * sAB - sA * sB;
  const den = Math.sqrt((n * sA2 - sA * sA) * (n * sB2 - sB * sB));
  return den > 0 ? num / den : 0;
}

function generateFingerprint(features) {
  const str = [
    features.bpm,
    features.key,
    features.energy.toFixed(4),
    features.dynamics.toFixed(4),
    features.spectral_centroid.toFixed(2),
    features.bass_energy.toFixed(4),
    features.mid_energy.toFixed(4),
    features.treble_energy.toFixed(4),
  ].join('|');

  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return 'WR-' + Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Analyze the first 10 bars of a music track.
 * @param {ArrayBuffer} arrayBuffer - Raw audio file data
 * @returns {Promise<Object>} Analysis metrics + fingerprint
 */
export async function analyzeMusicTrack(arrayBuffer) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  audioCtx.close();

  const sampleRate = audioBuffer.sampleRate;
  const channelData = audioBuffer.getChannelData(0);

  // 1. Detect BPM
  const bpmResult = detectBPM(channelData, sampleRate);
  const bpm = bpmResult.bpm;

  // 2. Isolate first 10 bars (4/4 time signature)
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;
  const tenBarsDuration = barDuration * 10;
  const tenBarsSamples = Math.floor(tenBarsDuration * sampleRate);
  const segment = channelData.slice(0, Math.min(tenBarsSamples, channelData.length));

  // 3. Energy & dynamics
  const energy = calculateRMS(segment);
  const dynamics = calculateCrestFactor(segment);

  // 4. Spectral features
  const spectral = computeSpectrum(segment, sampleRate);

  // 5. Overall confidence
  const confidence = (bpmResult.confidence + spectral.key_confidence) / 2;

  // 6. Fingerprint
  const features = {
    bpm,
    key: spectral.key,
    energy,
    dynamics,
    spectral_centroid: spectral.spectral_centroid,
    bass_energy: spectral.bass_energy,
    mid_energy: spectral.mid_energy,
    treble_energy: spectral.treble_energy,
  };
  const fingerprint = generateFingerprint(features);

  return {
    ...features,
    fingerprint,
    confidence,
    bars_analyzed: 10,
    duration_seconds: tenBarsDuration,
    sample_rate: sampleRate,
  };
}