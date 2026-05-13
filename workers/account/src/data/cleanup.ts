import type { AccountConfig } from "../accountConfig.js";

const expiringTables = [
  "auth_codes",
  "otp_challenges",
  "otp_rate_limits",
  "remember_tokens",
] as const;

export async function cleanupExpiredAuthData(
  config: AccountConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<void> {
  for (const table of expiringTables) {
    await config.database
      .prepare(`DELETE FROM ${table} WHERE expires_at <= ?`)
      .bind(nowSeconds)
      .run();
  }
}
