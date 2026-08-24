/**
 * RETINEO Core — Registry
 * Phase 8: SQLite-backed RegistryStore. Source metadata only; CAS knows only contentHash.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import type { Hash, SegmentRecord, JobRecord, JobStatus } from '../domain/types.js';
import type { RegistryEntry, RegistryStore, SourceStatus } from './types.js';
import type { AuditService, AuditLog } from './audit.js';

export interface OrphanRecord {
  hash: Hash;
  sourceId: string;
  externalId: string;
  orphanedAt: string;
  recoveredAt: string | null;
  scheduledPurgeAt: string | null;
}

export interface L2Status {
  ready: number;
  pending: number;
  failed: number;
  total: number;
}

export interface Registry extends RegistryStore {
  insertSource(entry: RegistryEntry): void;
  updateSource(
    sourceId: string,
    externalId: string,
    updates: Partial<Omit<RegistryEntry, 'sourceId' | 'externalId'>>
  ): void;
  deleteSource(sourceId: string, externalId: string): void;
  listSources(): RegistryEntry[];

  insertSegment(segment: SegmentRecord): void;
  getSegment(hash: Hash): SegmentRecord | null;
  getSegmentsBySource(sourceId: string, externalId: string): SegmentRecord[];
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
  getFailedJobs(limit: number): JobRecord[];
  getJobsBySource(contentHash: string): JobRecord[];
  getJob(jobId: string): JobRecord | null;
  getL2Status(): L2Status;
  getJobCounts(): { pending: number; running: number; completed: number; failed: number; dead: number };
  getLastHeartbeat(workerId: string): string | null;
  getRunningWorkerIds(): string[];

  insertOrphan(hash: Hash, sourceId: string, externalId: string): void;
  getOrphan(hash: Hash): OrphanRecord | null;
  recoverOrphan(hash: Hash): void;
  listOrphans(): OrphanRecord[];
  purgeOrphansOlderThan(days: number): number;
  isOrphan(hash: Hash): boolean;

  clearSources(): void;
  clearJobs(): void;
  clearOrphans(): void;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function rowToEntry(row: Record<string, unknown>): RegistryEntry {
  return {
    sourceId: row.source_id as string,
    externalId: row.external_id as string,
    contentHash: row.content_hash as Hash,
    etag: row.etag as string,
    status: row.status as SourceStatus,
    deletedAt: row.deleted_at as number | null,
    lastSeenAt: row.last_seen_at as number,
    createdAt: parseTimestamp(row.created_at),
    retentionPolicy: (row.retention_policy as string) ?? 'standard',
    sensitivityLevel: (row.sensitivity_level as string) ?? 'none',
    encryptionKeyId: (row.encryption_key_id as string | null) ?? null,
  };
}

function rowToSegment(row: Record<string, unknown>): SegmentRecord {
  return {
    hash: row.hash as Hash,
    sourceId: row.source_id as string,
    externalId: row.external_id as string,
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
    sourceId: row.source_id as string,
    externalId: row.external_id as string,
    orphanedAt: row.orphaned_at as string,
    recoveredAt: (row.recovered_at as string | null) ?? null,
    scheduledPurgeAt: (row.scheduled_purge_at as string | null) ?? null,
  };
}

export class SQLiteRegistry implements Registry, AuditService {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  private initSchema(): void {
    const tableInfo = this.db.prepare("PRAGMA table_info(sources)").all() as Array<{ name: string }>;
    const hasContentHash = tableInfo.some((col) => col.name === 'content_hash');
    if (tableInfo.length > 0 && !hasContentHash) {
      throw new Error('Data format v1 is incompatible. Run: retineo rebuild');
    }

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = readFileSync(schemaPath, 'utf-8');
    const patched = sql
      .replace(/CREATE TABLE (\w+)/g, 'CREATE TABLE IF NOT EXISTS $1')
      .replace(/CREATE INDEX (\w+)/g, 'CREATE INDEX IF NOT EXISTS $1');
    this.db.exec(patched);
    this.migrateRegistrySchema();
    this.db.pragma('user_version = 2');
  }

  private migrateRegistrySchema(): void {
    const tableInfo = this.db.prepare("PRAGMA table_info(sources)").all() as Array<{ name: string }>;
    const columns = new Set(tableInfo.map((c) => c.name));
    const addColumn = (name: string, ddl: string) => {
      if (!columns.has(name)) {
        this.db.exec(`ALTER TABLE sources ADD COLUMN ${ddl}`);
      }
    };
    addColumn('created_at', "INTEGER NOT NULL DEFAULT 0");
    addColumn('retention_policy', "TEXT NOT NULL DEFAULT 'standard'");
    addColumn('sensitivity_level', "TEXT NOT NULL DEFAULT 'none'");
    addColumn('encryption_key_id', "TEXT DEFAULT NULL");

    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp   INTEGER NOT NULL,
      actor       TEXT NOT NULL DEFAULT 'system',
      action      TEXT NOT NULL,
      resource_hash TEXT,
      level       TEXT,
      metadata    TEXT
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, timestamp)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_hash, timestamp)`);
  }

  close(): void {
    this.db.close();
  }

  // --- AuditService ---

  async log(
    action: string,
    resourceHash?: string,
    level?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT INTO audit_log (timestamp, actor, action, resource_hash, level, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      Date.now(),
      'system',
      action,
      resourceHash ?? null,
      level ?? null,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  readAuditLogs(limit = 1000): AuditLog[] {
    const rows = this.db
      .prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?')
      .all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: row.id as number,
      timestamp: row.timestamp as number,
      actor: row.actor as string,
      action: row.action as string,
      resourceHash: (row.resource_hash as string | null) ?? undefined,
      level: (row.level as string | null) ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    }));
  }

  // --- RegistryStore ---

  get(sourceId: string, externalId: string): RegistryEntry | null {
    const row = this.db
      .prepare('SELECT * FROM sources WHERE source_id = ? AND external_id = ?')
      .get(sourceId, externalId) as Record<string, unknown> | undefined;
    return row ? rowToEntry(row) : null;
  }

  set(entry: RegistryEntry): void {
    const createdAt = entry.createdAt ?? Date.now();
    const retentionPolicy = entry.retentionPolicy ?? 'standard';
    const sensitivityLevel = entry.sensitivityLevel ?? 'none';
    const encryptionKeyId = entry.encryptionKeyId ?? null;
    const stmt = this.db.prepare(
      `INSERT INTO sources (source_id, external_id, content_hash, etag, status, deleted_at, last_seen_at, created_at, updated_at, retention_policy, sensitivity_level, encryption_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
       ON CONFLICT(source_id, external_id) DO UPDATE SET
         content_hash = excluded.content_hash,
         etag = excluded.etag,
         status = excluded.status,
         deleted_at = excluded.deleted_at,
         last_seen_at = excluded.last_seen_at,
         created_at = excluded.created_at,
         retention_policy = excluded.retention_policy,
         sensitivity_level = excluded.sensitivity_level,
         encryption_key_id = excluded.encryption_key_id,
         updated_at = datetime('now')`
    );
    stmt.run(
      entry.sourceId,
      entry.externalId,
      entry.contentHash,
      entry.etag,
      entry.status,
      entry.deletedAt,
      entry.lastSeenAt,
      createdAt,
      retentionPolicy,
      sensitivityLevel,
      encryptionKeyId
    );
  }

  listByContentHash(hash: Hash): RegistryEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM sources WHERE content_hash = ?')
      .all(hash) as Record<string, unknown>[];
    return rows.map(rowToEntry);
  }

  listBySourceId(sourceId: string): RegistryEntry[] {
    const rows = this.db.prepare('SELECT * FROM sources WHERE source_id = ?').all(sourceId) as Record<string, unknown>[];
    return rows.map(rowToEntry);
  }

  // --- Sources (convenience aliases) ---

  insertSource(entry: RegistryEntry): void {
    this.set(entry);
  }

  updateSource(
    sourceId: string,
    externalId: string,
    updates: Partial<Omit<RegistryEntry, 'sourceId' | 'externalId'>>
  ): void {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (updates.contentHash !== undefined) { sets.push('content_hash = ?'); values.push(updates.contentHash); }
    if (updates.etag !== undefined) { sets.push('etag = ?'); values.push(updates.etag); }
    if (updates.status !== undefined) { sets.push('status = ?'); values.push(updates.status); }
    if (updates.deletedAt !== undefined) { sets.push('deleted_at = ?'); values.push(updates.deletedAt); }
    if (updates.lastSeenAt !== undefined) { sets.push('last_seen_at = ?'); values.push(updates.lastSeenAt); }
    if (updates.createdAt !== undefined) { sets.push('created_at = ?'); values.push(updates.createdAt); }
    if (updates.retentionPolicy !== undefined) { sets.push('retention_policy = ?'); values.push(updates.retentionPolicy); }
    if (updates.sensitivityLevel !== undefined) { sets.push('sensitivity_level = ?'); values.push(updates.sensitivityLevel); }
    if (updates.encryptionKeyId !== undefined) { sets.push('encryption_key_id = ?'); values.push(updates.encryptionKeyId); }
    sets.push('updated_at = datetime(\'now\')');
    values.push(sourceId, externalId);
    const stmt = this.db.prepare(`UPDATE sources SET ${sets.join(', ')} WHERE source_id = ? AND external_id = ?`);
    stmt.run(...values);
  }

  deleteSource(sourceId: string, externalId: string): void {
    this.db.prepare('DELETE FROM sources WHERE source_id = ? AND external_id = ?').run(sourceId, externalId);
  }

  clearSources(): void {
    this.db.prepare('DELETE FROM sources').run();
  }

  clearJobs(): void {
    this.db.prepare('DELETE FROM jobs').run();
  }

  clearOrphans(): void {
    this.db.prepare('DELETE FROM orphaned_objects').run();
  }

  listSources(): RegistryEntry[] {
    const rows = this.db.prepare('SELECT * FROM sources').all() as Record<string, unknown>[];
    return rows.map(rowToEntry);
  }

  // --- Segments ---

  insertSegment(segment: SegmentRecord): void {
    const stmt = this.db.prepare(
      `INSERT INTO segments (hash, source_id, external_id, span_start, span_end, adapter_id, parent_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO UPDATE SET
         source_id = excluded.source_id,
         external_id = excluded.external_id,
         span_start = excluded.span_start,
         span_end = excluded.span_end,
         adapter_id = excluded.adapter_id,
         parent_hash = excluded.parent_hash`
    );
    stmt.run(segment.hash, segment.sourceId, segment.externalId, segment.spanStart, segment.spanEnd, segment.adapterId, segment.parentHash);
  }

  getSegment(hash: Hash): SegmentRecord | null {
    const row = this.db.prepare('SELECT * FROM segments WHERE hash = ?').get(hash) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSegment(row) : null;
  }

  getSegmentsBySource(sourceId: string, externalId: string): SegmentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM segments WHERE source_id = ? AND external_id = ?')
      .all(sourceId, externalId) as Record<string, unknown>[];
    return rows.map(rowToSegment);
  }

  getChildSegments(parentHash: Hash): SegmentRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM segments WHERE parent_hash = ?')
      .all(parentHash) as Record<string, unknown>[];
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
    // After max attempts the job is terminal but NOT lost: status FAILED lets
    // consumers re-run it via `compile`/`rebuild` instead of silently dropping
    // the document from the pipeline.
    const newStatus: JobStatus = job.attempts >= job.maxAttempts ? 'FAILED' : 'PENDING';
    const completedAt = newStatus === 'FAILED' ? new Date().toISOString() : null;
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

    this.db.prepare(
      `UPDATE jobs SET status = 'PENDING', lease_until = NULL, worker_id = NULL WHERE status = 'RUNNING' AND lease_until < ?`
    ).run(now);

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

  getFailedJobs(limit: number): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE status IN ('FAILED', 'DEAD') ORDER BY created_at ASC LIMIT ?`
    ).all(limit) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getJobsBySource(contentHash: string): JobRecord[] {
    const rows = this.db.prepare(
      `SELECT * FROM jobs WHERE json_extract(payload, '$.nodeId') = ? ORDER BY created_at ASC`
    ).all(contentHash) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  getJob(jobId: string): JobRecord | null {
    return this.getJobInternal(jobId);
  }

  jobsByNodeHash(nodeHash: string): JobRecord[] {
    return this.getJobsBySource(nodeHash);
  }

  getL2Status(): L2Status {
    const row = this.db.prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN status = 'COMPLETED' THEN json_extract(payload, '$.nodeId') END) AS ready,
         COUNT(DISTINCT CASE WHEN status IN ('PENDING', 'RUNNING') THEN json_extract(payload, '$.nodeId') END) AS pending,
         COUNT(DISTINCT CASE WHEN status IN ('FAILED', 'DEAD') THEN json_extract(payload, '$.nodeId') END) AS failed,
         COUNT(DISTINCT json_extract(payload, '$.nodeId')) AS total
       FROM jobs WHERE type = 'GENERATE_L2'`
    ).get() as Record<string, unknown> | undefined;
    return {
      ready: (row?.ready as number | null) ?? 0,
      pending: (row?.pending as number | null) ?? 0,
      failed: (row?.failed as number | null) ?? 0,
      total: (row?.total as number | null) ?? 0,
    };
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

  insertOrphan(hash: Hash, sourceId: string, externalId: string): void {
    const orphanedAt = new Date().toISOString();
    const scheduledPurgeAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare(
      `INSERT INTO orphaned_objects (hash, source_id, external_id, orphaned_at, scheduled_purge_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO UPDATE SET
         source_id = excluded.source_id,
         external_id = excluded.external_id,
         orphaned_at = excluded.orphaned_at,
         recovered_at = NULL,
         scheduled_purge_at = excluded.scheduled_purge_at`
    ).run(hash, sourceId, externalId, orphanedAt, scheduledPurgeAt);
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

  isOrphan(hash: Hash): boolean {
    const row = this.db.prepare(
      `SELECT 1 FROM orphaned_objects WHERE hash = ? AND recovered_at IS NULL`
    ).get(hash) as { '1': number } | undefined;
    return row !== undefined;
  }
}
