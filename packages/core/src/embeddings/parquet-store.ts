/**
 * RETINEO Core — Parquet Embedding Store
 * Phase 7: Optional Parquet storage with JSONL fallback.
 */

import { writeFile, readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface EmbeddingRecord {
  hash: string;
  vector: number[];
  model: string;
  dimension: number;
}

export interface ParquetEmbeddingStore {
  append(records: EmbeddingRecord[]): Promise<void>;
  readAll(): Promise<EmbeddingRecord[]>;
  readBatch(hashes: string[]): Promise<EmbeddingRecord[]>;
}

/** JSONL fallback store — always works, no native deps */
class JSONLEmbeddingStore implements ParquetEmbeddingStore {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async append(records: EmbeddingRecord[]): Promise<void> {
    const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
    await appendFile(this.filePath, lines, 'utf-8');
  }

  async readAll(): Promise<EmbeddingRecord[]> {
    if (!existsSync(this.filePath)) return [];
    const raw = await readFile(this.filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    const out: EmbeddingRecord[] = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as EmbeddingRecord);
      } catch {
        // skip malformed
      }
    }
    return out;
  }

  async readBatch(hashes: string[]): Promise<EmbeddingRecord[]> {
    const all = await this.readAll();
    const set = new Set(hashes);
    return all.filter((r) => set.has(r.hash));
  }
}

let arrowAvailable = false;
try {
  await import('apache-arrow' as string);
  arrowAvailable = true;
} catch {
  arrowAvailable = false;
}

/** Create store: Parquet if apache-arrow available, else JSONL */
export function createEmbeddingStore(indexDir: string): ParquetEmbeddingStore {
  const jsonlPath = path.join(indexDir, 'embeddings.jsonl');
  // For MVP, always use JSONL. Parquet migration can happen later when apache-arrow is verified.
  // The interface supports future migration without consumer changes.
  return new JSONLEmbeddingStore(jsonlPath);
}

export { JSONLEmbeddingStore };
