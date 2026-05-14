import {
  hmacSha256Base64Url,
  randomBase64Url,
} from "../../../../src/crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "../../../../src/encoding.js";
import type { AccountConfig } from "../accountConfig.js";
import { normalizeReturnTo } from "../domain/navigation.js";

export type AuthState = {
  app_id?: string;
  return_to: string;
};

export const authStateCookieName = "__Host-org_auth_state";

export async function createAuthState(
  returnToValue: string | null,
  config: AccountConfig,
  appId?: string,
): Promise<string | null> {
  const returnTo = normalizeReturnTo(returnToValue, config.navigation);
  if (!returnTo) {
    return null;
  }
  const statePayload = base64UrlEncodeText(
    JSON.stringify({
      nonce: randomBase64Url(16),
      ...(appId ? { app_id: appId } : {}),
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
  config: AccountConfig,
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
      app_id?: unknown;
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
    if (parsed.app_id !== undefined && typeof parsed.app_id !== "string") {
      return null;
    }
    const returnTo = normalizeReturnTo(parsed.return_to, config.navigation);
    if (!returnTo) {
      return null;
    }
    return {
      ...(parsed.app_id ? { app_id: parsed.app_id } : {}),
      return_to: returnTo,
    };
  } catch {
    return null;
  }
}
