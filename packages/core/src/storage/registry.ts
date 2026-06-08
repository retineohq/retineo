/**
 * ECHO Core — Registry
 * Phase 1: SQLite-backed registry with job lease model
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type {
  Hash,
  SourceRecord,
  SegmentRecord,
  JobRecord,
  JobStatus,
} from '../domain/types.js';

export interface OrphanRecord {
  hash: Hash;
  originalSourceId: string;
  l2Path: string | null;
  orphanedAt: string;
  recoveredAt: string | null;
  scheduledPurgeAt: string | null;
}

export interface Registry {
  insertSource(source: SourceRecord): void;
  getSource(id: string): SourceRecord | null;
  getSourceByRawHash(rawHash: Hash): SourceRecord | null;
  getSourceByRootHash(rootHash: Hash): SourceRecord | null;
  getSourcesByRootHash(rootHash: Hash): SourceRecord[];
  updateSource(id: string, updates: Partial<SourceRecord>): void;
  updateSourcePath(id: string, uri: string): void;
  deleteSource(id: string): void;
  listSources(): SourceRecord[];

  insertSegment(segment: SegmentRecord): void;
  getSegment(hash: Hash): SegmentRecord | null;
  getSegmentsBySource(sourceId: string): SegmentRecord[];
  getChildSegments(parentHash: Hash): SegmentRecord[];
  deleteSegment(hash: Hash): void;

  insertJob(job: JobRecord): void;
  acquireLease(workerId: string, leaseDurationMs: number): JobRecord | null;
  heartbeatJob(jobId: string, workerId: string, leaseDurationMs: number): void;
  completeJob(jobId: string): void;
  failJob(jobId: string, error: string): void;
  releaseExpiredLeases(): JobRecord[];
  releaseAllLeases(workerId: string): JobRecord[];
  getRunningJobs(workerId: string): JobRecord[];
  getPendingJobs(limit: number): JobRecord[];
  getDeadJobs(limit: number): JobRecord[];
  getJobsBySource(nodeId: string): JobRecord[];
  getJob(jobId: string): JobRecord | null;
  getJobCounts(): { pending: number; running: number; completed: number; failed: number; dead: number };
  getLastHeartbeat(workerId: string): string | null;
  getRunningWorkerIds(): string[];
  jobsByNodeHash(nodeHash: string): JobRecord[];

  insertOrphan(hash: Hash, sourceId: string, l2Path: string): void;
  getOrphan(hash: Hash): OrphanRecord | null;
  recoverOrphan(hash: Hash): void;
  listOrphans(): OrphanRecord[];
  purgeOrphansOlderThan(days: number): number;
}

function rowToSource(row: Record<string, unknown>): SourceRecord {
  return {
    id: row.id as string,
    protocol: row.protocol as string,
    uri: row.uri as string,
    mimeType: row.mime_type as string,
    adapterId: row.adapter_id as string,
    rawHash: row.raw_hash as Hash,
    rootHash: (row.root_hash as Hash | null) ?? '',
    lastSeenAt: row.last_seen_at as string,
  };
}

function rowToSegment(row: Record<string, unknown>): SegmentRecord {
  return {
    hash: row.hash as Hash,
    sourceId: row.source_id as string,
    spanStart: row.span_start as number,
    spanEnd: row.span_end as number,
    adapterId: row.adapter_id as string,
    parentHash: (row.parent_hash as Hash | null) ?? null,
  };
}

function rowToJob(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    type: row.type as JobRecord['type'],
    payload: row.payload as string,
    priority: row.priority as number,
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
    status: row.status as JobStatus,
    leaseUntil: (row.lease_until as string | null) ?? null,
    workerId: (row.worker_id as string | null) ?? null,
    heartbeatAt: (row.heartbeat_at as string | null) ?? null,
    createdAt: row.created_at as string,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

function rowToOrphan(row: Record<string, unknown>): OrphanRecord {
  return {
    hash: row.hash as Hash,
    originalSourceId: row.original_source_id as string,
    l2Path: (row.l2_path as string | null) ?? null,
    orphanedAt: row.orphaned_at as string,
    recoveredAt: (row.recovered_at as string | null) ?? null,
    scheduledPurgeAt: (row.scheduled_purge_at as string | null) ?? null,
  };
}

export class SQLiteRegistry implements Registry {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf-8');
    // Split on CREATE TABLE/INDEX and add IF NOT EXISTS to avoid
    // "table already exists" errors when init command already ran.
    const patched = sql
      .replace(/CREATE TABLE (\w+)/g, 'CREATE TABLE IF NOT EXISTS $1')
      .replace(/CREATE INDEX (\w+)/g, 'CREATE INDEX IF NOT EXISTS $1');
    this.db.exec(patched);
  }

  close(): void {
    this.db.close();
  }

  // --- Sources ---

  insertSource(source: SourceRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO sources (id, protocol, uri, mime_type, adapter_id, raw_hash, root_hash, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    );
    stmt.run(
      source.id,
      source.protocol,
      source.uri,
      source.mimeType,
      source.adapterId,
      source.rawHash,
      source.rootHash || null,
      source.lastSeenAt
    );
  }

  getSource(id: string): SourceRecord | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSource(row) : null;
  }

  getSourceByRawHash(rawHash: Hash): SourceRecord | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE raw_hash = ?').get(rawHash) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSource(row) : null;
  }

  getSourceByRootHash(rootHash: Hash): SourceRecord | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE root_hash = ?').get(rootHash) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSource(row) : null;
  }

  getSourcesByRootHash(rootHash: Hash): SourceRecord[] {
    const rows = this.db.prepare('SELECT * FROM sources WHERE root_hash = ?').all(rootHash) as Record<string, unknown>[];
    return rows.map(rowToSource);
  }

  updateSource(id: string, updates: Partial<SourceRecord>): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.protocol !== undefined) { sets.push('protocol = ?'); values.push(updates.protocol); }
    if (updates.uri !== undefined) { sets.push('uri = ?'); values.push(updates.uri); }
    if (updates.mimeType !== undefined) { sets.push('mime_type = ?'); values.push(updates.mimeType); }
    if (updates.adapterId !== undefined) { sets.push('adapter_id = ?'); values.push(updates.adapterId); }
    if (updates.rawHash !== undefined) { sets.push('raw_hash = ?'); values.push(updates.rawHash); }
    if (updates.rootHash !== undefined) { sets.push('root_hash = ?'); values.push(updates.rootHash || null); }
    if (updates.lastSeenAt !== undefined) { sets.push('last_seen_at = ?'); values.push(updates.lastSeenAt); }
    sets.push('updated_at = datetime(\'now\')');
    values.push(id);
    const stmt = this.db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE id = ?`);
    stmt.run(...values);
  }

  updateSourcePath(id: string, uri: string): void {
    this.db.prepare(
      `UPDATE sources SET uri = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(uri, id);
  }

  deleteSource(id: string): void {
    this.db.prepare('DELETE FROM sources WHERE id = ?').run(id);
  }

  listSources(): SourceRecord[] {
    const rows = this.db.prepare('SELECT * FROM sources').all() as Record<string, unknown>[];
    return rows.map(rowToSource);
  }

  // --- Segments ---

  insertSegment(segment: SegmentRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO segments (hash, source_id, span_start, span_end, adapter_id, parent_hash)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(segment.hash, segment.sourceId, segment.spanStart, segment.spanEnd, segment.adapterId, segment.parentHash);
  }

  getSegment(hash: Hash): SegmentRecord | null {
    const row = this.db.prepare('SELECT * FROM segments WHERE hash = ?').get(hash) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSegment(row) : null;
  }

  getSegmentsBySource(sourceId: string): SegmentRecord[] {
    const rows = this.db.prepare('SELECT * FROM segments WHERE source_id = ?').all(sourceId) as Record<string, unknown>[];
    return rows.map(rowToSegment);
  }

  getChildSegments(parentHash: Hash): SegmentRecord[] {
    const rows = this.db.prepare('SELECT * FROM segments WHERE parent_hash = ?').all(parentHash) as Record<string, unknown>[];
    return rows.map(rowToSegment);
  }

  deleteSegment(hash: Hash): void {
    this.db.prepare('DELETE FROM segments WHERE hash = ?').run(hash);
  }

  // --- Jobs ---

  insertJob(job: JobRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO jobs (id, type, payload, priority, attempts, max_attempts, status, lease_until, worker_id, heartbeat_at, created_at, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      job.id,
      job.type,
      job.payload,
      job.priority,
      job.attempts,
      job.maxAttempts,
      job.status,
      job.leaseUntil,
      job.workerId,
      job.heartbeatAt,
      job.createdAt,
      job.startedAt,
      job.completedAt
    );
  }

  acquireLease(workerId: string, leaseDurationMs: number): JobRecord | null {
    const now = new Date().toISOString();
    const leaseUntil = new Date(Date.now() + leaseDurationMs).toISOString();

    // Find highest priority pending job
    const row = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT 1`
    ).get() as Record<string, unknown> | undefined;

    if (!row) return null;

    const job = rowToJob(row);
    const stmt = this.db.prepare(
      `UPDATE jobs SET status = 'RUNNING', worker_id = ?, lease_until = ?, started_at = ?, attempts = attempts + 1 WHERE id = ? AND status = 'PENDING'`
    );
    const result = stmt.run(workerId, leaseUntil, now, job.id);
    if (result.changes === 0) return null;

    return { ...job, status: 'RUNNING', workerId, leaseUntil, startedAt: now, attempts: job.attempts + 1 };
  }

  heartbeatJob(jobId: string, workerId: string, leaseDurationMs: number): void {
    const leaseUntil = new Date(Date.now() + leaseDurationMs).toISOString();
    const heartbeatAt = new Date().toISOString();
    this.db.prepare(
      `UPDATE jobs SET lease_until = ?, heartbeat_at = ? WHERE id = ? AND worker_id = ? AND status = 'RUNNING'`
    ).run(leaseUntil, heartbeatAt, jobId, workerId);
  }

  completeJob(jobId: string): void {
    const completedAt = new Date().toISOString();
    this.db.prepare(
      `UPDATE jobs SET status = 'COMPLETED', completed_at = ? WHERE id = ?`
    ).run(completedAt, jobId);
  }

  failJob(jobId: string, error: string): void {
    const job = this.getJobInternal(jobId);
    if (!job) return;
    const newStatus: JobStatus = job.attempts >= job.maxAttempts ? 'DEAD' : 'PENDING';
    const completedAt = newStatus === 'DEAD' ? new Date().toISOString() : null;
    this.db.prepare(
      `UPDATE jobs SET status = ?, completed_at = ?, lease_until = NULL, worker_id = NULL WHERE id = ?`
    ).run(newStatus, completedAt, jobId);
  }

  private getJobInternal(jobId: string): JobRecord | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToJob(row) : null;
  }

  releaseExpiredLeases(): JobRecord[] {
    const now = new Date().toISOString();
    const expired = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'RUNNING' AND lease_until < ?`
    ).all(now) as Record<string, unknown>[];

    const stmt = this.db.prepare(
      `UPDATE jobs SET status = 'PENDING', lease_until = NULL, worker_id = NULL WHERE status = 'RUNNING' AND lease_until < ?`
    );
    stmt.run(now);

    return expired.map(rowToJob).map(j => ({ ...j, status: 'PENDING' as JobStatus, leaseUntil: null, workerId: null }));
  }

  releaseAllLeases(workerId: string): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'RUNNING' AND worker_id = ?`
    ).all(workerId) as Record<string, unknown>[];

    this.db.prepare(
      `UPDATE jobs SET status = 'PENDING', lease_until = NULL, worker_id = NULL WHERE status = 'RUNNING' AND worker_id = ?`
    ).run(workerId);

    return rows.map(rowToJob).map(j => ({ ...j, status: 'PENDING' as JobStatus, leaseUntil: null, workerId: null }));
  }

  getRunningJobs(workerId: string): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'RUNNING' AND worker_id = ?`
    ).all(workerId) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getPendingJobs(limit: number): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'PENDING' ORDER BY priority DESC, created_at ASC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getDeadJobs(limit: number): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status = 'DEAD' ORDER BY created_at ASC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getJobsBySource(nodeId: string): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE json_extract(payload, '$.nodeId') = ? ORDER BY created_at ASC`
    ).all(nodeId) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getJob(jobId: string): JobRecord | null {
    return this.getJobInternal(jobId);
  }

  jobsByNodeHash(nodeHash: string): JobRecord[] {
    return this.getJobsBySource(nodeHash);
  }

  getJobCounts(): { pending: number; running: number; completed: number; failed: number; dead: number } {
    const row = this.db.prepare(
      `SELECT
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) as running,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'DEAD' THEN 1 ELSE 0 END) as dead
       FROM jobs`
    ).get() as Record<string, unknown> | undefined;
    return {
      pending: (row?.pending as number | null) ?? 0,
      running: (row?.running as number | null) ?? 0,
      completed: (row?.completed as number | null) ?? 0,
      failed: (row?.failed as number | null) ?? 0,
      dead: (row?.dead as number | null) ?? 0,
    };
  }

  getLastHeartbeat(workerId: string): string | null {
    const row = this.db.prepare(
      `SELECT heartbeat_at FROM jobs WHERE worker_id = ? AND heartbeat_at IS NOT NULL ORDER BY heartbeat_at DESC LIMIT 1`
    ).get(workerId) as { heartbeat_at: string | null } | undefined;
    return row?.heartbeat_at ?? null;
  }

  getRunningWorkerIds(): string[] {
    const rows = this.db.prepare(
      `SELECT DISTINCT worker_id FROM jobs WHERE status = 'RUNNING' AND worker_id IS NOT NULL`
    ).all() as { worker_id: string }[];
    return rows.map((r) => r.worker_id).filter((id): id is string => !!id);
  }

  // --- Orphans ---

  insertOrphan(hash: Hash, sourceId: string, l2Path: string): void {
    const orphanedAt = new Date().toISOString();
    const scheduledPurgeAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(
      `INSERT INTO orphaned_objects (hash, original_source_id, l2_path, orphaned_at, scheduled_purge_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(hash, sourceId, l2Path, orphanedAt, scheduledPurgeAt);
  }

  getOrphan(hash: Hash): OrphanRecord | null {
    const row = this.db.prepare('SELECT * FROM orphaned_objects WHERE hash = ?').get(hash) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToOrphan(row) : null;
  }

  recoverOrphan(hash: Hash): void {
    this.db.prepare(
      `UPDATE orphaned_objects SET recovered_at = datetime('now') WHERE hash = ?`
    ).run(hash);
  }

  listOrphans(): OrphanRecord[] {
    const rows = this.db.prepare('SELECT * FROM orphaned_objects WHERE recovered_at IS NULL').all() as Record<string, unknown>[];
    return rows.map(rowToOrphan);
  }

  purgeOrphansOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare(
      `DELETE FROM orphaned_objects WHERE scheduled_purge_at < ? AND recovered_at IS NULL`
    ).run(cutoff);
    return result.changes;
  }
}
