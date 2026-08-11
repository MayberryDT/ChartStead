CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reviewer')),
  event_ids_json TEXT NOT NULL,
  roles_by_event_json TEXT NOT NULL DEFAULT '{}',
  track_ids_by_event_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
