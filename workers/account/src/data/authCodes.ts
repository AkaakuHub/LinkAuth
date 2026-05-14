import type { AccountConfig } from "../accountConfig.js";
import type { User } from "../domain/user.js";
import { DataConflictError } from "./errors.js";
import { requireDataNumber, requireDataString } from "./validation.js";

type AuthCodeUser = Pick<User, "discord_id" | "display_name" | "role"> & {
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
};

type AuthCodeRow = {
  app_id: string;
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  icon_source: "discord" | "r2" | "none" | null;
  icon_key: string | null;
  session_persistent: number;
  expires_at: number;
};

export async function createAuthCode(
  config: AccountConfig,
  input: {
    appId: string;
    code: string;
    expiresAt: number;
    sessionPersistent: boolean;
    user: AuthCodeUser;
  },
): Promise<void> {
  const result = await config.database
    .prepare(
      `INSERT OR IGNORE INTO auth_codes (
        code, app_id, discord_id, display_name, role, icon_source, icon_key,
        session_persistent, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      requireDataString(input.code, "code"),
      requireDataString(input.appId, "app_id"),
      requireDataString(input.user.discord_id, "discord_id"),
      requireDataString(input.user.display_name, "display_name"),
      input.user.role,
      input.user.icon_source ?? null,
      input.user.icon_key ?? null,
      input.sessionPersistent ? 1 : 0,
      new Date().toISOString(),
      requireDataNumber(input.expiresAt, "expires_at"),
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new DataConflictError("auth code already exists");
  }
}

export async function consumeAuthCode(
  config: AccountConfig,
  input: { appId: string; code: string },
): Promise<{ session_persistent: boolean; user: AuthCodeUser } | null> {
  const now = Math.floor(Date.now() / 1000);
  const row = await config.database
    .prepare("SELECT * FROM auth_codes WHERE code = ?")
    .bind(input.code)
    .first<AuthCodeRow>();
  if (
    !row ||
    row.app_id !== input.appId ||
    typeof row.discord_id !== "string" ||
    typeof row.display_name !== "string" ||
    typeof row.expires_at !== "number" ||
    row.expires_at <= now ||
    (row.role !== "user" && row.role !== "admin") ||
    (row.icon_source !== null &&
      row.icon_source !== "discord" &&
      row.icon_source !== "r2" &&
      row.icon_source !== "none") ||
    (row.icon_key !== null && typeof row.icon_key !== "string") ||
    (row.session_persistent !== 0 && row.session_persistent !== 1)
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
    session_persistent: row.session_persistent === 1,
    user: {
      discord_id: row.discord_id,
      display_name: row.display_name,
      role: row.role,
      ...(row.icon_source ? { icon_source: row.icon_source } : {}),
      ...(row.icon_key ? { icon_key: row.icon_key } : {}),
    },
  };
}
