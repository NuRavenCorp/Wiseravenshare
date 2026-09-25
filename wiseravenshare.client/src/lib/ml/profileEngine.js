import { weightedMean, clamp, logistic, mean } from './math.js';
import { NEUTRAL_PROFILE } from './types.js';

const HALF_LIFE_DAYS = 30;

export class ProfileEngine {
  /** @param {Map<string, import('./types.js').ContentItem>} contentIndex */
  constructor(contentIndex) {
    this.contentIndex = contentIndex;
  }

  _decay(eventTs, now) {
    return Math.pow(0.5, (now - eventTs) / 86400 / HALF_LIFE_DAYS);
  }

  /** @param {import('./types.js').ViewingEvent[]} events */
  buildProfile(events, now = Date.now() / 1000) {
    if (!events.length) return NEUTRAL_PROFILE();
    const rawW = events.map(e => this._decay(e.timestamp, now));
    const wSum = rawW.reduce((s, w) => s + w, 0);
    const weights = wSum > 0 ? rawW.map(w => w / wSum) : rawW;
    return {
      pacingPreference:     this._pacing(events, weights),
      complexityTolerance:  this._complexity(events, weights),
      emotionalIntensity:   this._intensity(events, weights),
      noveltySeeking:       this._novelty(events),
      bingePropensity:      this._binge(events),
      attentionSpan:        this._attention(events, weights),
      genreBreadth:         this._breadth(events),
      timeOfDayAffinity:    this._tod(events, weights),
      completionDiscipline: this._completion(events, weights),
      rewatchLoyalty:       this._rewatch(events, weights),
    };
  }

  _pacing(events, weights) {
    const pmap = { slow: 0, medium: 0.5, fast: 1 };
    const vals = [], wts = [];
    events.forEach((e, i) => {
      const c = this.contentIndex.get(e.contentId);
      if (c) { vals.push(pmap[c.pacing] ?? 0.5); wts.push(weights[i]); }
    });
    return vals.length ? logistic(weightedMean(vals, wts)) : 0.5;
  }

  _complexity(events, weights) {
    const vals = [], wts = [];
    events.forEach((e, i) => {
      const c = this.contentIndex.get(e.contentId);
      if (c) {
        const cr = clamp(e.watchSeconds / Math.max(e.contentDuration, 1));
        vals.push(c.complexity * (0.5 + 0.5 * cr));
        wts.push(weights[i]);
      }
    });
    return vals.length ? logistic(weightedMean(vals, wts)) : 0.5;
  }

  _intensity(events, weights) {
    const vals = [], wts = [];
    events.forEach((e, i) => {
      const c = this.contentIndex.get(e.contentId);
      if (c) {
        vals.push((c.violence ?? 0) * 0.6 + (1 - (c.humor ?? 0)) * 0.2 + (c.romance ?? 0) * 0.2);
        wts.push(weights[i]);
      }
    });
    return vals.length ? logistic(weightedMean(vals, wts)) : 0.5;
  }

  _novelty(events) {
    const unique = new Set(events.map(e => e.contentId)).size;
    const diversity = events.length ? unique / events.length : 0;
    const gc = new Map(); let total = 0;
    for (const e of events) {
      const c = this.contentIndex.get(e.contentId);
      if (!c) continue;
      for (const g of c.genres) { gc.set(g, (gc.get(g) ?? 0) + 1); total++; }
    }
    if (!total) return 0.5;
    let entropy = 0;
    for (const v of gc.values()) { const p = v / total; entropy -= p * Math.log(p + 1e-9); }
    const ne = entropy / Math.log(Math.max(gc.size, 2));
    return clamp(0.5 * diversity + 0.5 * ne);
  }

  _binge(events) {
    const bySession = new Map();
    for (const e of events) {
      const key = e.sessionId || e.contentId;
      if (!bySession.has(key)) bySession.set(key, []);
      bySession.get(key).push(e.timestamp);
    }
    const scores = [];
    for (const ts of bySession.values()) {
      const s = ts.slice().sort((a, b) => a - b);
      const span = s.length > 1 ? (s[s.length - 1] - s[0]) / 3600 : 1;
      scores.push(clamp(s.length / Math.max(span, 0.25) / 4));
    }
    return scores.length ? mean(scores) : 0.5;
  }

  _attention(events, weights) {
    const vals = events.map(e => clamp(0.5 + 0.15 * (e.rewindEvents ?? 0) - 0.15 * (e.skipEvents ?? 0)));
    return weightedMean(vals, weights);
  }

  _breadth(events) {
    const g = new Set();
    for (const e of events) { const c = this.contentIndex.get(e.contentId); if (c) c.genres.forEach(x => g.add(x)); }
    return clamp(g.size / 10);
  }

  _tod(events, weights) {
    let sinSum = 0, cosSum = 0, wTotal = 0;
    events.forEach((e, i) => {
      const a = ((e.timeOfDay ?? 12) / 24) * 2 * Math.PI;
      sinSum += Math.sin(a) * weights[i];
      cosSum += Math.cos(a) * weights[i];
      wTotal += weights[i];
    });
    if (!wTotal) return 0.5;
    const ma = Math.atan2(sinSum / wTotal, cosSum / wTotal);
    return (((ma / (2 * Math.PI)) % 1) + 1) % 1;
  }

  _completion(events, weights) {
    return weightedMean(events.map(e => clamp(e.watchSeconds / Math.max(e.contentDuration, 1))), weights);
  }

  _rewatch(events, weights) {
    return weightedMean(events.map(e => clamp((e.rewatchCount ?? 0) / 3)), weights);
  }
}
