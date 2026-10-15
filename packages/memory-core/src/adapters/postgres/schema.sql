CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  lifecycle_state TEXT NOT NULL,
  redirect_to TEXT,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_objects_tenant ON objects(tenant_id, id);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  trust_profile TEXT NOT NULL,
  state TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  locator TEXT NOT NULL,
  state TEXT NOT NULL,
  current_version_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_source_items_source ON source_items(source_id);

CREATE TABLE IF NOT EXISTS source_versions (
  id TEXT PRIMARY KEY,
  source_item_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  source_time TEXT,
  content_ref TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  tenant_id TEXT NOT NULL DEFAULT 'default'
);
CREATE INDEX IF NOT EXISTS idx_source_versions_item ON source_versions(source_item_id);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object_or_value TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  observed_at TEXT,
  valid_from TEXT,
  valid_to TEXT,
  lifecycle_state TEXT NOT NULL,
  support_level TEXT NOT NULL,
  support_evidence_count INTEGER NOT NULL,
  support_disagreeing_count INTEGER NOT NULL,
  confidence REAL NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scope TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_claims_subject ON claims(subject_id);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_object TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  target_object TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  observed_at TEXT,
  valid_from TEXT,
  valid_to TEXT,
  lifecycle_state TEXT NOT NULL,
  support_level TEXT NOT NULL,
  support_evidence_count INTEGER NOT NULL,
  support_disagreeing_count INTEGER NOT NULL,
  confidence REAL NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  scope TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_object);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_object);

CREATE TABLE IF NOT EXISTS contexts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT,
  lifecycle_state TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  observed_at TEXT,
  valid_from TEXT,
  valid_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL,
  member_type TEXT NOT NULL,
  member_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  confidence REAL NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_membership_context ON memberships(context_id);

CREATE TABLE IF NOT EXISTS gaps (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subject_id TEXT,
  description TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  lifecycle_state TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'internal',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL,
  segment_ref TEXT,
  content_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provenance (
  id TEXT PRIMARY KEY,
  assertion_type TEXT NOT NULL,
  assertion_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  learned_at TEXT NOT NULL,
  basis TEXT
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
