import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  hmacSha256Base64Url,
  randomBase64Url,
  timingSafeEqual,
} from "link-auth";

export function appAuthStateCookieName(appId: string): string {
  return `__Host-${appId}_auth_state`;
}

export async function createAppAuthState(input: {
  returnTo: string;
  secret: string;
}): Promise<string> {
  const payload = base64UrlEncodeText(
    JSON.stringify({
      nonce: randomBase64Url(16),
      exp: Date.now() + 600_000,
      return_to: input.returnTo,
    }),
  );
  const signature = await hmacSha256Base64Url(input.secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAppAuthState(input: {
  value: string | null;
  expected: string | null;
  secret: string;
}): Promise<{ return_to: string } | null> {
  if (!input.value || input.value !== input.expected) {
    return null;
  }
  const parts = input.value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const expectedSignature = await hmacSha256Base64Url(input.secret, parts[0]);
  if (!timingSafeEqual(parts[1], expectedSignature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecodeText(parts[0])) as {
      exp?: unknown;
      return_to?: unknown;
    };
    if (
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now() ||
      typeof parsed.return_to !== "string"
    ) {
      return null;
    }
    return { return_to: parsed.return_to };
  } catch {
    return null;
  }
}
