CREATE TABLE users_new (
  discord_id TEXT PRIMARY KEY,
  discord_username TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  guild_id TEXT,
  guild_member_status TEXT CHECK (guild_member_status IN ('active', 'left')),
  guild_checked_at TEXT,
  disabled_reason TEXT,
  icon_source TEXT NOT NULL CHECK (icon_source IN ('r2', 'none')),
  icon_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

INSERT INTO users_new (
  discord_id,
  discord_username,
  display_name,
  role,
  status,
  guild_id,
  guild_member_status,
  guild_checked_at,
  disabled_reason,
  icon_source,
  icon_key,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  discord_id,
  discord_username,
  display_name,
  role,
  status,
  guild_id,
  guild_member_status,
  guild_checked_at,
  disabled_reason,
  CASE WHEN icon_source = 'r2' THEN 'r2' ELSE 'none' END,
  CASE WHEN icon_source = 'r2' THEN icon_key ELSE NULL END,
  created_at,
  updated_at,
  deleted_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE TABLE auth_codes_new (
  code TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  icon_source TEXT NOT NULL CHECK (icon_source IN ('r2', 'none')),
  icon_key TEXT,
  session_persistent INTEGER NOT NULL CHECK (session_persistent IN (0, 1)) DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO auth_codes_new (
  code,
  app_id,
  discord_id,
  display_name,
  role,
  icon_source,
  icon_key,
  session_persistent,
  created_at,
  expires_at
)
SELECT
  code,
  app_id,
  discord_id,
  display_name,
  role,
  CASE WHEN icon_source = 'r2' THEN 'r2' ELSE 'none' END,
  CASE WHEN icon_source = 'r2' THEN icon_key ELSE NULL END,
  session_persistent,
  created_at,
  expires_at
FROM auth_codes;

DROP TABLE auth_codes;
ALTER TABLE auth_codes_new RENAME TO auth_codes;

CREATE INDEX auth_codes_expires_at_index ON auth_codes(expires_at);
