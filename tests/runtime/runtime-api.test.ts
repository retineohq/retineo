/**
 * Runtime API (createCore) integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { createCore } from '../../packages/core/src/runtime/core-handle.js';

let tmpDir: string;
let dataDir: string;
let vaultDir: string;

function mockConfig() {
  return {
    llm: {
      defaultProvider: 'mock',
      providers: [{ id: 'mock', type: 'mock', model: 'mock-llm' }],
    },
    embedding: {
      defaultProvider: 'mock-embed',
      providers: [{ id: 'mock-embed', type: 'mock', model: 'mock-embedder', dimension: 384 }],
    },
    logging: {
      level: 'error' as const,
      console: false,
      file: false,
      filePath: path.join(dataDir, 'logs', 'retineo.log'),
      pretty: false,
    },
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-runtime-'));
  dataDir = path.join(tmpDir, 'data');
  vaultDir = path.join(tmpDir, 'vault');
  mkdirSync(vaultDir, { recursive: true });

  writeFileSync(
    path.join(vaultDir, 'alpha.md'),
    '# Alpha\n\nNeural networks are powerful machine learning models used for pattern recognition.\n',
  );
  writeFileSync(
    path.join(vaultDir, 'beta.md'),
    '# Beta\n\nNeural networks learn patterns from data using layered representations.\n',
  );
  writeFileSync(
    path.join(vaultDir, 'gamma.md'),
    '# Gamma\n\nThe quick brown fox jumps over the lazy dog.\n',
  );
  writeFileSync(
    path.join(vaultDir, 'delta.md'),
    '# Delta\n\nQuantum computing uses qubits to perform computations.\n',
  );
  writeFileSync(
    path.join(vaultDir, 'epsilon.md'),
    '# Epsilon\n\nA lazy dog slept under the tree while the fox ran away.\n',
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('createCore runtime API', () => {
  it('ingests a vault, lists documents, finds similar docs, reads nodes, reports health, and reopens', async () => {
    const core = await createCore({ dataDir, config: mockConfig() });

    const result = await core.ingest(vaultDir);
    expect(result.discovered).toBeGreaterThanOrEqual(5);
    expect(result.ingested).toBeGreaterThanOrEqual(5);
    expect(result.skipped).toBe(0);
    expect(result.failed).toHaveLength(0);

    const docs = await core.listDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(5);
    for (const doc of docs) {
      expect(doc.sourcePath).toContain(vaultDir);
      expect(doc.status).toBe('active');
      expect(doc.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }

    const alpha = docs.find((d) => d.sourcePath?.endsWith('alpha.md'));
    expect(alpha).toBeDefined();

    const similar = await core.findSimilar(alpha!.contentHash, { topK: 5, threshold: 0 });
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.every((s) => s.contentHash !== alpha!.contentHash)).toBe(true);
    expect(similar.some((s) => s.sourcePath?.endsWith('beta.md'))).toBe(true);

    const node = await core.getNode(alpha!.contentHash);
    expect(node).not.toBeNull();
    expect(node!.contentHash).toBe(alpha!.contentHash);
    expect(node!.sourcePath).toContain('alpha.md');
    expect(node!.l0Excerpt).toContain('Neural networks');
    expect(node!.l2Summary).toBeTruthy();
    expect(typeof node!.l2Summary).toBe('string');

    const report = await core.health();
    expect(typeof report.score).toBe('number');
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.strong).toBeInstanceOf(Array);
    expect(report.attention).toBeInstanceOf(Array);
    expect(report.recommendations).toBeInstanceOf(Array);
    expect(report.advancedMetrics).toBeInstanceOf(Array);

    await core.close();

    // Reopening the same data dir should work after close().
    const core2 = await createCore({ dataDir, config: mockConfig() });
    const docs2 = await core2.listDocuments();
    expect(docs2.length).toBeGreaterThanOrEqual(5);
    await core2.close();
  });

  it('returns empty results for unknown hashes', async () => {
    const core = await createCore({ dataDir, config: mockConfig() });
    await core.ingest(vaultDir);

    const unknownHash = '0'.repeat(64);
    expect(await core.findSimilar(unknownHash)).toEqual([]);
    expect(await core.getNode(unknownHash)).toBeNull();

    await core.close();
  });

  it('marks deleted files as ghosts only when includeGhosts is true', async () => {
    const core = await createCore({ dataDir, config: mockConfig() });
    await core.ingest(vaultDir);

    unlinkSync(path.join(vaultDir, 'epsilon.md'));
    await core.ingest(vaultDir);

    const activeDocs = await core.listDocuments();
    expect(activeDocs.some((d) => d.sourcePath?.endsWith('epsilon.md'))).toBe(false);
    expect(activeDocs.length).toBeGreaterThanOrEqual(4);

    const allDocs = await core.listDocuments({ includeGhosts: true });
    const ghost = allDocs.find((d) => d.sourcePath?.endsWith('epsilon.md'));
    expect(ghost).toBeDefined();
    expect(ghost!.status).toBe('ghost');

    await core.close();
  });

  it('throws clear errors for missing dataDir option and nonexistent ingest path', async () => {
    await expect(createCore({ dataDir: '' })).rejects.toThrow('createCore requires options.dataDir');

    const core = await createCore({ dataDir, config: mockConfig() });
    await expect(core.ingest(path.join(vaultDir, 'does-not-exist.md'))).rejects.toThrow(
      'Ingest path not found',
    );
    await core.close();
  });
});
