import { timingSafeEqual } from "../../../../shared/src/encoding.js";
import type { User } from "../../../shared/user.js";
import type { AccountConfig } from "../accountConfig.js";
import { DataConflictError } from "./errors.js";
import { getActiveUser } from "./users.js";

type RememberTokenRow = {
  discord_id: string;
  token_hash: string;
  expires_at: number;
};

export async function createRememberToken(
  config: AccountConfig,
  input: {
    discordId: string;
    tokenId: string;
    tokenHash: string;
    expiresAt: number;
  },
): Promise<void> {
  const user = await getActiveUser(config, input.discordId, false);
  if (!user) {
    throw new DataConflictError("inactive user");
  }
  const result = await config.database
    .prepare(
      `INSERT OR IGNORE INTO remember_tokens (
        token_id, discord_id, token_hash, created_at, last_used_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.tokenId,
      input.discordId,
      input.tokenHash,
      new Date().toISOString(),
      new Date().toISOString(),
      input.expiresAt,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new DataConflictError("remember token already exists");
  }
}

export async function rotateRememberToken(
  config: AccountConfig,
  input: {
    tokenId: string;
    oldTokenHash: string;
    newTokenHash: string;
    expiresAt: number;
  },
): Promise<{ user: User } | null> {
  const row = await config.database
    .prepare(
      "SELECT discord_id, token_hash, expires_at FROM remember_tokens WHERE token_id = ?",
    )
    .bind(input.tokenId)
    .first<RememberTokenRow>();
  if (
    !row ||
    row.expires_at <= Math.floor(Date.now() / 1000) ||
    !timingSafeEqual(row.token_hash, input.oldTokenHash)
  ) {
    await deleteRememberToken(config, input.tokenId);
    return null;
  }
  const user = await getActiveUser(config, row.discord_id, true);
  if (!user) {
    return null;
  }
  const result = await config.database
    .prepare(
      `UPDATE remember_tokens
      SET token_hash = ?, last_used_at = ?, expires_at = ?
      WHERE token_id = ? AND token_hash = ?`,
    )
    .bind(
      input.newTokenHash,
      new Date().toISOString(),
      input.expiresAt,
      input.tokenId,
      input.oldTokenHash,
    )
    .run();
  return result.meta.changes === 1 ? { user } : null;
}

export async function deleteRememberToken(
  config: AccountConfig,
  tokenId: string,
): Promise<void> {
  await config.database
    .prepare("DELETE FROM remember_tokens WHERE token_id = ?")
    .bind(tokenId)
    .run();
}

export async function deleteAllRememberTokens(
  config: AccountConfig,
  discordId: string,
): Promise<void> {
  await config.database
    .prepare("DELETE FROM remember_tokens WHERE discord_id = ?")
    .bind(discordId)
    .run();
}
