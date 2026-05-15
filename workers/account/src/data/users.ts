import type { AccountConfig } from "../accountConfig.js";
import type { User } from "../domain/user.js";
import { InactiveUserError } from "./errors.js";
import { userFromRow } from "./rows.js";

type MembershipResult = "active" | "left" | "unavailable" | "failed";

type UserRow = {
  discord_id: string;
  discord_username: string | null;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "disabled" | "deleted";
  guild_id: string | null;
  guild_member_status: "active" | "left" | null;
  guild_checked_at: string | null;
  disabled_reason: string | null;
  icon_source: "r2" | "none";
  icon_key: string | null;
  created_at: string | null;
};

export async function getActiveUser(
  config: AccountConfig,
  discordId: string,
  checkGuild: boolean | "current",
): Promise<User | null> {
  const row = await config.database
    .prepare("SELECT * FROM users WHERE discord_id = ?")
    .bind(discordId)
    .first<UserRow>();
  if (!row || row.status === "deleted") {
    return null;
  }
  if (row.status === "disabled" && row.disabled_reason !== "left_guild") {
    return null;
  }
  if (row.status === "disabled" && !checkGuild) {
    return null;
  }
  if (checkGuild) {
    await verifyGuildMembership(
      config,
      row,
      row.status === "disabled" || checkGuild === "current",
    );
  }
  if (row.status !== "active" && row.disabled_reason !== "left_guild") {
    return null;
  }
  return userFromRow(row);
}

export async function updateUserProfile(
  config: AccountConfig,
  input: { discordId: string; displayName: string },
): Promise<void> {
  await requireActiveUser(config, input.discordId);
  await config.database
    .prepare(
      "UPDATE users SET display_name = ?, updated_at = ? WHERE discord_id = ?",
    )
    .bind(input.displayName, new Date().toISOString(), input.discordId)
    .run();
}

export async function updateUserAvatar(
  config: AccountConfig,
  input: {
    discordId: string;
    iconKey: string;
  },
): Promise<void> {
  await requireActiveUser(config, input.discordId);
  await config.database
    .prepare(
      "UPDATE users SET icon_source = ?, icon_key = ?, updated_at = ? WHERE discord_id = ?",
    )
    .bind("r2", input.iconKey, new Date().toISOString(), input.discordId)
    .run();
}

async function requireActiveUser(
  config: AccountConfig,
  discordId: string,
): Promise<User> {
  const user = await getActiveUser(config, discordId, true);
  if (!user) {
    throw new InactiveUserError();
  }
  return user;
}

export async function markUserDeleted(
  config: AccountConfig,
  discordId: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await config.database
    .prepare(
      "UPDATE users SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE discord_id = ?",
    )
    .bind(nowIso, nowIso, discordId)
    .run();
}

export async function ensureGuildMemberUser(
  config: AccountConfig,
  input: {
    discordId: string;
    discordUsername: string;
    displayName: string;
    guildId: string;
  },
): Promise<void> {
  const nowIso = new Date().toISOString();
  await config.database
    .prepare(
      `INSERT INTO users (
        discord_id, discord_username, display_name, role, status, guild_id,
        guild_member_status, guild_checked_at, icon_source,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'user', 'active', ?, 'active', ?, 'none', ?, ?)
      ON CONFLICT(discord_id) DO UPDATE SET
        discord_username = excluded.discord_username,
        status = 'active',
        guild_id = excluded.guild_id,
        guild_member_status = 'active',
        guild_checked_at = excluded.guild_checked_at,
        icon_source = CASE
          WHEN users.icon_source = 'r2' THEN users.icon_source
          ELSE excluded.icon_source
        END,
        icon_key = CASE
          WHEN users.icon_source = 'r2' THEN users.icon_key
          ELSE NULL
        END,
        deleted_at = NULL,
        disabled_reason = NULL,
        updated_at = excluded.updated_at`,
    )
    .bind(
      input.discordId,
      input.discordUsername,
      input.displayName,
      input.guildId,
      nowIso,
      nowIso,
      nowIso,
    )
    .run();
}

async function verifyGuildMembership(
  config: AccountConfig,
  user: UserRow,
  forceCurrent: boolean,
): Promise<void> {
  const checkedAt = user.guild_checked_at
    ? Date.parse(user.guild_checked_at)
    : 0;
  if (
    !forceCurrent &&
    user.guild_member_status === "active" &&
    Number.isFinite(checkedAt) &&
    Date.now() - checkedAt <= 600_000
  ) {
    return;
  }
  const membership = await fetchActiveGuildMember(config, user.discord_id);
  const nowIso = new Date().toISOString();
  if (membership === "active") {
    await config.database
      .prepare(
        "UPDATE users SET status = 'active', guild_member_status = 'active', guild_checked_at = ?, disabled_reason = NULL WHERE discord_id = ?",
      )
      .bind(nowIso, user.discord_id)
      .run();
    user.status = "active";
    user.disabled_reason = null;
    return;
  }
  if (membership === "left") {
    await config.database
      .prepare(
        "UPDATE users SET guild_member_status = 'left', guild_checked_at = ? WHERE discord_id = ?",
      )
      .bind(nowIso, user.discord_id)
      .run();
    user.guild_member_status = "left";
    throw new Error("left_guild");
  }
  if (membership === "unavailable") {
    throw new Error("discord_unavailable");
  }
  throw new Error("guild_check_failed");
}

async function fetchActiveGuildMember(
  config: AccountConfig,
  discordId: string,
): Promise<MembershipResult> {
  let foundMissingMember = false;
  for (const guildId of config.discord.guildIds) {
    let response: Response;
    try {
      response = await fetch(
        `${config.discord.apiBase}/guilds/${guildId}/members/${discordId}`,
        { headers: { authorization: `Bot ${config.discord.botToken}` } },
      );
    } catch {
      return "unavailable";
    }
    if (response.status === 200) {
      return "active";
    }
    if (response.status === 404) {
      foundMissingMember = true;
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      return "unavailable";
    }
    return "failed";
  }
  return foundMissingMember ? "left" : "failed";
}
