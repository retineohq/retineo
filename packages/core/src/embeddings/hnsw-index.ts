/**
 * ECHO Core — HNSW Vector Index
 * Phase 7: Approximate nearest neighbor search with brute-force fallback.
 */

import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface HNSWIndex {
  build(vectors: Array<{ hash: string; vector: number[] }>): void;
  search(query: number[], k: number): Array<{ hash: string; distance: number }>;
  add(hash: string, vector: number[]): void;
  save(path: string): Promise<void>;
  load(path: string): Promise<void>;
  size(): number;
}

export interface HNSWManifest {
  dimension: number;
  metric: 'cosine' | 'euclidean' | 'ip';
  model: string;
  count: number;
  version: number;
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

  build(vectors: Array<{ hash: string; vector: number[] }>): void {
    this.vectors = vectors.map((v) => ({ hash: v.hash, vector: [...v.vector] }));
  }

  add(hash: string, vector: number[]): void {
    this.vectors.push({ hash, vector: [...vector] });
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
  }

  size(): number {
    return this.vectors.length;
  }
}

let nativeHNSW: { HierarchicalNSW: new (metric: string, dimension: number) => unknown } | null = null;

try {
  const mod = await import('hnswlib-node' as string) as { HierarchicalNSW: new (metric: string, dimension: number) => unknown };
  nativeHNSW = mod;
} catch {
  nativeHNSW = null;
}

/** Try native hnswlib-node, fallback to brute-force */
export async function createHNSWIndex(
  dimension: number,
  metric: 'cosine' | 'euclidean' | 'ip' = 'cosine'
): Promise<HNSWIndex> {
  if (nativeHNSW) {
    try {
      const index = new nativeHNSW.HierarchicalNSW(metric, dimension);
      return new NativeHNSWWrapper(index, metric, dimension);
    } catch {
      // fall through
    }
  }
  return new BruteForceHNSW();
}

class NativeHNSWWrapper implements HNSWIndex {
  private index: unknown;
  private metric: string;
  private dimension: number;
  private maxElements = 100000;
  private curCount = 0;

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
      idx.addPoint(v.vector, this.curCount++);
    }
  }

  add(_hash: string, vector: number[]): void {
    const idx = this.index as {
      resizeIndex: (n: number) => void;
      addPoint: (vec: number[], label: number) => void;
    };
    if (this.curCount >= this.maxElements) {
      this.maxElements *= 2;
      idx.resizeIndex(this.maxElements);
    }
    idx.addPoint(vector, this.curCount++);
  }

  search(query: number[], k: number): Array<{ hash: string; distance: number }> {
    const result = (this.index as { searchKnn: (q: number[], k: number) => { neighbors: number[]; distances: number[] } }).searchKnn(query, k);
    const out: Array<{ hash: string; distance: number }> = [];
    for (let i = 0; i < result.neighbors.length; i++) {
      out.push({ hash: String(result.neighbors[i]), distance: result.distances[i] });
    }
    return out;
  }

  async save(filePath: string): Promise<void> {
    (this.index as { writeIndexSync: (p: string) => void }).writeIndexSync(filePath);
  }

  async load(filePath: string): Promise<void> {
    (this.index as { readIndexSync: (p: string) => void }).readIndexSync(filePath);
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
    dimension,
    metric: 'cosine',
    model,
    count: 0,
    version: 1,
  };

  if (existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(await readFile(manifestPath, 'utf-8')) as HNSWManifest & { embeddingModel?: string };
      manifest = {
        dimension: existing.dimension ?? dimension,
        metric: existing.metric ?? 'cosine',
        model: existing.model ?? existing.embeddingModel ?? model,
        count: existing.count ?? 0,
        version: (existing.version ?? 0) + 1,
      };
    } catch {
      // use default
    }
  }

  const index = await createHNSWIndex(dimension, manifest.metric);

  if (existsSync(hnswPath) && manifest.model === model && manifest.dimension === dimension) {
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
    manifest.count = vectors.length;
  }

  return { index, manifest };
}
