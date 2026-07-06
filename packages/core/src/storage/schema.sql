-- RETINEO Core — SQLite Registry Schema
-- Phase 0: Domain Storage

-- Sources: mutable registry of ingested files
CREATE TABLE sources (
    id          TEXT PRIMARY KEY,           -- sourceId (e.g., filename or UUID)
    protocol    TEXT NOT NULL,              -- file | http | https
    uri         TEXT NOT NULL,              -- full path or URL
    source_path TEXT NOT NULL,              -- vault-relative human-readable path
    mime_type   TEXT NOT NULL,
    adapter_id  TEXT NOT NULL,
    raw_hash    TEXT NOT NULL,              -- SHA-256 of original file
    root_hash   TEXT,                       -- contentHash of root node
    last_seen_at TEXT NOT NULL,             -- ISO 8601
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_sources_raw_hash ON sources(raw_hash);
CREATE INDEX idx_sources_adapter ON sources(adapter_id);

-- Segments: fractal nodes linkage
CREATE TABLE segments (
    hash        TEXT PRIMARY KEY,           -- contentHash (CAS key)
    source_id   TEXT NOT NULL,
    span_start  INTEGER NOT NULL,           -- char offset or ms
    span_end    INTEGER NOT NULL,
    adapter_id  TEXT NOT NULL,
    parent_hash TEXT,                       -- null for root nodes
    FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
);

CREATE INDEX idx_segments_source ON segments(source_id);
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
    original_source_id TEXT NOT NULL,
    l2_path         TEXT,                   -- path to L2.json artifact
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

-- Audit logs (append-only, not partitioned in SQLite)
CREATE TABLE audit_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    TEXT NOT NULL UNIQUE,
    timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL CHECK(action IN ('CREATE','UPDATE','DELETE','GRANT','REVOKE','LOGIN','EXPORT')),
    resource    TEXT NOT NULL,
    before_state TEXT,                      -- JSON
    after_state  TEXT,                      -- JSON
    ip          TEXT,
    user_agent  TEXT,
    session_id  TEXT
);

CREATE INDEX idx_audit_actor ON audit_logs(actor, timestamp);
CREATE INDEX idx_audit_resource ON audit_logs(resource, timestamp);
