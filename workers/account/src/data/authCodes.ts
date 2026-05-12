import type { User } from "../../../shared/user.js";
import type { AccountConfig } from "../accountConfig.js";
import { DataConflictError } from "./errors.js";

type AuthCodeRow = {
  app_id: string;
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  icon_source: "discord" | "r2" | "none" | null;
  icon_key: string | null;
  expires_at: number;
};

export async function createAuthCode(
  config: AccountConfig,
  input: {
    appId: string;
    code: string;
    expiresAt: number;
    user: Pick<User, "discord_id" | "display_name" | "role"> & {
      icon_source?: "discord" | "r2" | "none";
      icon_key?: string;
    };
  },
): Promise<void> {
  const result = await config.database
    .prepare(
      `INSERT OR IGNORE INTO auth_codes (
        code, app_id, discord_id, display_name, role, icon_source, icon_key,
        created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.code,
      input.appId,
      input.user.discord_id,
      input.user.display_name,
      input.user.role,
      input.user.icon_source ?? null,
      input.user.icon_key ?? null,
      new Date().toISOString(),
      input.expiresAt,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new DataConflictError("auth code already exists");
  }
}

export async function consumeAuthCode(
  config: AccountConfig,
  input: { appId: string; code: string },
): Promise<{ user: User } | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await config.database
    .prepare("SELECT * FROM auth_codes WHERE code = ?")
    .bind(input.code)
    .first<AuthCodeRow>();
  if (
    !row ||
    row.app_id !== input.appId ||
    row.expires_at <= now ||
    (row.role !== "user" && row.role !== "admin")
  ) {
    return null;
  }
  const deleted = await config.database
    .prepare(
      "DELETE FROM auth_codes WHERE code = ? AND app_id = ? AND expires_at > ?",
    )
    .bind(input.code, input.appId, now)
    .run();
  if (deleted.meta.changes !== 1) {
    return null;
  }
  return {
    user: {
      discord_id: row.discord_id,
      display_name: row.display_name,
      role: row.role,
      status: "active",
      ...(row.icon_source ? { icon_source: row.icon_source } : {}),
      ...(row.icon_key ? { icon_key: row.icon_key } : {}),
    },
  };
}
