export const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const norm = (a) => Math.sqrt(dot(a, a));
export const normalize = (a) => { const n = norm(a); return n === 0 ? a.slice() : a.map(x => x / n); };
export const cosine = (a, b) => dot(a, b) / (norm(a) * norm(b) + 1e-9);
export const mean = (arr) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const logistic = (x, k = 4) => 1 / (1 + Math.exp(-k * (x - 0.5)));
export const weightedMean = (values, weights) => {
  let num = 0, den = 0;
  for (let i = 0; i < values.length; i++) { num += values[i] * weights[i]; den += weights[i]; }
  return den === 0 ? 0 : num / den;
};

/** Seeded PRNG (Mulberry32) — deterministic random numbers. */
export function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
