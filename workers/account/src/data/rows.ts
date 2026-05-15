import type { User } from "../domain/user.js";

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
  icon_source: "r2" | "none" | null;
  icon_key: string | null;
};

export function userFromRow(row: UserRow): User {
  return {
    discord_id: row.discord_id,
    ...(row.discord_username ? { discord_username: row.discord_username } : {}),
    display_name: row.display_name,
    role: row.role,
    status: row.status,
    ...(row.icon_source ? { icon_source: row.icon_source } : {}),
    ...(row.icon_key ? { icon_key: row.icon_key } : {}),
  };
}
