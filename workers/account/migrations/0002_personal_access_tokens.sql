CREATE TABLE IF NOT EXISTS personal_access_tokens (
  token_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at INTEGER,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS personal_access_tokens_discord_id_index ON personal_access_tokens(discord_id);
CREATE INDEX IF NOT EXISTS personal_access_tokens_expires_at_index ON personal_access_tokens(expires_at);
