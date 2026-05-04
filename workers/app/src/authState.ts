import {
  hmacSha256Base64Url,
  randomBase64Url,
} from "../../../shared/src/crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "../../../shared/src/encoding.js";

export function appAuthStateCookieName(appId: string): string {
  return `__Host-${appId}_auth_state`;
}

export async function createAppAuthState(input: {
  secret: string;
}): Promise<string> {
  const payload = base64UrlEncodeText(
    JSON.stringify({
      nonce: randomBase64Url(16),
      exp: Date.now() + 600_000,
    }),
  );
  const signature = await hmacSha256Base64Url(input.secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAppAuthState(input: {
  value: string | null;
  expected: string | null;
  secret: string;
}): Promise<boolean> {
  if (!input.value || input.value !== input.expected) {
    return false;
  }
  const parts = input.value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return false;
  }
  const expectedSignature = await hmacSha256Base64Url(input.secret, parts[0]);
  if (!timingSafeEqual(parts[1], expectedSignature)) {
    return false;
  }
  try {
    const parsed = JSON.parse(base64UrlDecodeText(parts[0])) as {
      exp?: unknown;
    };
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
