import { spawn } from "node:child_process";

const discordId = requiredArgument(process.argv.slice(2), "--discord-id");
const nowIso = new Date().toISOString().replaceAll("'", "''");
const escapedDiscordId = discordId.replaceAll("'", "''");

await run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "org-auth",
  "--local",
  "--config",
  "workers/account/wrangler.toml",
]);

await run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "execute",
  "org-auth",
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
    updated_at = excluded.updated_at`,
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
