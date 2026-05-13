import { hmacSha256 } from "../../../../shared/src/crypto.js";
import { hexEncode, timingSafeEqual } from "../../../../shared/src/encoding.js";
import type { AccountConfig } from "../accountConfig.js";
import { DataConflictError, RateLimitedError } from "./errors.js";
import { requireDataNumber, requireDataString } from "./validation.js";

type OtpChallengeRow = {
  discord_id: string;
  app_id: string | null;
  return_to: string;
  otp_hash: string;
  expires_at: number;
};

type OtpRateLimitRow = {
  first_issued_at: number | null;
  second_issued_at: number | null;
};

const otpIssueLimit = 2;
const otpIssueWindowSeconds = 60;

export async function createOtpChallenge(
  config: AccountConfig,
  input: {
    challengeId: string;
    discordId: string;
    appId?: string;
    returnTo: string;
    otp: string;
    expiresAt: number;
  },
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const otp = validateOtp(input.otp);
  const challengeId = requireDataString(input.challengeId, "challenge_id");
  await consumeOtpIssueQuota(
    config,
    requireDataString(input.discordId, "discord_id"),
    challengeId,
    nowSeconds,
  );
  const result = await config.database
    .prepare(
      `INSERT OR IGNORE INTO otp_challenges (
        challenge_id, discord_id, app_id, return_to, otp_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      challengeId,
      requireDataString(input.discordId, "discord_id"),
      input.appId ?? null,
      validateReturnTo(input.returnTo),
      await hashOtp(config.internal.otpHashSecret, challengeId, otp),
      new Date().toISOString(),
      requireDataNumber(input.expiresAt, "expires_at"),
    )
    .run();
  if (result.meta.changes !== 1) {
    throw new DataConflictError("otp challenge already exists");
  }
}

export async function consumeOtpChallenge(
  config: AccountConfig,
  input: { challengeId: string; otp: string },
): Promise<{ discordId: string; appId?: string; returnTo: string } | null> {
  const otp = validateOtp(input.otp);
  const row = await config.database
    .prepare(
      `DELETE FROM otp_challenges
      WHERE challenge_id = ?
      RETURNING discord_id, app_id, return_to, otp_hash, expires_at`,
    )
    .bind(input.challengeId)
    .first<OtpChallengeRow>();
  if (
    !row ||
    typeof row.discord_id !== "string" ||
    (row.app_id !== null && typeof row.app_id !== "string") ||
    typeof row.return_to !== "string" ||
    typeof row.otp_hash !== "string" ||
    typeof row.expires_at !== "number" ||
    row.expires_at <= Math.floor(Date.now() / 1000) ||
    !timingSafeEqual(
      row.otp_hash,
      await hashOtp(config.internal.otpHashSecret, input.challengeId, otp),
    )
  ) {
    return null;
  }
  return {
    discordId: row.discord_id,
    ...(row.app_id ? { appId: row.app_id } : {}),
    returnTo: row.return_to,
  };
}

async function consumeOtpIssueQuota(
  config: AccountConfig,
  discordId: string,
  challengeId: string,
  nowSeconds: number,
): Promise<void> {
  const cutoffSeconds = nowSeconds - otpIssueWindowSeconds;
  for (let attempt = 0; attempt < otpIssueLimit; attempt += 1) {
    const item = await config.database
      .prepare(
        "SELECT first_issued_at, second_issued_at FROM otp_rate_limits WHERE discord_id = ?",
      )
      .bind(discordId)
      .first<OtpRateLimitRow>();
    if (countActiveOtpIssues(item, cutoffSeconds) >= otpIssueLimit) {
      throw new RateLimitedError("otp rate limited");
    }
    const slot = chooseOtpIssueSlot(item, cutoffSeconds);
    if (!slot) {
      throw new RateLimitedError("otp rate limited");
    }
    const result = await config.database
      .prepare(
        `INSERT INTO otp_rate_limits (
          discord_id, ${slot}_issued_at, ${slot}_challenge_id, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET
          ${slot}_issued_at = excluded.${slot}_issued_at,
          ${slot}_challenge_id = excluded.${slot}_challenge_id,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        WHERE ${slot}_issued_at IS NULL OR ${slot}_issued_at <= ?`,
      )
      .bind(
        discordId,
        nowSeconds,
        challengeId,
        new Date(nowSeconds * 1000).toISOString(),
        nowSeconds + otpIssueWindowSeconds,
        cutoffSeconds,
      )
      .run();
    if (result.meta.changes === 1) {
      return;
    }
  }
  throw new RateLimitedError("otp rate limited");
}

function countActiveOtpIssues(
  item: OtpRateLimitRow | null,
  cutoffSeconds: number,
): number {
  return [item?.first_issued_at, item?.second_issued_at].filter(
    (issuedAt) => typeof issuedAt === "number" && issuedAt > cutoffSeconds,
  ).length;
}

function chooseOtpIssueSlot(
  item: OtpRateLimitRow | null,
  cutoffSeconds: number,
): "first" | "second" | null {
  if (!isActiveOtpIssue(item?.first_issued_at, cutoffSeconds)) {
    return "first";
  }
  if (!isActiveOtpIssue(item?.second_issued_at, cutoffSeconds)) {
    return "second";
  }
  return null;
}

function isActiveOtpIssue(
  issuedAt: number | null | undefined,
  cutoffSeconds: number,
): boolean {
  return typeof issuedAt === "number" && issuedAt > cutoffSeconds;
}

async function hashOtp(
  secret: string,
  challengeId: string,
  otp: string,
): Promise<string> {
  return hexEncode(await hmacSha256(secret, `${challengeId}.${otp}`));
}

function validateOtp(value: string): string {
  if (!/^[0-9]{6}$/.test(value)) {
    throw new Error("invalid otp");
  }
  return value;
}

function validateReturnTo(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      throw new Error("invalid return_to");
    }
    return url.toString();
  } catch {
    throw new Error("invalid return_to");
  }
}
