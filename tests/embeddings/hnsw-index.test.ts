/**
 * ECHO Core — HNSW Index Tests
 * Phase 7
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHNSWIndex, loadOrBuildHNSW } from '../../packages/core/src/embeddings/hnsw-index.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { writeFile } from 'fs/promises';

describe('BruteForceHNSW (fallback)', () => {
  it('builds and searches', async () => {
    const index = await createHNSWIndex(3);
    index.build([
      { hash: 'a', vector: [1, 0, 0] },
      { hash: 'b', vector: [0, 1, 0] },
      { hash: 'c', vector: [0, 0, 1] },
    ]);
    const results = index.search([1, 0, 0], 2);
    expect(results.length).toBe(2);
    expect(results[0].hash).toBe('a');
    expect(results[0].distance).toBeCloseTo(0, 5);
  });

  it('adds incrementally', async () => {
    const index = await createHNSWIndex(2);
    index.build([{ hash: 'a', vector: [1, 0] }]);
    index.add('b', [0, 1]);
    expect(index.size()).toBe(2);
    const results = index.search([0, 1], 1);
    expect(results[0].hash).toBe('b');
  });

  it('save and load roundtrip', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'echo-hnsw-'));
    const index = await createHNSWIndex(2);
    index.build([{ hash: 'a', vector: [1, 0] }]);
    const filePath = path.join(tmpDir, 'hnsw.bin');
    await index.save(filePath);

    const index2 = await createHNSWIndex(2);
    await index2.load(filePath);
    expect(index2.size()).toBe(1);
    const results = index2.search([1, 0], 1);
    expect(results[0].hash).toBe('a');
    rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('loadOrBuildHNSW', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'echo-hnsw-load-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('builds from embeddings.jsonl when no index exists', async () => {
    await writeFile(
      path.join(tmpDir, 'embeddings.jsonl'),
      JSON.stringify({ hash: 'x', vector: [1, 0] }) + '\n' + JSON.stringify({ hash: 'y', vector: [0, 1] }) + '\n',
      'utf-8'
    );
    const { index, manifest } = await loadOrBuildHNSW(tmpDir, 2, 'test-model');
    expect(index.size()).toBe(2);
    expect(manifest.model).toBe('test-model');
    expect(manifest.dimension).toBe(2);
  });

  it('returns empty index when no embeddings exist', async () => {
    const { index, manifest } = await loadOrBuildHNSW(tmpDir, 2, 'test-model');
    expect(index.size()).toBe(0);
    expect(manifest.dimension).toBe(2);
  });
});
