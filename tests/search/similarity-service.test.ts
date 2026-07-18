/**
 * Similarity Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { createSimilarityService } from '../../packages/core/src/search/similarity-service.js';
import { loadOrBuildHNSW } from '../../packages/core/src/embeddings/hnsw-index.js';
import type { Hash } from '../../packages/core/src/domain/types.js';
import type { Registry, RegistryEntry } from '../../packages/core/src/storage/registry.js';

function makeRegistry(entriesByHash: Record<Hash, RegistryEntry[]>): Registry {
  return {
    listByContentHash: (hash: Hash) => entriesByHash[hash] ?? [],
  } as unknown as Registry;
}

function record(hash: string, vector: number[], rootHash: string) {
  return JSON.stringify({ hash, vector, parentId: rootHash, rootHash, chunkId: hash });
}

async function makeService(
  indexDir: string,
  entriesByHash: Record<Hash, RegistryEntry[]>,
  dim = 2
) {
  const { index } = await loadOrBuildHNSW(indexDir, dim, 'test-model');

  const chunkToSource = new Map<Hash, { rootHash: Hash }>();
  const raw = writeFileSync; // unused hint
  void raw;

  const retrievalService = {
    async ensureHNSW() {},
    hnswIndex: index,
    chunkToSource,
  } as unknown as import('../../packages/core/src/search/retrieval-service.js').RetrievalService;

  const service = createSimilarityService({
    retrievalService,
    registry: makeRegistry(entriesByHash),
    indexDir,
  });
  return { service, chunkToSource };
}

describe('DefaultSimilarityService', () => {
  let tmpDir: string;
  let indexDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-similarity-'));
    indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns neighbors excluding the query document itself', async () => {
    const lines = [
      record('a1', [1, 0], 'doc-a'),
      record('a2', [0, 1], 'doc-a'),
      record('b1', [0.99, 0.01], 'doc-b'),
      record('b2', [0.01, 0.99], 'doc-b'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {
      'doc-a': [{ sourceId: 'filesystem', externalId: '/docs/a.md', contentHash: 'doc-a', status: 'active' } as RegistryEntry],
      'doc-b': [{ sourceId: 'filesystem', externalId: '/docs/b.md', contentHash: 'doc-b', status: 'active' } as RegistryEntry],
    });
    chunkToSource.set('a1', { rootHash: 'doc-a' });
    chunkToSource.set('a2', { rootHash: 'doc-a' });
    chunkToSource.set('b1', { rootHash: 'doc-b' });
    chunkToSource.set('b2', { rootHash: 'doc-b' });

    const results = await service.findSimilar('doc-a', { topK: 5, threshold: 0.5 });
    expect(results.length).toBe(1);
    expect(results[0].contentHash).toBe('doc-b');
    expect(results[0].matchedChunks).toBe(2);
    expect(results[0].similarity).toBeGreaterThan(0.95);
  });

  it('returns [] for an unknown hash', async () => {
    const lines = [record('a1', [1, 0], 'doc-a')];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {});
    chunkToSource.set('a1', { rootHash: 'doc-a' });

    const results = await service.findSimilar('unknown', { topK: 5, threshold: 0.5 });
    expect(results).toEqual([]);
  });

  it('filters by similarity threshold', async () => {
    const lines = [
      record('a1', [1, 0], 'doc-a'),
      record('b1', [0.6, 0.8], 'doc-b'),
      record('c1', [0.99, 0.01], 'doc-c'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {
      'doc-b': [{ sourceId: 'filesystem', externalId: '/docs/b.md', contentHash: 'doc-b', status: 'active' } as RegistryEntry],
      'doc-c': [{ sourceId: 'filesystem', externalId: '/docs/c.md', contentHash: 'doc-c', status: 'active' } as RegistryEntry],
    });
    chunkToSource.set('a1', { rootHash: 'doc-a' });
    chunkToSource.set('b1', { rootHash: 'doc-b' });
    chunkToSource.set('c1', { rootHash: 'doc-c' });

    const results = await service.findSimilar('doc-a', { topK: 5, threshold: 0.95 });
    expect(results.length).toBe(1);
    expect(results[0].contentHash).toBe('doc-c');
  });

  it('cuts results to topK', async () => {
    const lines = [
      record('a1', [1, 0], 'doc-a'),
      record('b1', [0.99, 0.01], 'doc-b'),
      record('c1', [0.8, 0.6], 'doc-c'),
      record('d1', [0.5, 0.5], 'doc-d'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {
      'doc-b': [{ sourceId: 'filesystem', externalId: '/docs/b.md', contentHash: 'doc-b', status: 'active' } as RegistryEntry],
      'doc-c': [{ sourceId: 'filesystem', externalId: '/docs/c.md', contentHash: 'doc-c', status: 'active' } as RegistryEntry],
      'doc-d': [{ sourceId: 'filesystem', externalId: '/docs/d.md', contentHash: 'doc-d', status: 'active' } as RegistryEntry],
    });
    chunkToSource.set('a1', { rootHash: 'doc-a' });
    chunkToSource.set('b1', { rootHash: 'doc-b' });
    chunkToSource.set('c1', { rootHash: 'doc-c' });
    chunkToSource.set('d1', { rootHash: 'doc-d' });

    const results = await service.findSimilar('doc-a', { topK: 2, threshold: 0.5 });
    expect(results.length).toBe(2);
    expect(results[0].contentHash).toBe('doc-b');
  });

  it('filters ghosts unless includeGhosts is true', async () => {
    const lines = [
      record('a1', [1, 0], 'doc-a'),
      record('b1', [0.99, 0.01], 'doc-b'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {
      'doc-b': [{ sourceId: 'filesystem', externalId: '/docs/b.md', contentHash: 'doc-b', status: 'ghost' } as RegistryEntry],
    });
    chunkToSource.set('a1', { rootHash: 'doc-a' });
    chunkToSource.set('b1', { rootHash: 'doc-b' });

    const activeOnly = await service.findSimilar('doc-a', { topK: 5, threshold: 0.5 });
    expect(activeOnly).toEqual([]);

    const withGhosts = await service.findSimilar('doc-a', { topK: 5, threshold: 0.5, includeGhosts: true });
    expect(withGhosts.length).toBe(1);
    expect(withGhosts[0].contentHash).toBe('doc-b');
  });

  it('aggregates document scores using mean of top-3 chunk similarities', async () => {
    const lines = [
      record('q1', [1, 0], 'doc-q'),
      record('q2', [0, 1], 'doc-q'),
      record('q3', [0.707, 0.707], 'doc-q'),
      record('t1', [0.8, 0.2], 'doc-t'),
      record('t2', [0.2, 0.8], 'doc-t'),
      record('t3', [0.6, 0.6], 'doc-t'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, {
      'doc-t': [{ sourceId: 'filesystem', externalId: '/docs/t.md', contentHash: 'doc-t', status: 'active' } as RegistryEntry],
    });
    for (const h of ['q1', 'q2', 'q3', 't1', 't2', 't3']) {
      chunkToSource.set(h, { rootHash: h.startsWith('q') ? 'doc-q' : 'doc-t' });
    }

    const results = await service.findSimilar('doc-q', { topK: 5, threshold: 0.5 });
    expect(results.length).toBe(1);
    expect(results[0].matchedChunks).toBe(3);
    // mean of three high similarities, not max
    expect(results[0].similarity).toBeLessThan(0.99);
    expect(results[0].similarity).toBeGreaterThan(0.85);
  });
});
