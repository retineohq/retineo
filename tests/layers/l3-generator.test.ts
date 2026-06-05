/**
 * L3 Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultL3Generator, bruteForceSearch } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { L2Artifact } from '../../packages/core/src/domain/types.js';

describe('DefaultL3Generator', () => {
  let tmpDir: string;
  let indexDir: string;
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
  const gen = new DefaultL3Generator();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-l3-'));
    indexDir = path.join(tmpDir, 'index');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const l2: L2Artifact = {
    summary: 'A document about machine learning.',
    concepts: ['neural networks', 'deep learning', 'training'],
    entities: ['OpenAI', 'Google'],
    claims: ['AI is advancing rapidly.'],
    relations: [{ source: 'neural networks', target: 'deep learning', type: 'subset_of' }],
  };

  it('generates embedding and writes jsonl + bm25 + manifest', async () => {
    const result = await gen.generate(l2, provider, 'abc123', indexDir);

    expect(result.vector).toHaveLength(384);
    expect(result.metadata.contentHash).toBe('abc123');
    expect(result.metadata.model).toBe('test');

    const embeddingsPath = path.join(indexDir, 'embeddings.jsonl');
    const bm25Path = path.join(indexDir, 'bm25.json');
    const manifestPath = path.join(indexDir, 'hnsw.manifest.json');

    expect(require('fs').existsSync(embeddingsPath)).toBe(true);
    expect(require('fs').existsSync(bm25Path)).toBe(true);
    expect(require('fs').existsSync(manifestPath)).toBe(true);
  });

  it('increments manifest vectorCount on subsequent calls', async () => {
    await gen.generate(l2, provider, 'hash1', indexDir);
    await gen.generate(l2, provider, 'hash2', indexDir);

    const manifestPath = path.join(indexDir, 'hnsw.manifest.json');
    const manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
    expect(manifest.vectorCount).toBe(2);
  });

  it('bm25 index contains terms from L2', async () => {
    await gen.generate(l2, provider, 'hash1', indexDir);

    const bm25Path = path.join(indexDir, 'bm25.json');
    const bm25 = JSON.parse(require('fs').readFileSync(bm25Path, 'utf-8'));
    expect(Object.keys(bm25).length).toBeGreaterThan(0);
    expect(bm25['learning']).toContain('hash1');
  });
});

describe('bruteForceSearch', () => {
  let tmpDir: string;
  let indexDir: string;
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
  const gen = new DefaultL3Generator();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-l3-'));
    indexDir = path.join(tmpDir, 'index');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const l2a: L2Artifact = {
    summary: 'Document A about cats.',
    concepts: ['cats', 'felines'],
    entities: [],
    claims: [],
    relations: [],
  };

  const l2b: L2Artifact = {
    summary: 'Document B about dogs.',
    concepts: ['dogs', 'canines'],
    entities: [],
    claims: [],
    relations: [],
  };

  it('returns topK results sorted by cosine similarity', async () => {
    await gen.generate(l2a, provider, 'hash-a', indexDir);
    await gen.generate(l2b, provider, 'hash-b', indexDir);

    const queryVec = (await provider.embed(['cats and felines']))[0];
    const results = await bruteForceSearch(indexDir, queryVec, 2);

    expect(results.length).toBeLessThanOrEqual(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1]?.score ?? 0);
  });

  it('returns empty array when no embeddings exist', async () => {
    const results = await bruteForceSearch(indexDir, new Array(384).fill(0), 5);
    expect(results).toEqual([]);
  });
});
