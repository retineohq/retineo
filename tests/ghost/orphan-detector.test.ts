/**
 * Orphan Detector Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultOrphanDetector } from '../../packages/core/src/ghost/orphan-detector.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import type { SourceRecord } from '../../packages/core/src/domain/types.js';

describe('DefaultOrphanDetector', () => {
  let tmpDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let detector: DefaultOrphanDetector;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-ghost-'));
    cas = new LocalCASStorage(tmpDir);
    registry = new SQLiteRegistry(path.join(tmpDir, 'registry.sqlite'));
    detector = new DefaultOrphanDetector(registry, cas);
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function registerSource(uri: string, rootHash: string): SourceRecord {
    const source: SourceRecord = {
      id: `src-${rootHash.slice(0, 8)}`,
      protocol: 'file',
      uri,
      mimeType: 'text/markdown',
      adapterId: 'markdown',
      rawHash: rootHash,
      rootHash,
      lastSeenAt: new Date().toISOString(),
    };
    registry.insertSource(source);
    return source;
  }

  it('detectDeletedSources — finds deleted files', async () => {
    const filePath = path.join(tmpDir, 'deleted.md');
    writeFileSync(filePath, '# Deleted');
    const hash = computeHash('# Deleted');
    registerSource(filePath, hash);

    // Delete the file
    rmSync(filePath);

    const orphans = await detector.detectDeletedSources();
    expect(orphans.length).toBe(1);
    expect(orphans[0].hash).toBe(hash);
    expect(orphans[0].reason).toBe('deleted');
    expect(orphans[0].sourcePath).toBe(filePath);
  });

  it('detectDeletedSources — no orphans when files exist', async () => {
    const filePath = path.join(tmpDir, 'exists.md');
    writeFileSync(filePath, '# Exists');
    const hash = computeHash('# Exists');
    registerSource(filePath, hash);

    const orphans = await detector.detectDeletedSources();
    expect(orphans.length).toBe(0);
  });

  it('detectDeletedSources — handles multiple sources', async () => {
    const file1 = path.join(tmpDir, 'file1.md');
    const file2 = path.join(tmpDir, 'file2.md');
    writeFileSync(file1, '# File 1');
    writeFileSync(file2, '# File 2');
    const hash1 = computeHash('# File 1');
    const hash2 = computeHash('# File 2');
    registerSource(file1, hash1);
    registerSource(file2, hash2);

    // Delete file1 only
    rmSync(file1);

    const orphans = await detector.detectDeletedSources();
    expect(orphans.length).toBe(1);
    expect(orphans[0].hash).toBe(hash1);
  });

  it('detectDeletedSources — registers orphan in registry', async () => {
    const filePath = path.join(tmpDir, 'tracked.md');
    writeFileSync(filePath, '# Tracked');
    const hash = computeHash('# Tracked');
    const source = registerSource(filePath, hash);

    rmSync(filePath);

    await detector.detectDeletedSources();

    const orphan = registry.getOrphan(hash);
    expect(orphan).not.toBeNull();
    expect(orphan!.originalSourceId).toBe(source.id);
  });

  it('detectModifiedSources — returns empty (placeholder)', async () => {
    const orphans = await detector.detectModifiedSources();
    expect(orphans.length).toBe(0);
  });
});
