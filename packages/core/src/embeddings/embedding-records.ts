/**
 * RETINEO Core — Cached JSONL Embedding Record Loader
 * Phase 8: Reads embeddings.jsonl once per (path, mtime, size) instead of
 * re-reading and re-parsing the whole file on every retrieval call.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

export interface IndexedEmbeddingRecord {
  hash: string;
  vector: number[];
  parentId?: string;
  rootHash?: string;
  chunkId?: string;
  lineStart?: number;
  lineEnd?: number;
  charStart?: number;
  charEnd?: number;
}

interface CacheEntry {
  mtimeMs: number;
  size: number;
  records: IndexedEmbeddingRecord[];
}

const cache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 32;

/**
 * Load embedding records with mtime/size-based invalidation.
 * Returns a stable reference for the cached snapshot; consumers must not mutate it.
 */
export function loadEmbeddingRecords(indexDir: string): IndexedEmbeddingRecord[] {
  const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
  if (!existsSync(embeddingsPath)) {
    cache.delete(embeddingsPath);
    return [];
  }

  let stat;
  try {
    stat = statSync(embeddingsPath);
  } catch {
    cache.delete(embeddingsPath);
    return [];
  }

  const cached = cache.get(embeddingsPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.records;
  }

  let records: IndexedEmbeddingRecord[] = [];
  try {
    const raw = readFileSync(embeddingsPath, 'utf-8');
    const lines = raw.trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as IndexedEmbeddingRecord);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    records = [];
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value as string;
    cache.delete(firstKey);
  }
  cache.set(embeddingsPath, { mtimeMs: stat.mtimeMs, size: stat.size, records });
  return records;
}

/** Drop the cached snapshot for an index directory (e.g. after embeddings.jsonl is rewritten). */
export function invalidateEmbeddingRecords(indexDir: string): void {
  cache.delete(path.join(indexDir, 'embeddings.jsonl'));
}
