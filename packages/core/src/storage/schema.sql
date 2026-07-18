-- RETINEO Core — SQLite Registry Schema
-- Phase 8: Content-addressable Registry. Source metadata only; no paths inside CAS.

-- Sources: mutable registry of external documents.
-- Primary key is the external identity (sourceId + externalId).
-- contentHash links to CAS.
CREATE TABLE sources (
    source_id   TEXT NOT NULL,              -- adapter/namespace id: "filesystem", "s3-bucket-alpha"
    external_id TEXT NOT NULL,              -- path or key in the source's namespace
    content_hash TEXT NOT NULL,             -- SHA-256 of L0 body (CAS key)
    etag        TEXT NOT NULL,              -- source-specific version tag
    status      TEXT NOT NULL CHECK(status IN ('active','ghost','deleted')),
    deleted_at  INTEGER,                    -- epoch ms, null unless status = deleted
    last_seen_at INTEGER NOT NULL,          -- epoch ms
    created_at  INTEGER NOT NULL DEFAULT 0, -- epoch ms
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    retention_policy TEXT NOT NULL DEFAULT 'standard',
    sensitivity_level TEXT NOT NULL DEFAULT 'none',
    encryption_key_id TEXT,                 -- null if unencrypted
    PRIMARY KEY (source_id, external_id)
);

CREATE INDEX idx_sources_content_hash ON sources(content_hash);
CREATE INDEX idx_sources_source_id ON sources(source_id);

-- Segments: fractal node linkage.
-- (source_id, external_id) references the root source row that produced this segment.
CREATE TABLE segments (
    hash        TEXT PRIMARY KEY,           -- contentHash (CAS key)
    source_id   TEXT NOT NULL,              -- sources.source_id
    external_id TEXT NOT NULL,              -- sources.external_id
    span_start  INTEGER NOT NULL,           -- char offset or ms
    span_end    INTEGER NOT NULL,
    adapter_id  TEXT NOT NULL,
    parent_hash TEXT,                       -- contentHash of parent segment
    FOREIGN KEY (source_id, external_id) REFERENCES sources(source_id, external_id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_source ON segments(source_id, external_id);
CREATE INDEX idx_segments_parent ON segments(parent_hash);

-- Jobs: background compilation queue with lease
CREATE TABLE jobs (
    id              TEXT PRIMARY KEY,       -- UUID
    type            TEXT NOT NULL CHECK(type IN ('GENERATE_L1','GENERATE_L2','GENERATE_L3','RECONCILE')),
    payload         TEXT NOT NULL,          -- JSON
    priority        INTEGER NOT NULL DEFAULT 0,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    status          TEXT NOT NULL CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED','DEAD')),
    lease_until     TEXT,                   -- ISO 8601, null if not leased
    worker_id       TEXT,
    heartbeat_at    TEXT,                   -- ISO 8601
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    started_at      TEXT,
    completed_at    TEXT
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_status_priority ON jobs(status, priority DESC) WHERE status = 'PENDING';
CREATE INDEX idx_jobs_lease ON jobs(lease_until) WHERE status = 'RUNNING';

-- Orphaned objects: Ghost System
CREATE TABLE orphaned_objects (
    hash            TEXT PRIMARY KEY,       -- contentHash
    source_id       TEXT NOT NULL,          -- original source namespace
    external_id     TEXT NOT NULL,          -- original external id
    orphaned_at     TEXT NOT NULL DEFAULT (datetime('now')),
    recovered_at    TEXT,
    scheduled_purge_at TEXT                 -- orphaned_at + 90 days
);

CREATE INDEX idx_orphaned_purge ON orphaned_objects(scheduled_purge_at);

-- Encryption keys: master key versions
CREATE TABLE encryption_keys (
    key_version INTEGER PRIMARY KEY,
    key_data    BLOB NOT NULL,              -- encrypted master key or raw
    key_type    TEXT NOT NULL DEFAULT 'raw' CHECK(key_type IN ('raw','vault','aws_kms','gcp_kms')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    rotated_at  TEXT,
    status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','rotated','archived'))
);

CREATE INDEX idx_encryption_keys_active ON encryption_keys(status) WHERE status = 'active';

-- Audit log: append-only operational log
CREATE TABLE audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   INTEGER NOT NULL,           -- epoch ms
    actor       TEXT NOT NULL DEFAULT 'system',
    action      TEXT NOT NULL,
    resource_hash TEXT,
    level       TEXT,
    metadata    TEXT                        -- JSON
);

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp);
CREATE INDEX idx_audit_log_action ON audit_log(action, timestamp);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_hash, timestamp);
