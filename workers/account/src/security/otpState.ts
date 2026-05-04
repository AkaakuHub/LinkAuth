import { hmacSha256Base64Url } from "../../../../shared/src/crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "../../../../shared/src/encoding.js";
import type { AccountConfig } from "../accountConfig.js";

export const otpStateCookieName = "__Host-org_otp_state";

export async function createOtpState(
  challengeId: string,
  config: AccountConfig,
): Promise<string> {
  const payload = base64UrlEncodeText(
    JSON.stringify({
      challenge_id: challengeId,
      exp: Date.now() + 600_000,
    }),
  );
  const signature = await hmacSha256Base64Url(config.csrf.secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyOtpState(input: {
  challengeId: string;
  value: string | null;
  config: AccountConfig;
}): Promise<boolean> {
  if (!input.value) {
    return false;
  }
  const parts = input.value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  const expectedSignature = await hmacSha256Base64Url(
    input.config.csrf.secret,
    parts[0],
  );
  if (!timingSafeEqual(parts[1], expectedSignature)) {
    return false;
  }
  try {
    const parsed = JSON.parse(base64UrlDecodeText(parts[0])) as {
      challenge_id?: unknown;
      exp?: unknown;
    };
    return (
      parsed.challenge_id === input.challengeId &&
      typeof parsed.exp === "number" &&
      parsed.exp > Date.now()
    );
  } catch {
    return false;
  }
}
