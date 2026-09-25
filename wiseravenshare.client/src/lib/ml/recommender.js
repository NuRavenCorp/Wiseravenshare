import { cosine, dot, normalize, clamp } from './math.js';

const PACING_MAP = { slow: 0, medium: 0.5, fast: 1 };

export class HybridRecommender {
  constructor(index, matrix, ids, als = null, { profileWeight = 0.7, diversityLambda = 0.3 } = {}) {
    this.index   = index;
    this.matrix  = matrix;
    this.ids     = ids;
    this.id2row  = new Map(ids.map((id, i) => [id, i]));
    this.als     = als;
    this.profileWeight   = profileWeight;
    this.diversityLambda = diversityLambda;
  }

  tasteVector(events) {
    const rows = [], weights = [];
    for (const e of events) {
      const row = this.id2row.get(e.contentId);
      if (row === undefined) continue;
      const cr = clamp(e.watchSeconds / Math.max(e.contentDuration, 1));
      const eng = 0.6 * cr + 0.25 * Math.min((e.rewatchCount ?? 0) / 3, 1)
                           + 0.15 * (1 - Math.min((e.skipEvents ?? 0) / 10, 1));
      rows.push(row); weights.push(Math.max(eng, 0.05));
    }
    if (!rows.length) return null;
    const dim = this.matrix[0].length;
    const taste = new Array(dim).fill(0);
    let wTotal = 0;
    rows.forEach((row, i) => {
      const w = weights[i], v = this.matrix[row];
      for (let d = 0; d < dim; d++) taste[d] += v[d] * w;
      wTotal += w;
    });
    for (let d = 0; d < dim; d++) taste[d] /= wTotal;
    return normalize(taste);
  }

  _profileAffinity(item, profile) {
    const pn = PACING_MAP[item.pacing] ?? 0.5;
    const intensity = (item.violence ?? 0) * 0.6 + (1 - (item.humor ?? 0)) * 0.2 + (item.romance ?? 0) * 0.2;
    return (
      (1 - Math.abs(pn - profile.pacingPreference))
    + (1 - Math.abs(item.complexity - profile.complexityTolerance))
    + (1 - Math.abs(intensity - profile.emotionalIntensity))
    ) / 3;
  }

  _mmr(sims, topK) {
    const selected = [];
    const candidates = sims.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    while (candidates.length && selected.length < topK) {
      let best = -1, bestScore = -Infinity;
      for (const idx of candidates) {
        let score;
        if (!selected.length) {
          score = sims[idx];
        } else {
          let maxRed = 0;
          for (const selIdx of selected) {
            const c = cosine(this.matrix[idx], this.matrix[selIdx]);
            if (c > maxRed) maxRed = c;
          }
          score = (1 - this.diversityLambda) * sims[idx] - this.diversityLambda * maxRed;
        }
        if (score > bestScore) { bestScore = score; best = idx; }
      }
      selected.push(best);
      candidates.splice(candidates.indexOf(best), 1);
    }
    return selected;
  }

  _explain(item, profile, cb, cf) {
    const parts = [];
    if (Math.abs(item.complexity - profile.complexityTolerance) < 0.2) parts.push('matches your complexity preference');
    if (item.pacing === 'fast' && profile.pacingPreference > 0.6) parts.push('fast-paced like what you binge');
    if (cf > 0.7) parts.push('viewers with your profile loved it');
    if (profile.rewatchLoyalty > 0.6 && (item.duration ?? 0) < 1800) parts.push('short enough for rewatches');
    if (profile.noveltySeeking > 0.65 && cb > 0.55) parts.push('expands your genre range');
    return parts.length ? parts.join(' • ') : `strong content match (${cb.toFixed(2)})`;
  }

  recommend(userId, events, profile, topK = 20, excludeSeen = true, doExplain = true) {
    const seen = new Set(events.map(e => e.contentId));
    const taste = this.tasteVector(events);
    const cfScores = this.als ? this.als.scoresForUser(userId, this.ids) : new Map();

    const N = this.ids.length;
    const final = new Array(N).fill(0);
    const cbCache = new Array(N).fill(0);

    if (taste) {
      for (let i = 0; i < N; i++) cbCache[i] = dot(this.matrix[i], taste);
    }

    for (let i = 0; i < N; i++) {
      const cid = this.ids[i];
      if (excludeSeen && seen.has(cid)) { final[i] = -1e9; continue; }
      const cb = cbCache[i];
      const pa = this._profileAffinity(this.index.get(cid), profile);
      const cf = cfScores.get(cid) ?? 0.5;
      final[i] = this.profileWeight * (0.6 * cb + 0.4 * pa) + (1 - this.profileWeight) * cf;
    }

    const topIdx = this._mmr(final, topK);
    return topIdx.map(i => {
      const cid = this.ids[i];
      const item = this.index.get(cid);
      return {
        contentId: cid,
        title: item.title,
        score: final[i],
        reason: doExplain ? this._explain(item, profile, cbCache[i], cfScores.get(cid) ?? 0) : '',
      };
    });
  }
}
