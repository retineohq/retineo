/**
 * ECHO Core — L3 Generator
 * Phase 3: Embedding indexer.
 * MVP simplification: uses embeddings.jsonl (one JSON per line) instead of parquet.
 * Uses brute-force cosine similarity instead of HNSW (migrate in Phase 4).
 */

import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { L2Artifact, HNSWManifest } from '../domain/types.js';

export interface L3Result {
  vector: number[];
  metadata: L3Metadata;
}

export interface L3Metadata {
  contentHash: string;
  model: string;
  dimension: number;
}

export interface L3Generator {
  generate(l2Artifact: L2Artifact, provider: EmbeddingProvider, contentHash: string, indexDir: string): Promise<L3Result>;
}

export interface L3GeneratorOptions {
  generatorId?: string;
  version?: string;
}

const DEFAULT_OPTIONS: Required<L3GeneratorOptions> = {
  generatorId: 'embedding-indexer',
  version: '1.0.0',
};

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

/** Build embedding text from L2 artifact */
function buildEmbeddingText(l2: L2Artifact): string {
  return [l2.summary, ...l2.concepts].join('\n');
}

/** Build BM25 inverted index terms from L2 artifact */
function buildTerms(l2: L2Artifact): string[] {
  const text = [l2.summary, ...l2.concepts, ...l2.entities, ...l2.claims].join(' ').toLowerCase();
  return text
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export class DefaultL3Generator implements L3Generator {
  private opts: Required<L3GeneratorOptions>;

  constructor(options?: L3GeneratorOptions) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  async generate(
    l2Artifact: L2Artifact,
    provider: EmbeddingProvider,
    contentHash: string,
    indexDir: string
  ): Promise<L3Result> {
    const embedText = buildEmbeddingText(l2Artifact);
    const [vector] = await provider.embed([embedText]);
    const dim = provider.dimension();
    const model = provider.config.model;

    await mkdir(indexDir, { recursive: true });

    // Append to embeddings.jsonl
    const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
    const line = JSON.stringify({ hash: contentHash, vector });
    await writeFile(embeddingsPath, line + '\n', { flag: 'a' });

    // Update BM25 inverted index
    const bm25Path = path.join(indexDir, 'bm25.json');
    let bm25: Record<string, string[]> = {};
    if (existsSync(bm25Path)) {
      try {
        bm25 = JSON.parse(await readFile(bm25Path, 'utf-8'));
      } catch {
        bm25 = {};
      }
    }
    const terms = buildTerms(l2Artifact);
    for (const term of terms) {
      if (!bm25[term]) bm25[term] = [];
      if (!bm25[term].includes(contentHash)) bm25[term].push(contentHash);
    }
    await writeFile(bm25Path, JSON.stringify(bm25, null, 2));

    // Update HNSW manifest (MVP: tracks metadata, index is brute-force from jsonl)
    const manifestPath = path.join(indexDir, 'hnsw.manifest.json');
    let manifest: HNSWManifest = {
      schemaVersion: 1,
      indexVersion: 1,
      embeddingModel: model,
      embeddingProvider: provider.id,
      dimension: dim,
      metric: 'cosine',
      vectorCount: 1,
      createdAt: new Date().toISOString(),
    };

    if (existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(await readFile(manifestPath, 'utf-8')) as HNSWManifest;
        manifest = {
          ...existing,
          indexVersion: existing.indexVersion + 1,
          vectorCount: existing.vectorCount + 1,
          embeddingModel: model,
          embeddingProvider: provider.id,
          dimension: dim,
        };
      } catch {
        // use default
      }
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    return {
      vector,
      metadata: {
        contentHash,
        model,
        dimension: dim,
      },
    };
  }
}

/** Brute-force search over embeddings.jsonl. MVP simplification — replace with HNSW in Phase 4. */
export async function bruteForceSearch(
  indexDir: string,
  queryVector: number[],
  topK: number
): Promise<Array<{ hash: string; score: number }>> {
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (!existsSync(embeddingsPath)) return [];

  const lines = (await readFile(embeddingsPath, 'utf-8')).trim().split('\n');
  const scores: Array<{ hash: string; score: number }> = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as { hash: string; vector: number[] };
      const score = cosineSimilarity(queryVector, record.vector);
      scores.push({ hash: record.hash, score });
    } catch {
      // skip malformed lines
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, topK);
}
