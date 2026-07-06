/**
 * Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';
import { SQLiteRegistry } from '../../packages/core/src/storage/registry.js';
import type { SourceRecord, SegmentRecord, JobRecord } from '../../packages/core/src/domain/types.js';

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

function makeSource(id: string): SourceRecord {
  return {
    id,
    protocol: 'file',
    uri: '/tmp/test.md',
    sourcePath: 'test.md',
    mimeType: 'text/markdown',
    adapterId: 'file',
    rawHash: 'r'.repeat(64),
    rootHash: 'c'.repeat(64),
    lastSeenAt: new Date().toISOString(),
  };
}

function makeSegment(hash: string, sourceId: string, parentHash?: string): SegmentRecord {
  return {
    hash,
    sourceId,
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
    const got = registry.getSource('s1');
    expect(got).not.toBeNull();
    expect(got!.id).toBe('s1');
    expect(got!.rawHash).toBe('r'.repeat(64));
  });

  it('finds source by raw hash', () => {
    const s = makeSource('s2');
    registry.insertSource(s);
    expect(registry.getSourceByRawHash('r'.repeat(64))!.id).toBe('s2');
  });

  it('updates source fields', () => {
    const s = makeSource('s3');
    registry.insertSource(s);
    registry.updateSource('s3', { uri: '/new/path' });
    expect(registry.getSource('s3')!.uri).toBe('/new/path');
  });

  it('deletes source', () => {
    const s = makeSource('s4');
    registry.insertSource(s);
    registry.deleteSource('s4');
    expect(registry.getSource('s4')).toBeNull();
  });

  it('lists sources', () => {
    registry.insertSource(makeSource('s5'));
    registry.insertSource(makeSource('s6'));
    expect(registry.listSources().length).toBe(2);
  });
});

describe('Segments', () => {
  it('inserts and retrieves segment', () => {
    const s = makeSource('src1');
    registry.insertSource(s);
    const seg = makeSegment('h1', 'src1');
    registry.insertSegment(seg);
    expect(registry.getSegment('h1')!.sourceId).toBe('src1');
  });

  it('gets segments by source', () => {
    const s = makeSource('src2');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h2', 'src2'));
    registry.insertSegment(makeSegment('h3', 'src2'));
    expect(registry.getSegmentsBySource('src2').length).toBe(2);
  });

  it('gets child segments', () => {
    const s = makeSource('src3');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('parent', 'src3'));
    registry.insertSegment(makeSegment('child', 'src3', 'parent'));
    expect(registry.getChildSegments('parent').length).toBe(1);
  });

  it('deletes segment', () => {
    const s = makeSource('src4');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h4', 'src4'));
    registry.deleteSegment('h4');
    expect(registry.getSegment('h4')).toBeNull();
  });

  it('cascades on source delete', () => {
    const s = makeSource('src5');
    registry.insertSource(s);
    registry.insertSegment(makeSegment('h5', 'src5'));
    registry.deleteSource('src5');
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

  it('fails job to dead after max attempts', () => {
    const job: JobRecord = { ...makeJob('j5'), attempts: 2, maxAttempts: 3 };
    registry.insertJob(job);
    registry.acquireLease('w1', 5000); // attempts -> 3
    registry.failJob('j5', 'boom');
    const pending = registry.getPendingJobs(10);
    expect(pending.find(j => j.id === 'j5')).toBeUndefined();
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
    expect(o!.originalSourceId).toBe('src');
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
