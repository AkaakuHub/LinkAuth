CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  discord_username TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  guild_id TEXT,
  guild_member_status TEXT CHECK (guild_member_status IN ('active', 'left')),
  guild_checked_at TEXT,
  disabled_reason TEXT,
  icon_source TEXT CHECK (icon_source IN ('discord', 'r2', 'none')),
  icon_key TEXT,
  discord_avatar_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE auth_codes (
  code TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  icon_source TEXT CHECK (icon_source IN ('discord', 'r2', 'none')),
  icon_key TEXT,
  session_persistent INTEGER NOT NULL CHECK (session_persistent IN (0, 1)) DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE otp_challenges (
  challenge_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  app_id TEXT,
  return_to TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE otp_rate_limits (
  discord_id TEXT PRIMARY KEY,
  first_issued_at INTEGER,
  first_challenge_id TEXT,
  second_issued_at INTEGER,
  second_challenge_id TEXT,
  updated_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE remember_tokens (
  token_id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE personal_access_tokens (
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

CREATE INDEX remember_tokens_discord_id_index ON remember_tokens(discord_id);
CREATE INDEX personal_access_tokens_discord_id_index ON personal_access_tokens(discord_id);
CREATE INDEX auth_codes_expires_at_index ON auth_codes(expires_at);
CREATE INDEX otp_challenges_expires_at_index ON otp_challenges(expires_at);
CREATE INDEX otp_rate_limits_expires_at_index ON otp_rate_limits(expires_at);
CREATE INDEX remember_tokens_expires_at_index ON remember_tokens(expires_at);
CREATE INDEX personal_access_tokens_expires_at_index ON personal_access_tokens(expires_at);
