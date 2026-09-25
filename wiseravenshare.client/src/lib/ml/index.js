import { ProfileEngine }     from './profileEngine.js';
import { HybridRecommender } from './recommender.js';
import { ALSModel }          from './collaborative.js';
import { TfIdfEmbedder }     from './embedder.js';
import { ABRouter }          from './abTesting.js';
import { NEUTRAL_PROFILE }   from './types.js';

const ALS_STORAGE_KEY = 'wrs_ml_als_model';

export {
  ProfileEngine, HybridRecommender, ALSModel,
  TfIdfEmbedder, ABRouter, NEUTRAL_PROFILE,
};
export * from './types.js';

/**
 * Single-entry-point recommendation engine.
 * Runs entirely in-browser — no Python, no server round-trip.
 */
export class RecommendationEngine {
  constructor({
    profileWeight   = 0.70,
    diversityLambda = 0.30,
    alsFactors      = 32,
    alsIterations   = 15,
    abExperiments   = [],
    persistALS      = false,       // persist ALS model to localStorage
  } = {}) {
    this._profileWeight   = profileWeight;
    this._diversityLambda = diversityLambda;
    this._persistALS      = persistALS;

    this._content   = new Map();
    this._matrix    = [];
    this._ids       = [];
    this._embedder  = new TfIdfEmbedder(128);
    this._profiler  = new ProfileEngine(this._content);
    this._als       = new ALSModel({ factors: alsFactors, iterations: alsIterations });
    this._rec       = this._makeRec();
    this._ab        = new ABRouter();

    // Restore persisted ALS model if available
    if (persistALS) {
      try {
        const saved = localStorage.getItem(ALS_STORAGE_KEY);
        if (saved) this._als = ALSModel.fromJSON(JSON.parse(saved));
      } catch { /* ignore */ }
    }

    for (const exp of abExperiments) this._ab.register(exp);
  }

  _makeRec() {
    return new HybridRecommender(
      this._content, this._matrix, this._ids, this._als,
      { profileWeight: this._profileWeight, diversityLambda: this._diversityLambda }
    );
  }

  /** Load catalog. Must be called before recommend(). */
  loadCatalog(items) {
    this._content.clear();
    this._ids = [];
    for (const item of items) { this._content.set(item.contentId, item); this._ids.push(item.contentId); }
    this._matrix = this._embedder.fitTransform(items);
    this._profiler = new ProfileEngine(this._content);
    this._rec = this._makeRec();
  }

  /** Train ALS from viewing events. Fast enough to run synchronously for <5k events. */
  trainALS(events) {
    this._als.fit(events);
    if (this._persistALS) {
      try { localStorage.setItem(ALS_STORAGE_KEY, JSON.stringify(this._als.toJSON())); } catch { /* quota */ }
    }
    this._rec = this._makeRec();
  }

  /** Build the 10-point behavioral profile. */
  buildProfile(events) {
    return this._profiler.buildProfile(events);
  }

  /**
   * Main recommend call.
   * @param {string}                              userId
   * @param {import('./types.js').ViewingEvent[]} events
   * @param {{ topK?, excludeSeen?, explain?, experimentId? }} opts
   */
  recommend(userId, events, {
    topK = 20, excludeSeen = true, explain = true, experimentId,
  } = {}) {
    const profile = this._profiler.buildProfile(events);
    let variant;

    if (experimentId) {
      variant = this._ab.getVariant(experimentId, userId) ?? undefined;
      // Mutate weights temporarily per variant
      if (variant === 'diverse')       this._rec.diversityLambda = 0.6;
      else if (variant === 'als')      this._rec.profileWeight   = 0.5;
      else                             { this._rec.diversityLambda = 0.3; this._rec.profileWeight = 0.7; }
    }

    const recommendations = this._rec.recommend(userId, events, profile, topK, excludeSeen, explain);
    return { profile, recommendations, variant, experimentId };
  }
}
