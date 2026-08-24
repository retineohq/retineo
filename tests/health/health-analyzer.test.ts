/**
 * HealthAnalyzer unit tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultHealthAnalyzer } from '../../packages/core/src/health/health-analyzer.js';
import type { Hash, ContextNode } from '../../packages/core/src/domain/types.js';

let tmpDir: string;
let indexDir: string;

function makeNode(hash: Hash): ContextNode {
  return {
    id: hash,
    sourceRef: { protocol: 'file', uri: '/dev/null', mimeType: 'text/plain' },
    childrenIds: [],
    depth: 0,
    build: {
      schemaVersion: 2,
      nodeVersion: 1,
      rawHash: hash,
      contentHash: hash,
      generators: { l1: { id: 'p', version: '1' }, l2: { id: 'p', version: '1' }, embedding: { id: 'p', version: '1' } },
      buildTimestamp: new Date().toISOString(),
    },
    semanticLinks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeCAS(docs: Record<Hash, { content: string; l1?: string; l2?: string; l1Index?: object }>) {
  return {
    exists: (hash: Hash) => hash in docs,
    getObjectPath: (hash: Hash) => path.join(tmpDir, 'objects', hash.slice(0, 2), hash.slice(2)),
    readObject: async (hash: Hash) => {
      const doc = docs[hash];
      if (!doc) throw new Error('missing');
      const l2 = doc.l2 ? (JSON.parse(doc.l2) as { summary?: string; claims?: string[] }) : undefined;
      return {
        node: makeNode(hash),
        artifacts: { content: doc.content, l1: doc.l1, l2 },
      };
    },
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-health-'));
  indexDir = path.join(tmpDir, 'index');
  mkdirSync(indexDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('DefaultHealthAnalyzer', () => {
  it('runs all metrics and returns a report', async () => {
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const h3 = 'c'.repeat(64);

    const l1Index = { title: 'T', sections: [], chunks: [{ id: 'chunk-001', lineStart: 0, lineEnd: 1, charStart: 0, charEnd: 10, contentHash: 'chunk1hash' }] };
    const l1IndexPath = path.join(tmpDir, 'objects', h1.slice(0, 2), h1.slice(2), 'L1.index.json');
    mkdirSync(path.dirname(l1IndexPath), { recursive: true });
    writeFileSync(l1IndexPath, JSON.stringify(l1Index));

    const cas = makeCAS({
      [h1]: { content: 'body one', l2: JSON.stringify({ summary: 'summary one', claims: ['claim1', 'claim2'] }) },
      [h2]: { content: 'body two', l2: JSON.stringify({ summary: 'summary two', claims: ['claim3'] }) },
      [h3]: { content: 'body three' },
    });

    const entries = [
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/1.md', contentHash: h1, status: 'active' as const, lastSeenAt: Date.now(), createdAt: Date.now() - 10000, etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/2.md', contentHash: h2, status: 'active' as const, lastSeenAt: Date.now(), createdAt: Date.now() - 5000, etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/3.md', contentHash: h3, status: 'ghost' as const, lastSeenAt: Date.now(), createdAt: Date.now(), etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
    ];
    const registry = {
      listBySourceId: () => entries,
      listByContentHash: (hash: string) => entries.filter((e) => e.contentHash === hash),
      getChildSegments: () => [],
    };

    const analyzer = new DefaultHealthAnalyzer({ cas, registry, indexDir });
    const report = await analyzer.analyze('filesystem:/tmp');

    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.strong).toBeInstanceOf(Array);
    expect(report.attention).toBeInstanceOf(Array);
    expect(report.recommendations).toBeInstanceOf(Array);
    expect(report.advancedMetrics).toHaveLength(3);

    const ghostFinding = report.attention.find((f) => f.type === 'ghost');
    expect(ghostFinding).toBeDefined();
    expect(ghostFinding!.documents).toEqual([{ contentHash: h3, sourcePath: '/tmp/3.md' }]);
  });

  it('attaches L2 degradation diagnostics from the registry', async () => {
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const cas = makeCAS({
      [h1]: { content: 'body one' },
      [h2]: { content: 'body two' },
    });
    const entries = [
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/1.md', contentHash: h1, status: 'active' as const, lastSeenAt: Date.now(), createdAt: Date.now() - 10000, etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/2.md', contentHash: h2, status: 'active' as const, lastSeenAt: Date.now(), createdAt: Date.now() - 5000, etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
    ];
    const registry = {
      listBySourceId: () => entries,
      listByContentHash: (hash: string) => entries.filter((e) => e.contentHash === hash),
      getChildSegments: () => [],
      getL2Status: () => ({ ready: 1, pending: 0, failed: 1, total: 2 }),
      getFailedJobs: () => [
        { id: 'job-1', type: 'GENERATE_L2', payload: JSON.stringify({ nodeId: h2 }), status: 'FAILED' },
      ],
    };

    const analyzer = new DefaultHealthAnalyzer({ cas, registry, indexDir });
    const report = await analyzer.analyze('filesystem:/tmp');

    expect(report.l2FailedNodes).toBe(1);
    expect(report.l2Pending).toBe(0);
    expect(report.l2Status).toEqual({ ready: 1, pending: 0, failed: 1, total: 2 });
    expect(report.failedJobs).toEqual([
      { jobId: 'job-1', type: 'GENERATE_L2', nodeHash: h2, status: 'FAILED' },
    ]);
  });

  it('reuses the cached report while sources and job state are unchanged', async () => {
    const h1 = 'a'.repeat(64);
    const cas = makeCAS({ [h1]: { content: 'body one' } });
    const entries = [
      { sourceId: 'filesystem:/tmp', externalId: '/tmp/1.md', contentHash: h1, status: 'active' as const, lastSeenAt: Date.now(), createdAt: Date.now() - 10000, etag: '', deletedAt: null as number | null, retentionPolicy: 'standard', sensitivityLevel: 'none', encryptionKeyId: null as string | null },
    ];
    const registry = {
      listBySourceId: () => entries,
      listByContentHash: (hash: string) => entries.filter((e) => e.contentHash === hash),
      getChildSegments: () => [],
      getL2Status: () => ({ ready: 1, pending: 0, failed: 0, total: 1 }),
    };

    const analyzer = new DefaultHealthAnalyzer({ cas, registry, indexDir });
    const first = await analyzer.analyze('filesystem:/tmp');
    const second = await analyzer.analyze('filesystem:/tmp');
    expect(second).toBe(first);
  });
});
