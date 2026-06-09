/**
 * Ghost Recovery Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { DefaultGhostRecoveryService } from '../../packages/core/src/ghost/recovery-service.js';
import { LocalCASStorage, computeHash } from '../../packages/core/src/storage/cas.js';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import type { ContextNode, SourceRecord } from '../../packages/core/src/domain/types.js';

describe('DefaultGhostRecoveryService', () => {
  let tmpDir: string;
  let cas: LocalCASStorage;
  let registry: SQLiteRegistry;
  let service: DefaultGhostRecoveryService;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'echo-ghost-recover-'));
    cas = new LocalCASStorage(tmpDir);
    registry = new SQLiteRegistry(path.join(tmpDir, 'registry.sqlite'));
    service = new DefaultGhostRecoveryService(registry, cas);
  });

  afterEach(() => {
    registry.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  async function seedNode(content: string, sourceUri: string): Promise<string> {
    const hash = computeHash(content);
    const now = new Date().toISOString();
    const node: ContextNode = {
      id: hash,
      sourceRef: { protocol: 'file', uri: sourceUri, mimeType: 'text/markdown' },
      childrenIds: [],
      depth: 0,
      artifacts: {},
      build: {
        schemaVersion: 1,
        nodeVersion: 1,
        rawHash: hash,
        contentHash: hash,
        generators: {
          l1: { id: 'placeholder', version: '0.0.0' },
          l2: { id: 'placeholder', version: '0.0.0' },
          embedding: { id: 'placeholder', version: '0.0.0' },
        },
        buildTimestamp: now,
      },
      createdAt: now,
      updatedAt: now,
    };
    await cas.writeObject(node, { content, meta: { blocks: [] } });

    const source: SourceRecord = {
      id: `src-${hash.slice(0, 8)}`,
      protocol: 'file',
      uri: sourceUri,
      mimeType: 'text/markdown',
      adapterId: 'markdown',
      rawHash: hash,
      rootHash: hash,
      lastSeenAt: now,
    };
    registry.insertSource(source);
    return hash;
  }

  it('listGhosts — empty when no orphans', async () => {
    const ghosts = await service.listGhosts();
    expect(ghosts.length).toBe(0);
  });

  it('listGhosts — shows orphans', async () => {
    const hash = await seedNode('# Ghost', '/ghost.md');
    registry.insertOrphan(hash, `src-${hash.slice(0, 8)}`, '/ghost.md');

    const ghosts = await service.listGhosts();
    expect(ghosts.length).toBe(1);
    expect(ghosts[0].hash).toBe(hash);
  });

  it('recover — restores content from CAS', async () => {
    const hash = await seedNode('# Recover Me', '/recover.md');
    registry.insertOrphan(hash, `src-${hash.slice(0, 8)}`, '/recover.md');

    const targetPath = path.join(tmpDir, 'recovered.md');
    await service.recover(hash, targetPath);

    const content = readFileSync(targetPath, 'utf-8');
    expect(content).toBe('# Recover Me');

    // Orphan should be marked as recovered
    const orphan = registry.getOrphan(hash);
    expect(orphan).not.toBeNull();
    // recoverOrphan sets recovered_at
  });

  it('recover — throws for non-existent orphan', async () => {
    await expect(service.recover('deadbeef')).rejects.toThrow('No orphan found');
  });

  it('recover — throws when CAS object missing', async () => {
    const hash = computeHash('missing');
    registry.insertOrphan(hash, 'src-missing', '/missing.md');

    await expect(service.recover(hash)).rejects.toThrow('CAS object');
  });

  it('purge — removes old orphans', async () => {
    const hash = await seedNode('# Old', '/old.md');
    registry.insertOrphan(hash, `src-${hash.slice(0, 8)}`, '/old.md');

    // Manually set scheduled_purge_at to the past so purge(0) catches it
    registry.db.prepare(`UPDATE orphaned_objects SET scheduled_purge_at = datetime('now', '-1 day') WHERE hash = ?`).run(hash);

    // Purge with 0 days should remove all with scheduled_purge_at < now
    const purged = await service.purge(0);
    expect(purged).toBeGreaterThanOrEqual(1);

    const ghosts = await service.listGhosts();
    expect(ghosts.length).toBe(0);
  });
});
