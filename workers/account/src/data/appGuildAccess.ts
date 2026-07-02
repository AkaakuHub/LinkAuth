import type { AccountConfig } from "../accountConfig.js";
import { requireDataString } from "./validation.js";

export type AppGuildAccessRecord = {
  appId: string;
  guildId: string;
};

type AppGuildAccessRow = {
  app_id: string;
  guild_id: string;
};

export async function listAppGuildAccess(
  config: AccountConfig,
): Promise<AppGuildAccessRecord[]> {
  const { results } = await config.database
    .prepare(
      `SELECT app_id, guild_id
      FROM app_guild_access
      ORDER BY app_id ASC, guild_id ASC`,
    )
    .all<AppGuildAccessRow>();
  return results.map(accessFromRow).filter((record) => record !== null);
}

export async function grantAppGuildAccess(
  config: AccountConfig,
  input: {
    appId: string;
    guildId: string;
    createdByDiscordId: string;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  await config.database
    .prepare(
      `INSERT INTO app_guild_access (
        app_id, guild_id, created_by_discord_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(app_id, guild_id) DO UPDATE SET
        updated_at = excluded.updated_at`,
    )
    .bind(
      requireDataString(input.appId, "app_id"),
      requireDataString(input.guildId, "guild_id"),
      requireDataString(input.createdByDiscordId, "created_by_discord_id"),
      nowIso,
      nowIso,
    )
    .run();
}

export async function revokeAppGuildAccess(
  config: AccountConfig,
  input: { appId: string; guildId: string },
): Promise<void> {
  await config.database
    .prepare("DELETE FROM app_guild_access WHERE app_id = ? AND guild_id = ?")
    .bind(input.appId, input.guildId)
    .run();
}

export async function upsertUserGuildMembership(
  config: AccountConfig,
  input: {
    discordId: string;
    guildId: string;
    status: "active" | "left";
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  await config.database
    .prepare(
      `INSERT INTO user_guild_memberships (
        discord_id, guild_id, status, checked_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(discord_id, guild_id) DO UPDATE SET
        status = excluded.status,
        checked_at = excluded.checked_at,
        updated_at = excluded.updated_at`,
    )
    .bind(
      requireDataString(input.discordId, "discord_id"),
      requireDataString(input.guildId, "guild_id"),
      input.status,
      nowIso,
      nowIso,
      nowIso,
    )
    .run();
}

export async function userCanAccessApp(
  config: AccountConfig,
  input: { appId: string; discordId: string },
): Promise<boolean> {
  const row = await config.database
    .prepare(
      `SELECT 1
      FROM user_guild_memberships membership
      INNER JOIN app_guild_access access
        ON access.guild_id = membership.guild_id
      WHERE access.app_id = ?
        AND membership.discord_id = ?
        AND membership.status = 'active'
      LIMIT 1`,
    )
    .bind(input.appId, input.discordId)
    .first<{ "1": number }>();
  return row !== null;
}

export async function verifyCurrentAppGuildAccess(
  config: AccountConfig,
  input: { appId: string; discordId: string },
): Promise<boolean> {
  const guildIds = await listAppGuildIds(config, input.appId);
  if (guildIds.length === 0) {
    return false;
  }
  let hasActiveMembership = false;
  for (const guildId of guildIds) {
    const active = await fetchCurrentGuildMembership(config, {
      discordId: input.discordId,
      guildId,
    });
    await upsertUserGuildMembership(config, {
      discordId: input.discordId,
      guildId,
      status: active ? "active" : "left",
    });
    hasActiveMembership = hasActiveMembership || active;
  }
  return hasActiveMembership;
}

async function listAppGuildIds(
  config: AccountConfig,
  appId: string,
): Promise<string[]> {
  const { results } = await config.database
    .prepare(
      `SELECT guild_id
      FROM app_guild_access
      WHERE app_id = ?
      ORDER BY guild_id ASC`,
    )
    .bind(appId)
    .all<{ guild_id: string }>();
  return results
    .map((row) => row.guild_id)
    .filter((guildId) => typeof guildId === "string");
}

async function fetchCurrentGuildMembership(
  config: AccountConfig,
  input: { discordId: string; guildId: string },
): Promise<boolean> {
  const response = await fetch(
    `${config.discord.apiBase}/guilds/${input.guildId}/members/${input.discordId}`,
    { headers: { authorization: `Bot ${config.discord.botToken}` } },
  );
  if (response.status === 200) {
    return true;
  }
  if (response.status === 404) {
    return false;
  }
  throw new Error("guild_check_failed");
}

function accessFromRow(row: AppGuildAccessRow): AppGuildAccessRecord | null {
  if (typeof row.app_id !== "string" || typeof row.guild_id !== "string") {
    return null;
  }
  return {
    appId: row.app_id,
    guildId: row.guild_id,
  };
}
