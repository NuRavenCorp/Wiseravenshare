import { normalize, mulberry32 } from './math.js';

/**
 * Zero-dependency TF-IDF + random-projection embedder.
 * Fits in milliseconds, works in browser + Node, no downloads.
 */
export class TfIdfEmbedder {
  constructor(dim = 128) {
    this.dim = dim;
    this.vocab = new Map();
    this.idf = [];
    this.projection = [];
  }

  _tokenize(item) {
    return [
      item.title,
      ...(item.genres ?? []),
      ...(item.tags ?? []),
      ...(item.mood ?? []),
      item.pacing,
      `year_${item.releaseYear ?? 2020}`,
      `lang_${item.language ?? 'en'}`,
    ].join(' ').toLowerCase().split(/\W+/).filter(Boolean);
  }

  fit(items) {
    const df = new Map();
    const docTokens = items.map(item => {
      const tokens = this._tokenize(item);
      new Set(tokens).forEach(t => df.set(t, (df.get(t) ?? 0) + 1));
      return tokens;
    });

    this.vocab.clear();
    let idx = 0;
    for (const t of df.keys()) this.vocab.set(t, idx++);

    const N = items.length;
    this.idf = new Array(this.vocab.size).fill(0);
    for (const [t, d] of df) this.idf[this.vocab.get(t)] = Math.log((N + 1) / (d + 1)) + 1;

    // Deterministic random projection matrix
    const rng = mulberry32(42);
    this.projection = Array.from({ length: this.vocab.size }, () =>
      Array.from({ length: this.dim }, () => rng() * 2 - 1)
    );

    return docTokens;
  }

  embed(item) {
    const tokens = this._tokenize(item);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    const sparse = new Array(this.vocab.size).fill(0);
    for (const [t, cnt] of tf) {
      const id = this.vocab.get(t);
      if (id !== undefined) sparse[id] = (1 + Math.log(cnt)) * this.idf[id];
    }

    const dense = new Array(this.dim).fill(0);
    for (let i = 0; i < sparse.length; i++) {
      if (sparse[i] === 0) continue;
      const row = this.projection[i];
      for (let j = 0; j < this.dim; j++) dense[j] += sparse[i] * row[j];
    }
    return normalize(dense);
  }

  fitTransform(items) {
    this.fit(items);
    return items.map(item => {
      const vec = this.embed(item);
      item.embedding = vec;
      return vec;
    });
  }
}
