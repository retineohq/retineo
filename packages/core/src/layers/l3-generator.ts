/**
 * RETINEO Core — L3 Generator
 * Phase 7: Embedding indexer with batch embedding support.
 */

import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { EmbeddingProvider } from '../llm/provider.js';
import type { HNSWManifest } from '../domain/types.js';
import { computeHash } from '../storage/cas.js';
import type { Chunk } from './l1-generator.js';

export interface L3Chunk {
  chunkHash: string;
  parentId: string; // sourcePath of originating L0
  rootHash: string; // contentHash/rootHash of originating L0
  text: string;
  vector: number[];
}

export interface L3Result {
  chunks: L3Chunk[];
  metadata: L3Metadata;
}

export interface L3Metadata {
  contentHash: string;
  model: string;
  dimension: number;
}

export interface L3Input {
  content: string;
  chunks: Chunk[];
  sourcePath: string;
  rootHash?: string;
}

export interface L3Generator {
  generate(input: L3Input, provider: EmbeddingProvider, contentHash: string, indexDir: string): Promise<L3Result>;
}

export interface L3GeneratorOptions {
  generatorId?: string;
  version?: string;
}

export interface BatchEmbeddingConfig {
  batchSize: number;
  maxConcurrency: number;
}

const DEFAULT_OPTIONS: Required<L3GeneratorOptions> = {
  generatorId: 'embedding-indexer',
  version: '1.0.0',
};

const DEFAULT_BATCH_CONFIG: BatchEmbeddingConfig = {
  batchSize: 100,
  maxConcurrency: 2,
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

function sliceChunk(content: string, chunk: Chunk): string {
  const end = chunk.charEnd + 1;
  return content.slice(chunk.charStart, end);
}

/** Build BM25 inverted index terms from raw chunk text */
function buildTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF\u4E00-\u9FFF\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export class DefaultL3Generator implements L3Generator {
  private opts: Required<L3GeneratorOptions>;
  private batchConfig: BatchEmbeddingConfig;

  constructor(options?: L3GeneratorOptions, batchConfig?: Partial<BatchEmbeddingConfig>) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.batchConfig = { ...DEFAULT_BATCH_CONFIG, ...batchConfig };
  }

  async generate(
    input: L3Input,
    provider: EmbeddingProvider,
    contentHash: string,
    indexDir: string
  ): Promise<L3Result> {
    const dim = provider.dimension();
    const model = provider.config.model;

    const chunks = input.chunks.length > 0 ? input.chunks : [{
      id: 'chunk-001',
      lineStart: 0,
      lineEnd: input.content.split('\n').length - 1,
      charStart: 0,
      charEnd: input.content.length - 1,
    }];

    const toEmbed = chunks.map((chunk) => {
      const text = sliceChunk(input.content, chunk);
      return {
        hash: computeHash(text),
        text,
      };
    });

    const embedded = await this.batchEmbed(toEmbed, provider);

    const rootHash = input.rootHash ?? contentHash;
    const l3Chunks: L3Chunk[] = embedded.map((item, idx) => ({
      chunkHash: item.hash,
      parentId: input.sourcePath,
      rootHash,
      text: toEmbed[idx].text,
      vector: item.vector,
    }));

    await mkdir(indexDir, { recursive: true });

    // Update embeddings.jsonl: dedup by chunkHash, append new entries
    const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
    const newLines = l3Chunks.map((c) => JSON.stringify({ hash: c.chunkHash, vector: c.vector, parentId: c.parentId, rootHash: c.rootHash }));
    let existingLines: string[] = [];
    if (existsSync(embeddingsPath)) {
      const existing = await readFile(embeddingsPath, 'utf-8');
      existingLines = existing.trim().split('\n').filter((l) => l.trim());
    }
    const newHashes = new Set(l3Chunks.map((c) => c.chunkHash));
    const filtered = existingLines.filter((l) => {
      try {
        const rec = JSON.parse(l) as { hash: string };
        return !newHashes.has(rec.hash);
      } catch {
        return true;
      }
    });
    filtered.push(...newLines);
    await writeFile(embeddingsPath, filtered.join('\n') + '\n');

    // Update BM25 inverted index from L0 chunk bodies
    const bm25Path = path.join(indexDir, 'bm25.json');
    let bm25Data: { invertedIndex: Record<string, string[]>; docLengths: Record<string, number> } = { invertedIndex: {}, docLengths: {} };
    if (existsSync(bm25Path)) {
      try {
        const raw = JSON.parse(await readFile(bm25Path, 'utf-8'));
        if (raw.invertedIndex) {
          bm25Data = raw;
        } else {
          bm25Data = { invertedIndex: raw, docLengths: {} };
        }
      } catch {
        bm25Data = { invertedIndex: {}, docLengths: {} };
      }
    }
    for (const c of l3Chunks) {
      const terms = buildTerms(c.text);
      for (const term of terms) {
        if (!bm25Data.invertedIndex[term]) bm25Data.invertedIndex[term] = [];
        if (!bm25Data.invertedIndex[term].includes(c.chunkHash)) bm25Data.invertedIndex[term].push(c.chunkHash);
      }
      bm25Data.docLengths[c.chunkHash] = terms.length;
    }
    await writeFile(bm25Path, JSON.stringify(bm25Data, null, 2));

    // Update HNSW manifest
    const manifestPath = path.join(indexDir, 'hnsw.manifest.json');
    let manifest: HNSWManifest = {
      schemaVersion: 1,
      indexVersion: 1,
      embeddingModel: model,
      embeddingProvider: provider.id,
      dimension: dim,
      metric: 'cosine',
      vectorCount: l3Chunks.length,
      createdAt: new Date().toISOString(),
    };

    if (existsSync(manifestPath)) {
      try {
        const existing = JSON.parse(await readFile(manifestPath, 'utf-8')) as HNSWManifest;
        manifest = {
          ...existing,
          indexVersion: existing.indexVersion + 1,
          vectorCount: existing.vectorCount + l3Chunks.length,
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
      chunks: l3Chunks,
      metadata: {
        contentHash,
        model,
        dimension: dim,
      },
    };
  }

  /** Batch embed multiple texts. Groups into batches of batchSize. */
  async batchEmbed(
    items: Array<{ hash: string; text: string }>,
    provider: EmbeddingProvider
  ): Promise<Array<{ hash: string; vector: number[] }>> {
    const results: Array<{ hash: string; vector: number[] }> = [];
    const batchSize = this.batchConfig.batchSize;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const texts = batch.map((b) => b.text);
      const vectors = await provider.embed(texts);
      for (let j = 0; j < batch.length; j++) {
        results.push({ hash: batch[j].hash, vector: vectors[j] });
      }
    }

    return results;
  }
}

/** Brute-force search over embeddings.jsonl. MVP simplification — replace with HNSW in Phase 7. */
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
