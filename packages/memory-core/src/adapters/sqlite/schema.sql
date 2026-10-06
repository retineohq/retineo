CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  lifecycle_state TEXT NOT NULL,
  redirect_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  source_version_id TEXT NOT NULL,
  segment_ref TEXT,
  content_hash TEXT NOT NULL,
  state TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_provenance_assertion ON provenance(assertion_id);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  extractor TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  candidate_ref TEXT NOT NULL,
  verdict TEXT NOT NULL,
  reasoning TEXT,
  decision_model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_candidate ON decisions(candidate_ref);

CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  decision_ref TEXT NOT NULL,
  action TEXT NOT NULL,
  acl_ref TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_policy_decision ON policies(decision_ref);

CREATE TABLE IF NOT EXISTS representations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  generator TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  semantic_classes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repr_type ON representations(type);
CREATE INDEX IF NOT EXISTS idx_repr_evidence ON representations(evidence_id);

CREATE TABLE IF NOT EXISTS journal (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  timestamp TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  actor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  root_context TEXT NOT NULL,
  included_objects TEXT NOT NULL DEFAULT '[]',
  included_claims TEXT NOT NULL DEFAULT '[]',
  included_relationships TEXT NOT NULL DEFAULT '[]',
  included_contexts TEXT NOT NULL DEFAULT '[]',
  included_evidence TEXT NOT NULL DEFAULT '[]',
  purpose TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);
