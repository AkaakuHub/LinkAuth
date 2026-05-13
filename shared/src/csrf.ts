import { hmacSha256Base64Url, randomBase64Url } from "./crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "./encoding.js";

export type CsrfAction = "profile" | "avatar" | "delete" | "logout" | "token";

type CsrfPayload = {
  typ: "csrf";
  discord_id: string;
  origin: string;
  action: CsrfAction;
  nonce: string;
  iat: number;
  exp: number;
  kid: string;
};

export async function createCsrfToken(input: {
  discordId: string;
  origin: string;
  action: CsrfAction;
  kid: string;
  secret: string;
  now: number;
}): Promise<string> {
  const header = base64UrlEncodeText(
    JSON.stringify({ alg: "HS256", typ: "csrf", kid: input.kid }),
  );
  const payload = base64UrlEncodeText(
    JSON.stringify({
      typ: "csrf",
      discord_id: input.discordId,
      origin: input.origin,
      action: input.action,
      nonce: randomBase64Url(16),
      iat: input.now,
      exp: input.now + 7_200,
      kid: input.kid,
    } satisfies CsrfPayload),
  );
  const signature = await hmacSha256Base64Url(
    input.secret,
    `${header}.${payload}`,
  );
  return `${header}.${payload}.${signature}`;
}

export async function verifyCsrfToken(input: {
  token: string | null;
  discordId: string;
  origin: string;
  action: CsrfAction;
  kid: string;
  secret: string;
  now: number;
}): Promise<boolean> {
  if (!input.token) {
    return false;
  }
  const parts = input.token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) {
    return false;
  }
  const expected = await hmacSha256Base64Url(
    input.secret,
    `${header}.${payload}`,
  );
  if (!timingSafeEqual(signature, expected)) {
    return false;
  }
  try {
    const parsed = JSON.parse(
      base64UrlDecodeText(payload),
    ) as Partial<CsrfPayload>;
    return (
      parsed.typ === "csrf" &&
      parsed.discord_id === input.discordId &&
      parsed.origin === input.origin &&
      parsed.action === input.action &&
      parsed.kid === input.kid &&
      typeof parsed.exp === "number" &&
      parsed.exp > input.now
    );
  } catch {
    return false;
  }
}
