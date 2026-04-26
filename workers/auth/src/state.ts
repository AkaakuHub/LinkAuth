import {
  hmacSha256Base64Url,
  randomBase64Url,
} from "../../../shared/src/crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "../../../shared/src/encoding.js";
import { normalizeReturnTo } from "../../shared/navigation.js";
import type { AuthConfig } from "./authConfig.js";

export type AuthState = {
  return_to: string;
};

export async function createAuthState(
  returnToValue: string | null,
  config: AuthConfig,
): Promise<string> {
  const returnTo = normalizeReturnTo(returnToValue, config.navigation);
  const statePayload = base64UrlEncodeText(
    JSON.stringify({
      nonce: randomBase64Url(16),
      return_to: returnTo,
      iat: Date.now(),
      exp: Date.now() + 600_000,
    }),
  );
  const stateSignature = await hmacSha256Base64Url(
    config.csrf.secret,
    statePayload,
  );
  return `${statePayload}.${stateSignature}`;
}

export async function parseAuthState(
  value: string | null,
  config: AuthConfig,
): Promise<AuthState | null> {
  if (!value) {
    return null;
  }
  try {
    const parts = value.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    const expectedSignature = await hmacSha256Base64Url(
      config.csrf.secret,
      parts[0],
    );
    if (!timingSafeEqual(parts[1], expectedSignature)) {
      return null;
    }
    const parsed = JSON.parse(base64UrlDecodeText(parts[0])) as {
      return_to?: string;
      exp?: number;
    };
    if (
      typeof parsed.return_to !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now()
    ) {
      return null;
    }
    return {
      return_to: normalizeReturnTo(parsed.return_to, config.navigation),
    };
  } catch {
    return null;
  }
}
