import { mulberry32, clamp } from './math.js';

/**
 * Pure-JS SGD matrix factorisation (ALS-style).
 * Trains on implicit feedback (confidence = engagement score).
 * Serialises to plain JSON for localStorage persistence.
 */
export class ALSModel {
  constructor({ factors = 32, iterations = 15, reg = 0.05, lr = 0.01 } = {}) {
    this.factors    = factors;
    this.iterations = iterations;
    this.reg        = reg;
    this.lr         = lr;
    this.userIds    = [];
    this.itemIds    = [];
    this.userIndex  = new Map();
    this.itemIndex  = new Map();
    this.userFactors = [];
    this.itemFactors = [];
  }

  fit(events) {
    const agg = new Map();
    for (const e of events) {
      const completion = clamp(e.watchSeconds / Math.max(e.contentDuration, 1));
      const conf =
        0.6 * completion +
        0.25 * Math.min((e.rewatchCount ?? 0) / 3, 1) +
        0.15 * (1 - Math.min((e.skipEvents ?? 0) / 10, 1));
      const key = `${e.userId}|${e.contentId}`;
      const ex = agg.get(key);
      agg.set(key, { user: e.userId, item: e.contentId, conf: (ex?.conf ?? 0) + conf });
    }

    this.userIds = [...new Set([...agg.values()].map(i => i.user))];
    this.itemIds = [...new Set([...agg.values()].map(i => i.item))];
    this.userIndex = new Map(this.userIds.map((u, i) => [u, i]));
    this.itemIndex = new Map(this.itemIds.map((c, i) => [c, i]));

    const rng = mulberry32(7);
    const init = () => Array.from({ length: this.factors }, () => (rng() - 0.5) * 0.1);
    this.userFactors = this.userIds.map(init);
    this.itemFactors = this.itemIds.map(init);

    const ixs = [...agg.values()];
    for (let iter = 0; iter < this.iterations; iter++) {
      // Fisher-Yates shuffle
      for (let i = ixs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [ixs[i], ixs[j]] = [ixs[j], ixs[i]];
      }
      for (const { user, item, conf } of ixs) {
        const u = this.userIndex.get(user);
        const c = this.itemIndex.get(item);
        const uV = this.userFactors[u];
        const cV = this.itemFactors[c];
        let pred = 0;
        for (let k = 0; k < this.factors; k++) pred += uV[k] * cV[k];
        const err = conf - pred;
        for (let k = 0; k < this.factors; k++) {
          const ug = err * cV[k] - this.reg * uV[k];
          const cg = err * uV[k] - this.reg * cV[k];
          uV[k] += this.lr * ug;
          cV[k] += this.lr * cg;
        }
      }
    }
  }

  scoresForUser(userId, candidateIds) {
    const result = new Map();
    if (!this.userIndex.has(userId)) return result;
    const uV = this.userFactors[this.userIndex.get(userId)];
    const targets = candidateIds ?? this.itemIds;
    const raw = [];
    for (const id of targets) {
      const idx = this.itemIndex.get(id);
      if (idx === undefined) continue;
      let s = 0;
      const cV = this.itemFactors[idx];
      for (let k = 0; k < this.factors; k++) s += uV[k] * cV[k];
      raw.push([id, s]);
    }
    if (!raw.length) return result;
    const vals = raw.map(([, s]) => s);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = hi - lo || 1;
    for (const [id, s] of raw) result.set(id, (s - lo) / span);
    return result;
  }

  toJSON() {
    return {
      factors: this.factors,
      userIds: this.userIds, itemIds: this.itemIds,
      userFactors: this.userFactors, itemFactors: this.itemFactors,
    };
  }

  static fromJSON(data) {
    const m = new ALSModel({ factors: data.factors });
    m.userIds = data.userIds; m.itemIds = data.itemIds;
    m.userFactors = data.userFactors; m.itemFactors = data.itemFactors;
    m.userIndex = new Map(m.userIds.map((u, i) => [u, i]));
    m.itemIndex = new Map(m.itemIds.map((c, i) => [c, i]));
    return m;
  }
}
