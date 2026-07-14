/**
 * RETINEO Core — HNSW Vector Index
 * Phase 7: Approximate nearest neighbor search with brute-force fallback.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { HNSWManifest } from '../domain/types.js';
import type { Logger } from '../utils/logger.js';
import { getGlobalLogger } from '../utils/logger.js';

const CURRENT_SCHEMA_VERSION = 2;

export interface HNSWIndex {
  build(vectors: Array<{ hash: string; vector: number[] }>): void;
  search(query: number[], k: number): Array<{ hash: string; distance: number }>;
  add(hash: string, vector: number[]): void;
  has(hash: string): boolean;
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
  size(): number;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  return 1 - sim; // distance = 1 - similarity
}

/** Brute-force fallback when native HNSW is unavailable */
class BruteForceHNSW implements HNSWIndex {
  private vectors: Array<{ hash: string; vector: number[] }> = [];
  private hashes: Set<string> = new Set();

  build(vectors: Array<{ hash: string; vector: number[] }>): void {
    this.vectors = vectors.map((v) => ({ hash: v.hash, vector: [...v.vector] }));
    this.hashes = new Set(this.vectors.map((v) => v.hash));
  }

  add(hash: string, vector: number[]): void {
    if (this.hashes.has(hash)) return;
    this.vectors.push({ hash, vector: [...vector] });
    this.hashes.add(hash);
  }

  has(hash: string): boolean {
    return this.hashes.has(hash);
  }

  search(query: number[], k: number): Array<{ hash: string; distance: number }> {
    const scored = this.vectors.map((v) => ({
      hash: v.hash,
      distance: cosineDistance(query, v.vector),
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, k);
  }

  async save(filePath: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const payload = JSON.stringify({ type: 'brute-force', vectors: this.vectors });
    await writeFile(filePath, payload, 'utf-8');
  }

  async load(filePath: string): Promise<void> {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as { type: string; vectors: Array<{ hash: string; vector: number[] }> };
    this.vectors = parsed.vectors ?? [];
    this.hashes = new Set(this.vectors.map((v) => v.hash));
  }

  size(): number {
    return this.vectors.length;
  }
}

let nativeHNSW: { HierarchicalNSW: new (metric: string, dimension: number) => unknown } | null = null;

try {
  const mod = (await import('hnswlib-node' as string)) as {
    default?: { HierarchicalNSW: new (metric: string, dimension: number) => unknown };
    HierarchicalNSW?: new (metric: string, dimension: number) => unknown;
  };
  // hnswlib-node may be exported as CJS default or as a named ESM export
  nativeHNSW = mod.HierarchicalNSW ? (mod as { HierarchicalNSW: new (metric: string, dimension: number) => unknown }) : mod.default ?? null;
} catch {
  nativeHNSW = null;
}

/** Try native hnswlib-node, fallback to brute-force with warning */
export async function createHNSWIndex(
  dimension: number,
  metric: 'cosine' | 'l2' | 'ip' = 'cosine',
  logger?: Logger
): Promise<HNSWIndex> {
  if (nativeHNSW) {
    try {
      const index = new nativeHNSW.HierarchicalNSW(metric, dimension);
      return new NativeHNSWWrapper(index, metric, dimension);
    } catch (error) {
      (logger ?? getGlobalLogger()).warn('HNSW native init failed, using brute-force fallback', { error: String(error) });
    }
  }
  (logger ?? getGlobalLogger()).warn('HNSW native unavailable, using brute-force fallback');
  return new BruteForceHNSW();
}

class NativeHNSWWrapper implements HNSWIndex {
  private index: unknown;
  private metric: string;
  private dimension: number;
  private maxElements = 100000;
  private curCount = 0;
  private labelToHash: Map<number, string> = new Map();
  private hashes: Set<string> = new Set();

  constructor(index: unknown, metric: string, dimension: number) {
    this.index = index;
    this.metric = metric;
    this.dimension = dimension;
    (this.index as { initIndex: (n: number) => void }).initIndex(this.maxElements);
  }

  build(vectors: Array<{ hash: string; vector: number[] }>): void {
    const idx = this.index as {
      resizeIndex: (n: number) => void;
      addPoint: (vec: number[], label: number) => void;
    };
    const needed = Math.max(vectors.length + 1000, this.maxElements);
    if (needed > this.maxElements) {
      this.maxElements = needed;
      idx.resizeIndex(this.maxElements);
    }
    for (const v of vectors) {
      if (this.hashes.has(v.hash)) continue;
      const label = this.curCount++;
      this.labelToHash.set(label, v.hash);
      this.hashes.add(v.hash);
      idx.addPoint(v.vector, label);
    }
  }

  add(hash: string, vector: number[]): void {
    if (this.hashes.has(hash)) return;
    const idx = this.index as {
      resizeIndex: (n: number) => void;
      addPoint: (vec: number[], label: number) => void;
    };
    if (this.curCount >= this.maxElements) {
      this.maxElements *= 2;
      idx.resizeIndex(this.maxElements);
    }
    const label = this.curCount++;
    this.labelToHash.set(label, hash);
    this.hashes.add(hash);
    idx.addPoint(vector, label);
  }

  has(hash: string): boolean {
    return this.hashes.has(hash);
  }

  search(query: number[], k: number): Array<{ hash: string; distance: number }> {
    const result = (this.index as { searchKnn: (q: number[], k: number) => { neighbors: number[]; distances: number[] } }).searchKnn(query, k);
    const out: Array<{ hash: string; distance: number }> = [];
    for (let i = 0; i < result.neighbors.length; i++) {
      const label = result.neighbors[i];
      out.push({ hash: this.labelToHash.get(label) ?? String(label), distance: result.distances[i] });
    }
    return out;
  }

  async save(filePath: string): Promise<void> {
    (this.index as { writeIndexSync: (p: string) => void }).writeIndexSync(filePath);
    // Persist label→hash mapping alongside native index
    const mappingPath = filePath + '.labels.json';
    const mapping: Record<number, string> = {};
    for (const [label, hash] of this.labelToHash) mapping[label] = hash;
    await writeFile(mappingPath, JSON.stringify(mapping), 'utf-8');
  }

  async load(filePath: string): Promise<void> {
    (this.index as { readIndexSync: (p: string) => void }).readIndexSync(filePath);
    // Restore label→hash mapping
    const mappingPath = filePath + '.labels.json';
    try {
      const raw = await readFile(mappingPath, 'utf-8');
      const mapping = JSON.parse(raw) as Record<number, string>;
      this.labelToHash = new Map(Object.entries(mapping).map(([k, v]) => [Number(k), v]));
      this.hashes = new Set(this.labelToHash.values());
      this.curCount = this.labelToHash.size;
    } catch {
      // no mapping saved (legacy or brute-force), use numeric labels
    }
  }

  size(): number {
    return this.curCount;
  }
}

/** Load or build HNSW index from embeddings.jsonl */
export async function loadOrBuildHNSW(
  indexDir: string,
  dimension: number,
  model: string
): Promise<{ index: HNSWIndex; manifest: HNSWManifest }> {
  const manifestPath = path.join(indexDir, 'hnsw.manifest.json');
  const hnswPath = path.join(indexDir, 'hnsw.bin');

  let manifest: HNSWManifest = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    indexVersion: 1,
    embeddingModel: model,
    embeddingProvider: '',
    dimension,
    metric: 'cosine',
    vectorCount: 0,
    createdAt: new Date().toISOString(),
  };

  if (existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(await readFile(manifestPath, 'utf-8')) as HNSWManifest;
      if (existing.schemaVersion < CURRENT_SCHEMA_VERSION) {
        throw new Error(`Data format v${existing.schemaVersion} is incompatible. Run: retineo rebuild`);
      }
      manifest = {
        schemaVersion: existing.schemaVersion,
        indexVersion: existing.indexVersion + 1,
        embeddingModel: existing.embeddingModel ?? model,
        embeddingProvider: existing.embeddingProvider ?? '',
        dimension: existing.dimension ?? dimension,
        metric: existing.metric ?? 'cosine',
        vectorCount: existing.vectorCount ?? 0,
        createdAt: existing.createdAt ?? new Date().toISOString(),
      };
    } catch {
      // use default
    }
  }

  const index = await createHNSWIndex(dimension, manifest.metric);

  if (existsSync(hnswPath) && manifest.embeddingModel === model && manifest.dimension === dimension) {
    try {
      await index.load(hnswPath);
      return { index, manifest };
    } catch {
      // rebuild
    }
  }

  // Build from embeddings.jsonl
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (existsSync(embeddingsPath)) {
    const raw = await readFile(embeddingsPath, 'utf-8');
    const lines = raw.trim().split('\n');
    const vectors: Array<{ hash: string; vector: number[] }> = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as { hash: string; vector: number[] };
        vectors.push(rec);
      } catch {
        // skip malformed
      }
    }
    index.build(vectors);
    manifest.vectorCount = vectors.length;
    try {
      await index.save(hnswPath);
    } catch (error) {
      getGlobalLogger().warn('Failed to persist HNSW index', { error: String(error) });
    }
  }

  return { index, manifest };
}
