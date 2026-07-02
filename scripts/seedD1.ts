import { spawn } from "node:child_process";
import { readLocalEnvFile } from "./env.js";

const discordId = requiredArgument(process.argv.slice(2), "--discord-id");
const localEnv = await readLocalEnvFile();
const appIds = authAppIds(requiredEnv(localEnv, "AUTH_APPS"));
const guildIds = commaSeparated(requiredEnv(localEnv, "DISCORD_GUILD_IDS"));
const nowIso = new Date().toISOString().replaceAll("'", "''");
const escapedDiscordId = discordId.replaceAll("'", "''");
const membershipSql = guildIds
  .map((guildId) => {
    const escapedGuildId = guildId.replaceAll("'", "''");
    return `INSERT INTO user_guild_memberships (
      discord_id, guild_id, status, checked_at, created_at, updated_at
    ) VALUES (
      '${escapedDiscordId}', '${escapedGuildId}', 'active', '${nowIso}', '${nowIso}', '${nowIso}'
    )
    ON CONFLICT(discord_id, guild_id) DO UPDATE SET
      status = 'active',
      checked_at = excluded.checked_at,
      updated_at = excluded.updated_at;`;
  })
  .join("\n");
const accessSql = appIds
  .flatMap((appId) =>
    guildIds.map((guildId) => {
      const escapedAppId = appId.replaceAll("'", "''");
      const escapedGuildId = guildId.replaceAll("'", "''");
      return `INSERT INTO app_guild_access (
        app_id, guild_id, created_by_discord_id, created_at, updated_at
      ) VALUES (
        '${escapedAppId}', '${escapedGuildId}', '${escapedDiscordId}', '${nowIso}', '${nowIso}'
      )
      ON CONFLICT(app_id, guild_id) DO UPDATE SET
        updated_at = excluded.updated_at;`;
    }),
  )
  .join("\n");

await run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "link-auth",
  "--local",
  "--config",
  "workers/account/wrangler.toml",
]);

await run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "execute",
  "link-auth",
  "--local",
  "--config",
  "workers/account/wrangler.toml",
  "--command",
  `INSERT INTO users (
    discord_id, discord_username, display_name, role, status, guild_member_status,
    guild_checked_at, icon_source, created_at, updated_at
  ) VALUES (
    '${escapedDiscordId}', '', 'Akaaku', 'admin', 'active', 'active',
    '${nowIso}', 'none', '${nowIso}', '${nowIso}'
  )
  ON CONFLICT(discord_id) DO UPDATE SET
    status = 'active',
    role = 'admin',
    guild_member_status = 'active',
    guild_checked_at = excluded.guild_checked_at,
    updated_at = excluded.updated_at;
  ${membershipSql}
  ${accessSql}`,
]);

console.log("Seeded local D1 user");

function requiredArgument(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? null : args[index + 1];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredEnv(env: Map<string, string>, name: string): string {
  const value = env.get(name);
  if (!value) {
    throw new Error(`${name} is required in .env.local`);
  }
  return value;
}

function authAppIds(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_APPS must be an array");
  }
  return parsed.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("AUTH_APPS item is invalid");
    }
    const appId = (item as Record<string, unknown>).app_id;
    if (typeof appId !== "string" || !appId) {
      throw new Error("AUTH_APPS item is invalid");
    }
    return appId;
  });
}

function commaSeparated(value: string): string[] {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error("DISCORD_GUILD_IDS is empty");
  }
  return values;
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "null"}`));
    });
  });
}
