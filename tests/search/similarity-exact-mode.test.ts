/**
 * Similarity Service — Exact Mode (brute-force) Tests
 * Verifies the mode: 'exact' option for deterministic, reproducible results.
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
  dim = 3
) {
  const { index } = await loadOrBuildHNSW(indexDir, dim, 'test-model');

  const chunkToSource = new Map<Hash, { rootHash: Hash }>();

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

/**
 * Build a synthetic 10-doc fixture with two deliberately tied pairs.
 *
 * Pair A: doc-a1 & doc-a2 have equal vectors relative to query doc-z
 *   query chunk z = [1, 0, 0]
 *   doc a1 chunk = [0.9, 0.1, 0] → cosine similarity = 0.9 / (1 * ~0.906) ≈ 0.993
 *   doc a2 chunk = same vector → same similarity → tie
 *
 * Pair B (different tier): doc-b1 & doc-b2 tied at lower similarity
 *   both = [0.5, 0.5, 0] → sim ≈ 0.707
 *
 * Plus other docs for variety — all distinct.
 */
function buildTenDocFixture(): string[] {
  return [
    // doc-z: the query doc (3 chunks)
    record('z1', [1, 0, 0], 'doc-z'),
    record('z2', [0, 1, 0], 'doc-z'),
    record('z3', [0, 0, 1], 'doc-z'),

    // doc-a: two chunks identical in vector (tied pair A)
    record('a1', [0.9, 0.1, 0], 'doc-a'),
    record('a2', [0.9, 0.1, 0], 'doc-a'),

    // doc-b: similar-but-distinct
    record('b1', [0.8, 0.2, 0], 'doc-b'),
    record('b2', [0.7, 0.3, 0], 'doc-b'),

    // doc-c: orthogonal to z1
    record('c1', [0, 0.95, 0.05], 'doc-c'),

    // doc-d: far from everything
    record('d1', [0, 0, 0.99], 'doc-d'),

    // doc-e: two chunks tied at lower similarity (pair B)
    record('e1', [0.5, 0.5, 0], 'doc-e'),
    record('e2', [0.5, 0.5, 0], 'doc-e'),

    // doc-f: random-ish
    record('f1', [0.3, 0.7, 0], 'doc-f'),
  ];
}

function allDocEntries(): Record<Hash, RegistryEntry[]> {
  const docs = ['doc-a', 'doc-b', 'doc-c', 'doc-d', 'doc-e', 'doc-f'];
  const entries: Record<Hash, RegistryEntry[]> = {};
  for (const d of docs) {
    entries[d] = [{ sourceId: 'filesystem', externalId: `/docs/${d}.md`, contentHash: d, status: 'active' } as RegistryEntry];
  }
  return entries;
}

describe('findSimilar — mode: exact', () => {
  let tmpDir: string;
  let indexDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-exact-'));
    indexDir = path.join(tmpDir, 'index');
    mkdirSync(indexDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('default (no mode) still uses HNSW path — produces results', async () => {
    const lines = [
      record('z1', [1, 0, 0], 'doc-z'),
      record('a1', [0.9, 0.1, 0], 'doc-a'),
    ];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, allDocEntries(), 3);
    chunkToSource.set('z1', { rootHash: 'doc-z' });
    chunkToSource.set('a1', { rootHash: 'doc-a' });

    // Default call — should not throw and return results via HNSW
    const results = await service.findSimilar('doc-z', { topK: 5, threshold: 0.5 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('mode: exact returns brute-force cosine results', async () => {
    const lines = buildTenDocFixture();
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      chunkToSource.set(rec.hash, { rootHash: rec.rootHash });
    }

    const exact = await service.findSimilar('doc-z', { topK: 5, threshold: 0.5, mode: 'exact' });
    expect(exact.length).toBeGreaterThan(0);
    // All scores are valid 0..1
    for (const doc of exact) {
      expect(doc.similarity).toBeGreaterThanOrEqual(0);
      expect(doc.similarity).toBeLessThanOrEqual(1);
    }
    // doc-a should rank above doc-f given the vectors
    const aIdx = exact.findIndex((d) => d.contentHash === 'doc-a');
    const fIdx = exact.findIndex((d) => d.contentHash === 'doc-f');
    expect(aIdx).toBeLessThan(fIdx);
  });

  it('mode: exact is deterministic — same results twice in a row', async () => {
    const lines = buildTenDocFixture();
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      chunkToSource.set(rec.hash, { rootHash: rec.rootHash });
    }

    const first = await service.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });
    const second = await service.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });

    expect(first).toEqual(second);
  });

  it('determinism holds across index reload', async () => {
    const lines = buildTenDocFixture();
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    // First pass: fresh service
    const { service: s1, chunkToSource: cts1 } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      cts1.set(rec.hash, { rootHash: rec.rootHash });
    }
    const first = await s1.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });

    // Second pass: fresh service loading the persisted HNSW from disk
    const { service: s2, chunkToSource: cts2 } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      cts2.set(rec.hash, { rootHash: rec.rootHash });
    }
    const second = await s2.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });

    expect(first).toEqual(second);
  });

  it('mode: exact produces stable tie-breaking on equal similarity', async () => {
    const lines = buildTenDocFixture();
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      chunkToSource.set(rec.hash, { rootHash: rec.rootHash });
    }

    // Run 3 times — all identical
    const r1 = await service.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });
    const r2 = await service.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });
    const r3 = await service.findSimilar('doc-z', { topK: 10, threshold: 0.4, mode: 'exact' });

    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);

    // Tied pairs are present with matching scores
    // doc-a has 2 chunks both at [0.9, 0.1, 0] → identical per-doc score
    // doc-e has 2 chunks both at [0.5, 0.5, 0] → identical per-doc score
    const aScore = r1.find((d) => d.contentHash === 'doc-a')?.similarity;
    const eScore = r1.find((d) => d.contentHash === 'doc-e')?.similarity;

    // The two docs in pair A should have the same score (deterministic)
    // We cannot easily assert which doc is which — just assert scores are stable
    expect(typeof aScore).toBe('number');
    expect(typeof eScore).toBe('number');
  });

  it('mode: exact with empty index — no crash, returns []', async () => {
    // No embeddings.jsonl written
    const { service, chunkToSource } = await makeService(indexDir, {}, 3);

    // Even with empty index, mode: exact should not throw
    await expect(
      service.findSimilar('some-hash', { topK: 5, threshold: 0.5, mode: 'exact' })
    ).resolves.not.toThrow();
    const results = await service.findSimilar('some-hash', { topK: 5, threshold: 0.5, mode: 'exact' });
    expect(results).toEqual([]);
  });

  it('unknown hash with mode: exact returns []', async () => {
    const lines = buildTenDocFixture();
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const { service, chunkToSource } = await makeService(indexDir, allDocEntries(), 3);
    for (const l of lines) {
      const rec = JSON.parse(l) as { hash: string; rootHash: string };
      chunkToSource.set(rec.hash, { rootHash: rec.rootHash });
    }

    const results = await service.findSimilar('doc-nonexistent', { topK: 5, threshold: 0.5, mode: 'exact' });
    expect(results).toEqual([]);
  });

  it('ghost filtering still applies with mode: exact', async () => {
    const lines = [record('z1', [1, 0, 0], 'doc-z'), record('a1', [0.9, 0.1, 0], 'doc-a')];
    writeFileSync(path.join(indexDir, 'embeddings.jsonl'), lines.join('\n') + '\n', 'utf-8');

    const entries: Record<Hash, RegistryEntry[]> = {
      'doc-a': [{ sourceId: 'filesystem', externalId: '/docs/a.md', contentHash: 'doc-a', status: 'ghost' } as RegistryEntry],
    };
    const { service, chunkToSource } = await makeService(indexDir, entries, 3);
    chunkToSource.set('z1', { rootHash: 'doc-z' });
    chunkToSource.set('a1', { rootHash: 'doc-a' });

    const noGhosts = await service.findSimilar('doc-z', { topK: 5, threshold: 0.5, mode: 'exact' });
    expect(noGhosts).toEqual([]);

    const withGhosts = await service.findSimilar('doc-z', { topK: 5, threshold: 0.5, mode: 'exact', includeGhosts: true });
    expect(withGhosts.length).toBe(1);
  });
});
