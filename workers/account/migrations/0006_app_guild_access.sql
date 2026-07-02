CREATE TABLE user_guild_memberships (
  discord_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'left')),
  checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (discord_id, guild_id)
);

CREATE TABLE app_guild_access (
  app_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_by_discord_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (app_id, guild_id)
);

CREATE INDEX user_guild_memberships_guild_id_index ON user_guild_memberships(guild_id);
CREATE INDEX app_guild_access_guild_id_index ON app_guild_access(guild_id);
