/**
 * Duplicate concepts: cosine similarity between L3 embeddings.
 * Threshold 0.94. Groups by contentHash (root hash) like search dedup.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { Hash } from '../../domain/types.js';
import type { MetricResult, MetricDetail } from '../types.js';

interface EmbeddingRecord {
  hash: string;
  vector: number[];
  parentId: string;
  rootHash: string;
}

interface DuplicatePair {
  rootA: Hash;
  rootB: Hash;
  similarity: number;
}

const THRESHOLD = 0.94;

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

function normalizePair(a: Hash, b: Hash): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export async function duplicateConcepts(
  sourceHashes: Set<Hash>,
  indexDir: string
): Promise<MetricResult<DuplicatePair[]>> {
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (!existsSync(embeddingsPath) || sourceHashes.size === 0) {
    return { name: 'duplicateConcepts', value: [], details: [] };
  }

  const raw = await readFile(embeddingsPath, 'utf-8');
  const lines = raw.trim().split('\n');
  const records: EmbeddingRecord[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as EmbeddingRecord;
      if (sourceHashes.has(rec.parentId) || sourceHashes.has(rec.rootHash)) {
        records.push(rec);
      }
    } catch {
      // skip malformed
    }
  }

  const duplicates: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i];
      const b = records[j];
      if (a.rootHash === b.rootHash) continue; // same document, not a duplicate

      const sim = cosineSimilarity(a.vector, b.vector);
      if (sim >= THRESHOLD) {
        const key = normalizePair(a.rootHash, b.rootHash);
        if (!seen.has(key)) {
          seen.add(key);
          duplicates.push({ rootA: a.rootHash, rootB: b.rootHash, similarity: Number(sim.toFixed(4)) });
        }
      }
    }
  }

  const details: MetricDetail[] = duplicates.map((d) => ({
    hash: d.rootA,
    reason: `similar to ${d.rootB} (score ${d.similarity})`,
    value: d.similarity,
  }));

  return { name: 'duplicateConcepts', value: duplicates, details };
}
