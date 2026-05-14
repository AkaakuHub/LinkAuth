import { randomBase64Url, sha256Hex } from "../../../../shared/src/crypto.js";
import { timingSafeEqual } from "../../../../shared/src/encoding.js";
import type { User } from "../../../shared/user.js";
import type { AccountConfig } from "../accountConfig.js";
import { DataConflictError } from "./errors.js";
import { getActiveUser } from "./users.js";
import { requireDataString } from "./validation.js";

const tokenPrefix = "lka_pat";
const tokenLifetimeSeconds = 90 * 24 * 60 * 60;
const allowedScopes = ["session:verify"] as const;
const expirationOptions = ["90d", "none"] as const;

export type PersonalAccessTokenScope = (typeof allowedScopes)[number];
export type PersonalAccessTokenExpiration = (typeof expirationOptions)[number];

export type PersonalAccessTokenRecord = {
  tokenId: string;
  name: string;
  scopes: PersonalAccessTokenScope[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: number | null;
  revokedAt: string | null;
};

type PersonalAccessTokenRow = {
  token_id: string;
  discord_id: string;
  name: string;
  token_hash: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: number | null;
  revoked_at: string | null;
};

export async function createPersonalAccessToken(
  config: AccountConfig,
  input: {
    discordId: string;
    name: string;
    expiration: PersonalAccessTokenExpiration;
    nowSeconds?: number;
  },
): Promise<{ token: string; record: PersonalAccessTokenRecord }> {
  const user = await getActiveUser(config, input.discordId, false);
  if (!user) {
    throw new DataConflictError("inactive user");
  }
  const tokenId = randomBase64Url(18);
  const secret = randomBase64Url(32);
  const token = `${tokenPrefix}_${tokenId}.${secret}`;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const nowIso = new Date(now * 1000).toISOString();
  const expiresAt =
    input.expiration === "90d" ? now + tokenLifetimeSeconds : null;
  const scopes: PersonalAccessTokenScope[] = ["session:verify"];
  const result = await config.database
    .prepare(
      `INSERT OR IGNORE INTO personal_access_tokens (
        token_id, discord_id, name, token_hash, scopes, created_at, last_used_at,
        expires_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)`,
    )
    .bind(
      requireDataString(tokenId, "token_id"),
      requireDataString(input.discordId, "discord_id"),
      requireDataString(input.name, "name"),
      await hashPersonalAccessToken(token),
      JSON.stringify(scopes),
      nowIso,
      expiresAt,
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new DataConflictError("personal access token already exists");
  }
  return {
    token,
    record: {
      tokenId,
      name: input.name,
      scopes,
      createdAt: nowIso,
      lastUsedAt: null,
      expiresAt,
      revokedAt: null,
    },
  };
}

export async function listPersonalAccessTokens(
  config: AccountConfig,
  discordId: string,
): Promise<PersonalAccessTokenRecord[]> {
  const { results } = await config.database
    .prepare(
      `SELECT token_id, discord_id, name, token_hash, scopes, created_at,
        last_used_at, expires_at, revoked_at
      FROM personal_access_tokens
      WHERE discord_id = ?
      ORDER BY created_at DESC`,
    )
    .bind(discordId)
    .all<PersonalAccessTokenRow>();
  return results.map(tokenFromRow).filter((token) => token !== null);
}

export async function revokePersonalAccessToken(
  config: AccountConfig,
  input: { discordId: string; tokenId: string },
): Promise<void> {
  await config.database
    .prepare(
      `UPDATE personal_access_tokens
      SET revoked_at = ?
      WHERE token_id = ? AND discord_id = ? AND revoked_at IS NULL`,
    )
    .bind(new Date().toISOString(), input.tokenId, input.discordId)
    .run();
}

export async function deleteAllPersonalAccessTokens(
  config: AccountConfig,
  discordId: string,
): Promise<void> {
  await config.database
    .prepare("DELETE FROM personal_access_tokens WHERE discord_id = ?")
    .bind(discordId)
    .run();
}

export async function verifyPersonalAccessToken(
  config: AccountConfig,
  input: {
    token: string;
    scope: PersonalAccessTokenScope;
  },
): Promise<{ user: User; record: PersonalAccessTokenRecord } | null> {
  const tokenId = parsePersonalAccessTokenId(input.token);
  if (!tokenId) {
    return null;
  }
  const row = await config.database
    .prepare(
      `SELECT token_id, discord_id, name, token_hash, scopes, created_at,
        last_used_at, expires_at, revoked_at
      FROM personal_access_tokens
      WHERE token_id = ?`,
    )
    .bind(tokenId)
    .first<PersonalAccessTokenRow>();
  const tokenHash = await hashPersonalAccessToken(input.token);
  if (
    !row ||
    typeof row.token_hash !== "string" ||
    !timingSafeEqual(row.token_hash, tokenHash)
  ) {
    return null;
  }
  const record = tokenFromRow(row);
  if (
    !record ||
    record.revokedAt !== null ||
    (record.expiresAt !== null &&
      record.expiresAt <= Math.floor(Date.now() / 1000)) ||
    !record.scopes.includes(input.scope)
  ) {
    return null;
  }
  const user = await getPersonalAccessTokenUser(config, row.discord_id);
  if (!user) {
    return null;
  }
  await config.database
    .prepare(
      "UPDATE personal_access_tokens SET last_used_at = ? WHERE token_id = ?",
    )
    .bind(new Date().toISOString(), row.token_id)
    .run();
  return { user, record };
}

export function normalizePersonalAccessTokenName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 40) {
    return null;
  }
  return name;
}

export function normalizePersonalAccessTokenExpiration(
  value: string,
): PersonalAccessTokenExpiration | null {
  return expirationOptions.find((option) => option === value) ?? null;
}

function parsePersonalAccessTokenId(token: string): string | null {
  const match = /^lka_pat_([A-Za-z0-9_-]{24})\.[A-Za-z0-9_-]{43}$/.exec(token);
  return match?.[1] ?? null;
}

async function hashPersonalAccessToken(token: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(token));
}

function tokenFromRow(
  row: PersonalAccessTokenRow,
): PersonalAccessTokenRecord | null {
  const scopes = parseScopes(row.scopes);
  if (
    typeof row.token_id !== "string" ||
    typeof row.name !== "string" ||
    typeof row.created_at !== "string" ||
    (row.expires_at !== null && typeof row.expires_at !== "number") ||
    scopes === null ||
    (row.last_used_at !== null && typeof row.last_used_at !== "string") ||
    (row.revoked_at !== null && typeof row.revoked_at !== "string")
  ) {
    return null;
  }
  return {
    tokenId: row.token_id,
    name: row.name,
    scopes,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function parseScopes(value: string): PersonalAccessTokenScope[] | null {
  try {
    const scopes = JSON.parse(value) as unknown;
    if (
      !Array.isArray(scopes) ||
      !scopes.every((scope) =>
        allowedScopes.some((allowed) => allowed === scope),
      )
    ) {
      return null;
    }
    return scopes;
  } catch {
    return null;
  }
}

async function getPersonalAccessTokenUser(
  config: AccountConfig,
  discordId: string,
): Promise<User | null> {
  try {
    return await getActiveUser(config, discordId, true);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "left_guild" ||
        error.message === "guild_check_failed" ||
        error.message === "discord_unavailable")
    ) {
      return null;
    }
    throw error;
  }
}
