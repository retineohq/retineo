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
