/**
 * Duplicate concepts metric tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { duplicateConcepts } from '../../packages/core/src/health/metrics/duplicate-concepts.js';

let tmpDir: string;
let indexDir: string;

function vec(dim: number, value: number): number[] {
  return new Array(dim).fill(value);
}

function normalized(dim: number, value: number): number[] {
  const v = vec(dim, value);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-dup-'));
  indexDir = path.join(tmpDir, 'index');
  mkdirSync(indexDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('duplicateConcepts', () => {
  it('catches embeddings above 0.94 threshold', async () => {
    const rootA = 'a'.repeat(64);
    const rootB = 'b'.repeat(64);
    const rootC = 'c'.repeat(64);

    const records = [
      { hash: 'chunk-a', vector: normalized(4, 1), parentId: rootA, rootHash: rootA },
      { hash: 'chunk-b', vector: normalized(4, 1.01), parentId: rootB, rootHash: rootB },
      { hash: 'chunk-c', vector: normalized(4, -1), parentId: rootC, rootHash: rootC },
    ];

    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const result = await duplicateConcepts(new Set([rootA, rootB, rootC]), indexDir);
    expect(result.value).toHaveLength(1);
    expect(result.value[0].rootA).toBe(rootA);
    expect(result.value[0].rootB).toBe(rootB);
    expect(result.value[0].similarity).toBeGreaterThanOrEqual(0.94);
  });

  it('returns empty when no embeddings file', async () => {
    const result = await duplicateConcepts(new Set(['a'.repeat(64)]), indexDir);
    expect(result.value).toEqual([]);
    expect(result.details).toEqual([]);
  });
});
