/**
 * RETINEO Core — Similarity Service
 * Phase 8: Document-level semantic neighbors via the existing L3/HNSW index.
 */

import type { Hash } from '../domain/types.js';
import type { Registry } from '../storage/registry.js';
import type { RetrievalService } from './retrieval-service.js';
import type { HNSWIndex } from '../embeddings/hnsw-index.js';
import { loadEmbeddingRecords, type IndexedEmbeddingRecord } from '../embeddings/index.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

export interface SimilarOptions {
  topK?: number;          // default 5
  threshold?: number;     // default 0.75
  includeGhosts?: boolean; // default false
  mode?: 'approx' | 'exact'; // default 'approx' — current HNSW behavior; 'exact' forces brute-force cosine for deterministic results
}

export interface SimilarDocument {
  contentHash: Hash;
  sourcePath?: string;    // resolved via Registry (externalId)
  similarity: number;     // aggregated document-level score, 0..1
  matchedChunks: number;  // how many of the query doc's chunks matched
}

export interface SimilarityService {
  findSimilar(contentHash: Hash, options?: SimilarOptions): Promise<SimilarDocument[]>;
}

export interface SimilarityServiceDeps {
  retrievalService: RetrievalService;
  registry: Registry;
  indexDir: string;
  logger?: Logger;
}

interface ChunkToSource {
  rootHash: Hash;
  chunkId?: string;
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

class DefaultSimilarityService implements SimilarityService {
  private retrievalService: RetrievalService;
  private registry: Registry;
  private indexDir: string;
  private logger: Logger;

  constructor(deps: SimilarityServiceDeps) {
    this.retrievalService = deps.retrievalService;
    this.registry = deps.registry;
    this.indexDir = deps.indexDir;
    this.logger = deps.logger ?? getGlobalLogger().child({ layer: 'similarity' });
  }

  async findSimilar(contentHash: Hash, options: SimilarOptions = {}): Promise<SimilarDocument[]> {
    const topK = options.topK ?? 5;
    const threshold = options.threshold ?? 0.75;
    const includeGhosts = options.includeGhosts ?? false;
    const oversample = 3;

    const records = loadEmbeddingRecords(this.indexDir);
    if (records.length === 0) return [];

    const useExact = options.mode === 'exact';
    // Exact mode never needs the HNSW index — building it on small corpora is pure waste.
    if (!useExact) {
      await (this.retrievalService as unknown as { ensureHNSW: () => Promise<void> }).ensureHNSW?.();
    }

    const hnswIndex = useExact ? null : (this.retrievalService as unknown as { hnswIndex: HNSWIndex | null }).hnswIndex;
    const chunkToSource = (this.retrievalService as unknown as { chunkToSource: Map<Hash, ChunkToSource> | undefined }).chunkToSource;
    const recordsByHash = new Map<string, IndexedEmbeddingRecord>();
    for (const rec of records) recordsByHash.set(rec.hash, rec);

    const queryChunks = records.filter((rec) => {
      const info = chunkToSource?.get(rec.hash);
      const rootHash = info?.rootHash ?? rec.rootHash ?? rec.hash;
      return rootHash === contentHash;
    });
    if (queryChunks.length === 0) return [];

    const docScores = new Map<Hash, { scores: number[]; matchedChunks: number }>();

    for (const queryChunk of queryChunks) {
      let hits: Array<{ hash: string; distance: number }>;
      if (!useExact && hnswIndex && hnswIndex.size() > 0) {
        hits = hnswIndex.search(queryChunk.vector, topK * oversample);
      } else {
        hits = this.bruteForceSearch(queryChunk.vector, records, topK * oversample);
      }

      const docsFromThisChunk = new Set<Hash>();
      for (const hit of hits) {
        const similarity = 1 - hit.distance;
        if (similarity < threshold) continue;

        const hitInfo = chunkToSource?.get(hit.hash);
        const hitRootHash = hitInfo?.rootHash ?? recordsByHash.get(hit.hash)?.rootHash ?? hit.hash;
        if (hitRootHash === contentHash) continue;

        let entry = docScores.get(hitRootHash);
        if (!entry) {
          entry = { scores: [], matchedChunks: 0 };
          docScores.set(hitRootHash, entry);
        }
        entry.scores.push(similarity);
        if (!docsFromThisChunk.has(hitRootHash)) {
          entry.matchedChunks += 1;
          docsFromThisChunk.add(hitRootHash);
        }
      }
    }

    const results: SimilarDocument[] = [];
    for (const [hitHash, data] of docScores) {
      const entries = this.registry.listByContentHash(hitHash);
      const active = entries.find((e) => e.status === 'active');
      const isGhost = !active && entries.length > 0;
      if (entries.length > 0 && !active && !includeGhosts) continue;

      data.scores.sort((a, b) => b - a);
      const top3 = data.scores.slice(0, 3);
      const aggregated = data.matchedChunks >= 3
        ? top3.reduce((sum, s) => sum + s, 0) / top3.length
        : top3[0] ?? 0;

      if (aggregated < threshold) continue;

      results.push({
        contentHash: hitHash,
        sourcePath: active?.externalId ?? entries[0]?.externalId ?? hitHash,
        similarity: aggregated,
        matchedChunks: data.matchedChunks,
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private bruteForceSearch(
    query: number[],
    records: IndexedEmbeddingRecord[],
    k: number
  ): Array<{ hash: string; distance: number }> {
    const scored = records.map((rec) => ({
      hash: rec.hash,
      distance: 1 - cosineSimilarity(query, rec.vector),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, k);
  }
}

export function createSimilarityService(deps: SimilarityServiceDeps): SimilarityService {
  return new DefaultSimilarityService(deps);
}
