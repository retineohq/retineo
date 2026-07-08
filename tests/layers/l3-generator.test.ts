/**
 * L3 Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultL3Generator, bruteForceSearch } from '../../packages/core/src/layers/l3-generator.js';
import { MockLLMProvider } from '../../packages/core/src/llm/providers/mock.js';
import type { L3Input } from '../../packages/core/src/layers/l3-generator.js';

describe('DefaultL3Generator', () => {
  let tmpDir: string;
  let indexDir: string;
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
  const gen = new DefaultL3Generator();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-l3-'));
    indexDir = path.join(tmpDir, 'index');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const input: L3Input = {
    content: 'A document about machine learning. Neural networks and deep learning are used for training.',
    chunks: [{
      id: 'chunk-001',
      lineStart: 0,
      lineEnd: 0,
      charStart: 0,
      charEnd: 95,
    }],
    contentHash: 'abc123',
  };

  it('generates embedding and writes jsonl + bm25 + manifest', async () => {
    const result = await gen.generate(input, provider, indexDir);

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].vector).toHaveLength(384);
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
    await gen.generate({ ...input, contentHash: 'hash1' }, provider, indexDir);
    await gen.generate({ ...input, contentHash: 'hash2' }, provider, indexDir);

    const manifestPath = path.join(indexDir, 'hnsw.manifest.json');
    const manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
    expect(manifest.vectorCount).toBe(2);
  });

  it('bm25 index contains terms from L0 body', async () => {
    await gen.generate({ ...input, contentHash: 'hash1' }, provider, indexDir);

    const bm25Path = path.join(indexDir, 'bm25.json');
    const bm25 = JSON.parse(require('fs').readFileSync(bm25Path, 'utf-8'));
    const invertedIndex = bm25.invertedIndex ?? bm25; // backward compat
    expect(Object.keys(invertedIndex).length).toBeGreaterThan(0);
    expect(invertedIndex['learning']).toBeDefined();
    expect(invertedIndex['learning'].length).toBeGreaterThan(0);
  });

  it('preserves Cyrillic tokens in bm25 index', async () => {
    const ruInput: L3Input = {
      content: 'Документ о кошках. Кошки — это фелины.',
      chunks: [{
        id: 'chunk-001',
        lineStart: 0,
        lineEnd: 0,
        charStart: 0,
        charEnd: 38,
      }],
      contentHash: 'hash3',
    };
    await gen.generate(ruInput, provider, indexDir);

    const bm25Path = path.join(indexDir, 'bm25.json');
    const bm25 = JSON.parse(require('fs').readFileSync(bm25Path, 'utf-8'));
    const invertedIndex = bm25.invertedIndex ?? bm25;
    expect(invertedIndex['кошках']).toBeDefined();
    expect(invertedIndex['кошках'].length).toBeGreaterThan(0);
  });
});

describe('bruteForceSearch', () => {
  let tmpDir: string;
  let indexDir: string;
  const provider = new MockLLMProvider({ id: 'mock', type: 'mock', model: 'test', dimension: 384 });
  const gen = new DefaultL3Generator();

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-l3-'));
    indexDir = path.join(tmpDir, 'index');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const inputA: L3Input = {
    content: 'Document A about cats. Cats are felines.',
    chunks: [{
      id: 'chunk-001',
      lineStart: 0,
      lineEnd: 0,
      charStart: 0,
      charEnd: 40,
    }],
    contentHash: 'hash-a',
  };

  const inputB: L3Input = {
    content: 'Document B about dogs. Dogs are canines.',
    chunks: [{
      id: 'chunk-001',
      lineStart: 0,
      lineEnd: 0,
      charStart: 0,
      charEnd: 40,
    }],
    contentHash: 'hash-b',
  };

  it('returns topK results sorted by cosine similarity', async () => {
    await gen.generate(inputA, provider, indexDir);
    await gen.generate(inputB, provider, indexDir);

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
