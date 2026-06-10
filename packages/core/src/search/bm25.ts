/**
 * RETINEO Core — Okapi BM25
 * Proper BM25 with IDF, document length normalization, k1/b parameters.
 */

export interface OkapiBM25Config {
  k1: number;  // term saturation (default 1.2)
  b: number;   // length normalization (default 0.75)
}

const DEFAULT_CONFIG: OkapiBM25Config = { k1: 1.2, b: 0.75 };

export class OkapiBM25 {
  private docCount = 0;
  private avgDocLength = 0;
  private totalDocLength = 0;
  private docLengths: Map<string, number> = new Map();
  private invertedIndex: Map<string, Map<string, number>> = new Map(); // term → {hash: tf}
  private idfCache: Map<string, number> = new Map();
  private config: OkapiBM25Config;

  constructor(config: Partial<OkapiBM25Config> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addDocument(hash: string, tokens: string[]): void {
    const termFreqs = new Map<string, number>();
    for (const token of tokens) {
      const term = token.toLowerCase();
      termFreqs.set(term, (termFreqs.get(term) ?? 0) + 1);
    }

    const docLength = tokens.length;
    this.docLengths.set(hash, docLength);
    this.totalDocLength += docLength;
    this.docCount++;
    this.avgDocLength = this.totalDocLength / this.docCount;

    // Update inverted index
    for (const [term, tf] of termFreqs) {
      let termDocs = this.invertedIndex.get(term);
      if (!termDocs) {
        termDocs = new Map();
        this.invertedIndex.set(term, termDocs);
      }
      termDocs.set(hash, tf);
    }

    // Invalidate IDF cache
    this.idfCache.clear();
  }

  score(queryTokens: string[], hash: string): number {
    const docLength = this.docLengths.get(hash) ?? 0;
    if (docLength === 0) return 0;

    let score = 0;
    const seen = new Set<string>();

    for (const token of queryTokens) {
      const term = token.toLowerCase();
      if (seen.has(term)) continue;
      seen.add(term);

      const termDocs = this.invertedIndex.get(term);
      if (!termDocs) continue;

      const tf = termDocs.get(hash) ?? 0;
      if (tf === 0) continue;

      const idf = this.computeIDF(term);
      const tfNorm = (tf * (this.config.k1 + 1)) / (tf + this.config.k1 * (1 - this.config.b + this.config.b * (docLength / this.avgDocLength)));
      score += idf * tfNorm;
    }

    return score;
  }

  /** Score all documents, return top-k sorted by score descending. */
  scoreAll(queryTokens: string[], topK: number): Array<{ hash: string; score: number }> {
    const scored: Array<{ hash: string; score: number }> = [];
    const seenHashes = new Set<string>();

    for (const token of queryTokens) {
      const term = token.toLowerCase();
      const termDocs = this.invertedIndex.get(term);
      if (!termDocs) continue;
      for (const hash of termDocs.keys()) {
        seenHashes.add(hash);
      }
    }

    for (const hash of seenHashes) {
      const s = this.score(queryTokens, hash);
      scored.push({ hash, score: s });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  private computeIDF(term: string): number {
    const cached = this.idfCache.get(term);
    if (cached !== undefined) return cached;

    const n = this.invertedIndex.get(term)?.size ?? 0;
    // Okapi IDF: log((N - n + 0.5) / (n + 0.5))
    // Clamp to >= 0: term in all docs has IDF=0 (no discriminative power)
    const idf = Math.max(0, Math.log((this.docCount - n + 0.5) / (n + 0.5)));
    this.idfCache.set(term, idf);
    return idf;
  }

  size(): number {
    return this.docCount;
  }

  getAvgDocLength(): number {
    return this.avgDocLength;
  }
}

/** Tokenize text for BM25. Lowercases, splits on non-alphanumeric, filters short tokens. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u4E00-\u9FFF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
