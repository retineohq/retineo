/**
 * Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import type { SegmentRecord, JobRecord } from '../../packages/core/src/domain/types.js';
import type { RegistryEntry } from '../../packages/core/src/storage/types.js';

let tmpDir: string;
let dbPath: string;
let registry: SQLiteRegistry;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'retineo-reg-'));
  dbPath = path.join(tmpDir, 'test.sqlite');
  registry = new SQLiteRegistry(dbPath);
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeSource(sourceId: string, externalId = '/tmp/test.md', contentHash = 'c'.repeat(64)): RegistryEntry {
  return {
    sourceId,
    externalId,
    contentHash,
    etag: 'etag',
    status: 'active',
    deletedAt: null,
    lastSeenAt: Date.now(),
  };
}

function makeSegment(hash: string, sourceId: string, externalId: string, parentHash?: string): SegmentRecord {
  return {
    hash,
    sourceId,
    externalId,
    spanStart: 0,
    spanEnd: 10,
    adapterId: 'file',
    parentHash: parentHash ?? null,
  };
}

function makeJob(id: string, status: JobRecord['status'] = 'PENDING'): JobRecord {
  const now = new Date().toISOString();
  return {
    id,
    type: 'GENERATE_L1',
    payload: '{}',
    priority: 0,
    attempts: 0,
    maxAttempts: 3,
    status,
    leaseUntil: null,
    workerId: null,
    heartbeatAt: null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  };
}

describe('Sources', () => {
  it('inserts and retrieves source', () => {
    const s = makeSource('s1');
    registry.insertSource(s);
    const got = registry.get('s1', '/tmp/test.md');
    expect(got).not.toBeNull();
    expect(got!.sourceId).toBe('s1');
    expect(got!.contentHash).toBe('c'.repeat(64));
  });

  it('finds source by content hash', () => {
    const s = makeSource('s2');
    registry.insertSource(s);
    expect(registry.listByContentHash('c'.repeat(64))[0]!.sourceId).toBe('s2');
  });

  it('updates source fields', () => {
    const s = makeSource('s3');
    registry.insertSource(s);
    registry.updateSource('s3', '/tmp/test.md', { etag: 'new-etag' });
    expect(registry.get('s3', '/tmp/test.md')!.etag).toBe('new-etag');
  });

  it('deletes source', () => {
    const s = makeSource('s4');
    registry.insertSource(s);
    registry.deleteSource('s4', '/tmp/test.md');
    expect(registry.get('s4', '/tmp/test.md')).toBeNull();
  });

  it('lists sources', () => {
    registry.insertSource(makeSource('s5'));
    registry.insertSource(makeSource('s6', '/tmp/other.md'));
    expect(registry.listSources().length).toBe(2);
  });
});

describe('Segments', () => {
  it('inserts and retrieves segment', () => {
    const s = makeSource('src1');
    registry.insertSource(s);
    const seg = makeSegment('h1', 'src1', '/tmp/test.md');
    registry.insertSegment(seg);
    expect(registry.getSegment('h1')!.sourceId).toBe('src1');
  });

  it('gets segments by source', () => {
    const s = makeSource('src2');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h2', 'src2', '/tmp/test.md'));
    registry.insertSegment(makeSegment('h3', 'src2', '/tmp/test.md'));
    expect(registry.getSegmentsBySource('src2', '/tmp/test.md').length).toBe(2);
  });

  it('gets child segments', () => {
    const s = makeSource('src3');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('parent', 'src3', '/tmp/test.md'));
    registry.insertSegment(makeSegment('child', 'src3', '/tmp/test.md', 'parent'));
    expect(registry.getChildSegments('parent').length).toBe(1);
  });

  it('deletes segment', () => {
    const s = makeSource('src4');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h4', 'src4', '/tmp/test.md'));
    registry.deleteSegment('h4');
    expect(registry.getSegment('h4')).toBeNull();
  });

  it('cascades on source delete', () => {
    const s = makeSource('src5');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h5', 'src5', '/tmp/test.md'));
    registry.deleteSource('src5', '/tmp/test.md');
    expect(registry.getSegment('h5')).toBeNull();
  });
});

describe('Jobs', () => {
  it('inserts and acquires lease', () => {
    const job = makeJob('j1');
    registry.insertJob(job);
    const leased = registry.acquireLease('w1', 5000);
    expect(leased).not.toBeNull();
    expect(leased!.status).toBe('RUNNING');
    expect(leased!.workerId).toBe('w1');
  });

  it('returns null when no pending jobs', () => {
    expect(registry.acquireLease('w1', 5000)).toBeNull();
  });

  it('heartbeats extend lease', () => {
    const job = makeJob('j2');
    registry.insertJob(job);
    registry.acquireLease('w1', 1000);
    registry.heartbeatJob('j2', 'w1', 10000);
    const pending = registry.getPendingJobs(10);
    expect(pending.find(j => j.id === 'j2')).toBeUndefined();
  });

  it('completes job', () => {
    const job = makeJob('j3');
    registry.insertJob(job);
    registry.acquireLease('w1', 5000);
    registry.completeJob('j3');
    const pending = registry.getPendingJobs(10);
    expect(pending.find(j => j.id === 'j3')).toBeUndefined();
  });

  it('fails job and retries', () => {
    const job = makeJob('j4');
    registry.insertJob(job);
    registry.acquireLease('w1', 5000);
    registry.failJob('j4', 'boom');
    const pending = registry.getPendingJobs(10);
    expect(pending.find(j => j.id === 'j4')).not.toBeUndefined();
  });

  it('fails job to FAILED after max attempts (re-runnable, not lost)', () => {
    const job: JobRecord = { ...makeJob('j5'), attempts: 2, maxAttempts: 3 };
    registry.insertJob(job);
    registry.acquireLease('w1', 5000); // attempts -> 3
    registry.failJob('j5', 'boom');
    const pending = registry.getPendingJobs(10);
    expect(pending.find(j => j.id === 'j5')).toBeUndefined();
    const failed = registry.getFailedJobs(10);
    expect(failed.find(j => j.id === 'j5')?.status).toBe('FAILED');
    // FAILED is terminal — it must not be re-acquired automatically.
    expect(registry.acquireLease('w1', 5000)).toBeNull();
  });

  it('lists FAILED and DEAD jobs via getFailedJobs', () => {
    registry.insertJob({ ...makeJob('f1'), status: 'FAILED' });
    registry.insertJob({ ...makeJob('f2'), status: 'DEAD' });
    registry.insertJob(makeJob('f3'));
    const failed = registry.getFailedJobs(10);
    expect(failed.map(j => j.id).sort()).toEqual(['f1', 'f2']);
  });

  it('reports node-level L2 status', () => {
    const l2Job = (id: string, nodeId: string, status: JobRecord['status']) => ({
      ...makeJob(id),
      type: 'GENERATE_L2' as const,
      payload: JSON.stringify({ nodeId }),
      status,
    });
    registry.insertJob(l2Job('l2-1', 'node-a', 'COMPLETED'));
    registry.insertJob(l2Job('l2-2', 'node-b', 'PENDING'));
    registry.insertJob(l2Job('l2-3', 'node-c', 'FAILED'));
    registry.insertJob(l2Job('l2-4', 'node-c', 'DEAD'));
    registry.insertJob(l2Job('l2-5', 'node-d', 'RUNNING'));

    const status = registry.getL2Status();
    expect(status.ready).toBe(1);
    expect(status.pending).toBe(2); // node-b pending + node-d running
    expect(status.failed).toBe(1);  // node-c counted once despite two failed jobs
    expect(status.total).toBe(4);
  });

  it('releases expired leases', () => {
    const job = makeJob('j6');
    registry.insertJob(job);
    registry.acquireLease('w1', 1); // 1ms lease
    // Force expiry by waiting
    const start = Date.now();
    while (Date.now() - start < 20) { /* spin */ }
    const released = registry.releaseExpiredLeases();
    expect(released.length).toBeGreaterThanOrEqual(1);
    expect(released[0].id).toBe('j6');
    expect(registry.getPendingJobs(10).find(j => j.id === 'j6')).not.toBeUndefined();
  });
});

describe('Orphans', () => {
  it('inserts and retrieves orphan', () => {
    registry.insertOrphan('o1', 'src', '/path/l2.json');
    const o = registry.getOrphan('o1');
    expect(o).not.toBeNull();
    expect(o!.sourceId).toBe('src');
    expect(o!.externalId).toBe('/path/l2.json');
  });

  it('lists orphans excluding recovered', () => {
    registry.insertOrphan('o2', 'src', '/p');
    registry.recoverOrphan('o2');
    expect(registry.listOrphans().find(o => o.hash === 'o2')).toBeUndefined();
  });

  it('purges old orphans', () => {
    registry.insertOrphan('o3', 'src', '/p');
    // Force scheduled_purge_at into the past via raw DB access
    (registry as any).db.prepare("UPDATE orphaned_objects SET scheduled_purge_at = datetime('now', '-1 day') WHERE hash = ?").run('o3');
    const count = registry.purgeOrphansOlderThan(0);
    expect(count).toBeGreaterThanOrEqual(1);
    expect(registry.getOrphan('o3')).toBeNull();
  });
});
