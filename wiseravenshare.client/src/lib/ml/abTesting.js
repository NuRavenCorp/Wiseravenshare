/** FNV-1a 32-bit hash — fast, deterministic, no deps. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class ABRouter {
  constructor() {
    this.experiments  = new Map();
    this.assignments  = new Map();
  }

  register(exp) {
    const sum = exp.trafficSplit.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 1) > 1e-6) throw new Error(`Traffic split must sum to 1, got ${sum}`);
    if (exp.variants.length !== exp.trafficSplit.length) throw new Error('variants / trafficSplit length mismatch');
    this.experiments.set(exp.experimentId, exp);
  }

  getVariant(experimentId, userId) {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return null;
    if (exp.endTs && Date.now() / 1000 > exp.endTs) return null;
    const key = `${experimentId}:${userId}`;
    if (this.assignments.has(key)) return this.assignments.get(key);
    const bucket = fnv1a(`${exp.salt}:${experimentId}:${userId}`) / 0xffffffff;
    let cum = 0;
    for (let i = 0; i < exp.variants.length; i++) {
      cum += exp.trafficSplit[i];
      if (bucket < cum) { this.assignments.set(key, exp.variants[i]); return exp.variants[i]; }
    }
    const last = exp.variants[exp.variants.length - 1];
    this.assignments.set(key, last);
    return last;
  }
}
