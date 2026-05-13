import { env as cloudflareEnv } from "cloudflare:test";
import { beforeEach, expect, test, vi } from "vitest";
import { hmacSha256, sha256Hex } from "../../shared/src/crypto.js";
import { hexEncode } from "../../shared/src/encoding.js";
import { loadAccountConfig } from "../../workers/account/src/accountConfig.js";
import {
  consumeAuthCode,
  createAuthCode,
} from "../../workers/account/src/data/authCodes.js";
import { cleanupExpiredAuthData } from "../../workers/account/src/data/cleanup.js";
import {
  consumeOtpChallenge,
  createOtpChallenge,
} from "../../workers/account/src/data/otpChallenges.js";
import {
  createPersonalAccessToken,
  deleteAllPersonalAccessTokens,
  listPersonalAccessTokens,
  revokePersonalAccessToken,
  verifyPersonalAccessToken,
} from "../../workers/account/src/data/personalAccessTokens.js";
import {
  createRememberToken,
  deleteAllRememberTokens,
  rotateRememberToken,
} from "../../workers/account/src/data/rememberTokens.js";
import {
  d1DropSchemaStatements,
  d1SchemaStatements,
} from "../../workers/account/src/data/schema.js";
import {
  getActiveUser,
  registerDiscordUser,
  updateUserAvatar,
  updateUserProfile,
} from "../../workers/account/src/data/users.js";
import type { Env } from "../../workers/account/src/types.js";

const assets = {} as R2Bucket;
const env: Env = {
  ACCOUNT_URL: "https://auth.example.com",
  ASSETS: assets,
  AUTH_APPS: JSON.stringify([
    {
      app_id: "hub",
      callback_url: "https://app.example.com/_auth/callback",
      session_verify_secret: "app-session-secret",
    },
  ]),
  CSRF_HMAC_SECRET: "csrf-secret",
  CSRF_KID: "csrf-key",
  DISCORD_BOT_TOKEN: "discord-bot-token",
  DISCORD_CLIENT_ID: "discord-client-id",
  DISCORD_CLIENT_SECRET: "discord-client-secret",
  DISCORD_PUBLIC_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  DISCORD_GUILD_IDS: "guild",
  DOMAIN_NAME: "example.com",
  DB: cloudflareEnv.DB,
  OTP_HMAC_SECRET: "otp-secret",
  SESSION_HMAC_SECRET: "session-secret",
  SESSION_KID: "session-key",
};

beforeEach(async () => {
  vi.useRealTimers();
  await resetDatabase();
  await seedUser({ discordId: "123456789" });
});

test("Auth code can be consumed once by the same app before expiration", async () => {
  await createAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
    expiresAt: nowSeconds() + 300,
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      icon_key: "icons/123456789/avatar.webp",
      icon_source: "r2",
      role: "admin",
    },
  });

  const firstResult = await consumeAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
  });
  const secondResult = await consumeAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
  });

  expect(firstResult).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      icon_key: "icons/123456789/avatar.webp",
      icon_source: "r2",
      role: "admin",
    },
  });
  expect(secondResult).toBeNull();
});

test("Auth code rejects a different app_id without consuming the code", async () => {
  await createAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
    expiresAt: nowSeconds() + 300,
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
  });

  const wrongAppResult = await consumeAuthCode(testAccountConfig(), {
    appId: "other",
    code: "auth-code",
  });
  const correctAppResult = await consumeAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
  });

  expect(wrongAppResult).toBeNull();
  expect(correctAppResult).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
  });
});

test("Auth code rejects expired codes", async () => {
  await createAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
    expiresAt: nowSeconds() - 1,
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
  });

  const result = await consumeAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "auth-code",
  });

  expect(result).toBeNull();
});

test("Auth code rejects corrupt non-numeric expiration values", async () => {
  await seedCorruptAuthCode("bad-expiration");

  const result = await consumeAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "bad-expiration",
  });

  expect(result).toBeNull();
});

test("OTP challenge accepts the correct six digit code once before expiration", async () => {
  await createOtpChallenge(testAccountConfig(), {
    appId: "hub",
    challengeId: "challenge",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/_auth/callback",
  });
  const storedHash = await readOtpHash("challenge");

  const firstResult = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    otp: "123456",
  });
  const secondResult = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    otp: "123456",
  });

  expect(storedHash).toBe(
    hexEncode(await hmacSha256("otp-secret", "challenge.123456")),
  );
  expect(storedHash).not.toBe(
    await sha256Hex(new TextEncoder().encode("123456")),
  );
  expect(firstResult).toEqual({
    appId: "hub",
    discordId: "123456789",
    returnTo: "https://app.example.com/_auth/callback",
  });
  expect(secondResult).toBeNull();
});

test("OTP challenge rejects a wrong code and consumes the challenge", async () => {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });

  const wrongResult = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    otp: "654321",
  });
  const correctResult = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    otp: "123456",
  });

  expect(wrongResult).toBeNull();
  expect(correctResult).toBeNull();
});

test("OTP challenge rejects expired challenges", async () => {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    discordId: "123456789",
    expiresAt: nowSeconds() - 1,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });

  const result = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    otp: "123456",
  });

  expect(result).toBeNull();
});

test("OTP challenge rejects malformed codes at consumption without consuming the challenge", async () => {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });

  await expect(
    consumeOtpChallenge(testAccountConfig(), {
      challengeId: "challenge",
      otp: "abcdef",
    }),
  ).rejects.toThrow("invalid otp");

  expect(
    await consumeOtpChallenge(testAccountConfig(), {
      challengeId: "challenge",
      otp: "123456",
    }),
  ).toEqual({
    discordId: "123456789",
    returnTo: "https://app.example.com/",
  });
});

test("OTP challenge rejects corrupt non-numeric expiration values", async () => {
  await seedCorruptOtpChallenge("bad-expiration");

  const result = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "bad-expiration",
    otp: "123456",
  });

  expect(result).toBeNull();
  expect(await readOtpHash("bad-expiration")).toBeNull();
});

test("OTP challenge rejects malformed codes at creation", async () => {
  await expect(
    createOtpChallenge(testAccountConfig(), {
      challengeId: "challenge",
      discordId: "123456789",
      expiresAt: nowSeconds() + 300,
      otp: "abcdef",
      returnTo: "https://app.example.com/",
    }),
  ).rejects.toThrow("invalid otp");
});

test("OTP challenge rejects credentialed return_to values at creation", async () => {
  await expect(
    createOtpChallenge(testAccountConfig(), {
      challengeId: "challenge",
      discordId: "123456789",
      expiresAt: nowSeconds() + 300,
      otp: "123456",
      returnTo: "https://user:pass@app.example.com/",
    }),
  ).rejects.toThrow("invalid return_to");
});

test("OTP challenge rejects malformed return_to values at creation", async () => {
  await expect(
    createOtpChallenge(testAccountConfig(), {
      challengeId: "challenge",
      discordId: "123456789",
      expiresAt: nowSeconds() + 300,
      otp: "123456",
      returnTo: "not-a-url",
    }),
  ).rejects.toThrow("invalid return_to");
});

test("OTP challenge allows two issues for the same user per minute", async () => {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-1",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-2",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });

  await expect(
    createOtpChallenge(testAccountConfig(), {
      challengeId: "challenge-3",
      discordId: "123456789",
      expiresAt: nowSeconds() + 300,
      otp: "123456",
      returnTo: "https://app.example.com/",
    }),
  ).rejects.toThrow("otp rate limited");
});

test("OTP challenge rate limit is per user", async () => {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-1",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-2",
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-3",
    discordId: "987654321",
    expiresAt: nowSeconds() + 300,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });

  const result = await consumeOtpChallenge(testAccountConfig(), {
    challengeId: "challenge-3",
    otp: "123456",
  });

  expect(result).toEqual({
    discordId: "987654321",
    returnTo: "https://app.example.com/",
  });
});

test("Remember token rotates when the stored hash matches", async () => {
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    tokenHash: "old-hash",
    tokenId: "remember-id",
  });

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "old-hash",
    tokenId: "remember-id",
  });

  expect(result).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
      status: "active",
    },
  });
  expect(await readRememberTokenHash("remember-id")).toBe("new-hash");
});

test("Remember token rejects and deletes a mismatched token", async () => {
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    tokenHash: "old-hash",
    tokenId: "remember-id",
  });

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "wrong-hash",
    tokenId: "remember-id",
  });

  expect(result).toBeNull();
  expect(await readRememberTokenHash("remember-id")).toBeNull();
});

test("Remember token rejects disabled users", async () => {
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    tokenHash: "old-hash",
    tokenId: "remember-id",
  });
  await setUserStatus("123456789", "disabled", "manual");

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "old-hash",
    tokenId: "remember-id",
  });

  expect(result).toBeNull();
});

test("Remember token rejects users that left the Discord guild", async () => {
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: nowSeconds() + 300,
    tokenHash: "old-hash",
    tokenId: "remember-id",
  });
  await setUserStatus("123456789", "disabled", "left_guild");
  vi.stubGlobal("fetch", async () => {
    return Response.json({ error: "not_found" }, { status: 404 });
  });

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "old-hash",
    tokenId: "remember-id",
  });

  expect(result).toBeNull();
  expect(await readRememberTokenHash("remember-id")).toBe("old-hash");
});

test("Remember token creation rejects inactive users", async () => {
  await setUserStatus("123456789", "deleted", null);

  await expect(
    createRememberToken(testAccountConfig(), {
      discordId: "123456789",
      expiresAt: nowSeconds() + 300,
      tokenHash: "old-hash",
      tokenId: "remember-id",
    }),
  ).rejects.toThrow("inactive user");
});

test("Remember token rejects and deletes expired tokens", async () => {
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: nowSeconds() - 1,
    tokenHash: "old-hash",
    tokenId: "remember-id",
  });

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "old-hash",
    tokenId: "remember-id",
  });

  expect(result).toBeNull();
  expect(await readRememberTokenHash("remember-id")).toBeNull();
});

test("Remember token rejects non-numeric expiration values and deletes the token", async () => {
  await seedCorruptRememberToken("remember-id", "123456789", "old-hash");

  const result = await rotateRememberToken(testAccountConfig(), {
    expiresAt: nowSeconds() + 600,
    newTokenHash: "new-hash",
    oldTokenHash: "old-hash",
    tokenId: "remember-id",
  });

  expect(result).toBeNull();
  expect(await readRememberTokenHash("remember-id")).toBeNull();
});

test("Remember token delete-all removes only remember tokens for the user", async () => {
  await seedRememberToken("one", "123456789", "hash-one");
  await seedRememberToken("two", "123456789", "hash-two");
  await seedRememberToken("other", "other", "hash-other");

  await deleteAllRememberTokens(testAccountConfig(), "123456789");

  expect(await readRememberTokenHash("one")).toBeNull();
  expect(await readRememberTokenHash("two")).toBeNull();
  expect(await readRememberTokenHash("other")).toBe("hash-other");
  expect(await readUserStatus("123456789")).toBe("active");
});

test("Personal access token verifies from the raw bearer value", async () => {
  const { token, record } = await createPersonalAccessToken(
    testAccountConfig(),
    {
      discordId: "123456789",
      name: "local curl",
      nowSeconds: nowSeconds(),
    },
  );

  const result = await verifyPersonalAccessToken(testAccountConfig(), {
    token,
    scope: "session:verify",
  });

  expect(record.name).toBe("local curl");
  expect(result?.user.discord_id).toBe("123456789");
  expect(await readPersonalAccessTokenHash(record.tokenId)).not.toBe(token);
  expect(await readPersonalAccessTokenLastUsedAt(record.tokenId)).toBeTruthy();
});

test("Personal access token rejects tampered raw values", async () => {
  const { token } = await createPersonalAccessToken(testAccountConfig(), {
    discordId: "123456789",
    name: "local curl",
  });

  const result = await verifyPersonalAccessToken(testAccountConfig(), {
    token: `${token.slice(0, -1)}x`,
    scope: "session:verify",
  });

  expect(result).toBeNull();
});

test("Personal access token rejects revoked values", async () => {
  const { token, record } = await createPersonalAccessToken(
    testAccountConfig(),
    {
      discordId: "123456789",
      name: "local curl",
    },
  );
  await revokePersonalAccessToken(testAccountConfig(), {
    discordId: "123456789",
    tokenId: record.tokenId,
  });

  const result = await verifyPersonalAccessToken(testAccountConfig(), {
    token,
    scope: "session:verify",
  });

  expect(result).toBeNull();
});

test("Personal access token delete-all removes only tokens for the user", async () => {
  const own = await createPersonalAccessToken(testAccountConfig(), {
    discordId: "123456789",
    name: "own",
  });
  await seedUser({ discordId: "987654321" });
  const other = await createPersonalAccessToken(testAccountConfig(), {
    discordId: "987654321",
    name: "other",
  });

  await deleteAllPersonalAccessTokens(testAccountConfig(), "123456789");

  expect(await readPersonalAccessTokenHash(own.record.tokenId)).toBeNull();
  expect(await readPersonalAccessTokenHash(other.record.tokenId)).toBeTruthy();
});

test("Personal access token list excludes corrupt scope rows", async () => {
  await seedPersonalAccessToken("pat-id", "123456789", "bad-hash", "not-json");

  expect(
    await listPersonalAccessTokens(testAccountConfig(), "123456789"),
  ).toEqual([]);
});

test("Active user verification reports Discord availability failures", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("discord unavailable");
  });

  await expect(
    getActiveUser(testAccountConfig(), "123456789", "current"),
  ).rejects.toThrow("discord_unavailable");
});

test("Profile update rejects inactive users at the data boundary", async () => {
  await setUserStatus("123456789", "disabled", "manual");

  await expect(
    updateUserProfile(testAccountConfig(), {
      discordId: "123456789",
      displayName: "Current Akaaku",
    }),
  ).rejects.toThrow("inactive user");

  expect(await readUserDisplayName("123456789")).toBe("Akaaku");
});

test("Avatar update rejects inactive users at the data boundary", async () => {
  await setUserStatus("123456789", "deleted", null);

  await expect(
    updateUserAvatar(testAccountConfig(), {
      discordId: "123456789",
      iconKey: "icons/123456789/avatar.webp",
      iconSource: "r2",
    }),
  ).rejects.toThrow("inactive user");

  expect(await readUserIconKey("123456789")).toBeNull();
});

test("Discord registration replaces existing user state like the old PutCommand", async () => {
  await setUserForRegistrationReplacement();

  await registerDiscordUser(testAccountConfig(), {
    avatarHash: "avatar-hash",
    discordId: "123456789",
    discordUsername: "DiscordUser",
    displayName: "Registered User",
    guildId: "guild",
  });

  expect(await readUserForRegistrationReplacement("123456789")).toEqual({
    deleted_at: null,
    disabled_reason: null,
    discord_avatar_hash: "avatar-hash",
    discord_username: "DiscordUser",
    display_name: "Registered User",
    guild_id: "guild",
    guild_member_status: "active",
    icon_key: null,
    icon_source: "discord",
    role: "user",
    status: "active",
  });
});

test("Expired auth data cleanup removes only expired transient records", async () => {
  const now = nowSeconds();
  await createAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "expired-code",
    expiresAt: now - 1,
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
  });
  await createAuthCode(testAccountConfig(), {
    appId: "hub",
    code: "fresh-code",
    expiresAt: now + 300,
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "user",
    },
  });
  await createOtpChallenge(testAccountConfig(), {
    challengeId: "expired-otp",
    discordId: "123456789",
    expiresAt: now - 1,
    otp: "123456",
    returnTo: "https://app.example.com/",
  });
  await createRememberToken(testAccountConfig(), {
    discordId: "123456789",
    expiresAt: now - 1,
    tokenHash: "expired-hash",
    tokenId: "expired-remember",
  });
  await seedPersonalAccessToken(
    "expired-pat",
    "123456789",
    "expired-hash",
    JSON.stringify(["session:verify"]),
    now - 1,
  );

  await cleanupExpiredAuthData(testAccountConfig(), now);

  expect(await readAuthCode("expired-code")).toBeNull();
  expect(await readAuthCode("fresh-code")).toBe("fresh-code");
  expect(await readOtpHash("expired-otp")).toBeNull();
  expect(await readRememberTokenHash("expired-remember")).toBeNull();
  expect(await readPersonalAccessTokenHash("expired-pat")).toBeNull();
});

function testAccountConfig() {
  return loadAccountConfig(env);
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function resetDatabase(): Promise<void> {
  for (const statement of d1DropSchemaStatements) {
    await env.DB.prepare(statement).run();
  }
  for (const statement of d1SchemaStatements) {
    await env.DB.prepare(statement).run();
  }
}

async function seedUser(input: {
  discordId: string;
  displayName?: string;
  status?: "active" | "disabled" | "deleted";
  disabledReason?: string | null;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (
      discord_id, display_name, role, status, guild_id, guild_member_status,
      guild_checked_at, disabled_reason, created_at, updated_at
    ) VALUES (?, ?, 'admin', ?, 'guild', 'active', ?, ?, ?, ?)`,
  )
    .bind(
      input.discordId,
      input.displayName ?? "Akaaku",
      input.status ?? "active",
      nowIso,
      input.disabledReason ?? null,
      nowIso,
      nowIso,
    )
    .run();
}

async function setUserStatus(
  discordId: string,
  status: "active" | "disabled" | "deleted",
  disabledReason: string | null,
): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET status = ?, disabled_reason = ? WHERE discord_id = ?",
  )
    .bind(status, disabledReason, discordId)
    .run();
}

async function seedCorruptAuthCode(code: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO auth_codes (
      code, app_id, discord_id, display_name, role, created_at, expires_at
    ) VALUES (?, 'hub', '123456789', 'Akaaku', 'user', ?, ?)`,
  )
    .bind(code, new Date().toISOString(), "bad-expiration")
    .run();
}

async function seedCorruptOtpChallenge(challengeId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO otp_challenges (
      challenge_id, discord_id, return_to, otp_hash, created_at, expires_at
    ) VALUES (?, '123456789', 'https://app.example.com/', ?, ?, ?)`,
  )
    .bind(
      challengeId,
      hexEncode(await hmacSha256("otp-secret", `${challengeId}.123456`)),
      new Date().toISOString(),
      "bad-expiration",
    )
    .run();
}

async function seedRememberToken(
  tokenId: string,
  discordId: string,
  tokenHash: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO remember_tokens (
      token_id, discord_id, token_hash, created_at, last_used_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(tokenId, discordId, tokenHash, nowIso, nowIso, nowSeconds() + 300)
    .run();
}

async function seedCorruptRememberToken(
  tokenId: string,
  discordId: string,
  tokenHash: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO remember_tokens (
      token_id, discord_id, token_hash, created_at, last_used_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(tokenId, discordId, tokenHash, nowIso, nowIso, "bad-expiration")
    .run();
}

async function seedPersonalAccessToken(
  tokenId: string,
  discordId: string,
  tokenHash: string,
  scopes: string,
  expiresAt = nowSeconds() + 300,
): Promise<void> {
  const nowIso = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO personal_access_tokens (
      token_id, discord_id, name, token_hash, scopes, created_at, last_used_at,
      expires_at, revoked_at
    ) VALUES (?, ?, 'test', ?, ?, ?, NULL, ?, NULL)`,
  )
    .bind(tokenId, discordId, tokenHash, scopes, nowIso, expiresAt)
    .run();
}

async function setUserForRegistrationReplacement(): Promise<void> {
  await env.DB.prepare(
    `UPDATE users SET
      discord_username = 'OldUser',
      display_name = 'Deleted Admin',
      role = 'admin',
      status = 'deleted',
      guild_id = 'old-guild',
      guild_member_status = 'left',
      disabled_reason = 'manual',
      icon_source = 'none',
      icon_key = 'icons/123456789/avatar.webp',
      discord_avatar_hash = NULL,
      created_at = '2000-01-01T00:00:00.000Z',
      deleted_at = ?
    WHERE discord_id = '123456789'`,
  )
    .bind(new Date().toISOString())
    .run();
}

async function readUserForRegistrationReplacement(
  discordId: string,
): Promise<Record<string, string | null> | null> {
  return await env.DB.prepare(
    `SELECT
      deleted_at,
      disabled_reason,
      discord_avatar_hash,
      discord_username,
      display_name,
      guild_id,
      guild_member_status,
      icon_key,
      icon_source,
      role,
      status
    FROM users WHERE discord_id = ?`,
  )
    .bind(discordId)
    .first<Record<string, string | null>>();
}

async function readOtpHash(challengeId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT otp_hash FROM otp_challenges WHERE challenge_id = ?",
  )
    .bind(challengeId)
    .first<{ otp_hash: string }>();
  return row?.otp_hash ?? null;
}

async function readRememberTokenHash(tokenId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT token_hash FROM remember_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ token_hash: string }>();
  return row?.token_hash ?? null;
}

async function readPersonalAccessTokenHash(
  tokenId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT token_hash FROM personal_access_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ token_hash: string }>();
  return row?.token_hash ?? null;
}

async function readPersonalAccessTokenLastUsedAt(
  tokenId: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT last_used_at FROM personal_access_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ last_used_at: string | null }>();
  return row?.last_used_at ?? null;
}

async function readUserStatus(discordId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT status FROM users WHERE discord_id = ?",
  )
    .bind(discordId)
    .first<{ status: string }>();
  return row?.status ?? null;
}

async function readUserDisplayName(discordId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT display_name FROM users WHERE discord_id = ?",
  )
    .bind(discordId)
    .first<{ display_name: string }>();
  return row?.display_name ?? null;
}

async function readUserIconKey(discordId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    "SELECT icon_key FROM users WHERE discord_id = ?",
  )
    .bind(discordId)
    .first<{ icon_key: string | null }>();
  return row?.icon_key ?? null;
}

async function readAuthCode(code: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT code FROM auth_codes WHERE code = ?")
    .bind(code)
    .first<{ code: string }>();
  return row?.code ?? null;
}
