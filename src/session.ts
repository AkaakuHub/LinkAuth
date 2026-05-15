import { hmacSha256Base64Url } from "./crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "./encoding.js";

export const sessionCookieName = "__Host-link_auth_session";
export const rememberCookieName = "__Host-link_auth_remember";

export type SessionPayload = {
  discord_id: string;
  app_id?: string;
  role: "user" | "admin";
  display_name: string;
  icon_source: "r2" | "none";
  icon_key: string | null;
  persistent?: boolean;
  iat: number;
  exp: number;
  kid: string;
};

type TokenHeader = {
  alg: "HS256";
  typ: "session";
  kid: string;
};

export async function signAuthToken(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  const header: TokenHeader = {
    alg: "HS256",
    typ: "session",
    kid: payload.kid,
  };
  const encodedHeader = base64UrlEncodeText(JSON.stringify(header));
  const encodedPayload = base64UrlEncodeText(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSha256Base64Url(secret, signingInput);
  return `${signingInput}.${signature}`;
}

export async function verifyAuthToken(
  value: string,
  secrets: Record<string, string>,
  now: number,
): Promise<SessionPayload | null> {
  const parts = value.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const encodedHeader = parts[0];
  const encodedPayload = parts[1];
  const signature = parts[2];
  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  try {
    const header = JSON.parse(
      base64UrlDecodeText(encodedHeader),
    ) as Partial<TokenHeader>;
    if (
      header.alg !== "HS256" ||
      header.typ !== "session" ||
      typeof header.kid !== "string"
    ) {
      return null;
    }

    const secret = secrets[header.kid];
    if (!secret) {
      return null;
    }
    const expectedSignature = await hmacSha256Base64Url(
      secret,
      `${encodedHeader}.${encodedPayload}`,
    );
    if (!timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(
      base64UrlDecodeText(encodedPayload),
    ) as Partial<SessionPayload>;
    if (
      typeof payload.discord_id !== "string" ||
      (payload.app_id !== undefined && typeof payload.app_id !== "string") ||
      (payload.role !== "user" && payload.role !== "admin") ||
      typeof payload.display_name !== "string" ||
      (payload.icon_source !== "r2" && payload.icon_source !== "none") ||
      (payload.icon_key !== null && typeof payload.icon_key !== "string") ||
      (payload.persistent !== undefined &&
        typeof payload.persistent !== "boolean") ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      payload.kid !== header.kid ||
      payload.exp <= now
    ) {
      return null;
    }

    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function signSessionCookie(
  payload: SessionPayload,
  secret: string,
): Promise<string> {
  return await signAuthToken(payload, secret);
}

export async function verifySessionCookie(
  value: string,
  secrets: Record<string, string>,
  now: number,
): Promise<SessionPayload | null> {
  return await verifyAuthToken(value, secrets, now);
}

export function appSessionCookieName(appId: string): string {
  return `__Host-${appId}_session`;
}

export function getSingleCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  const matches = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item.startsWith(`${name}=`));
  if (matches.length !== 1) {
    return null;
  }
  const match = matches[0];
  if (match === undefined) {
    return null;
  }
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function getBearerToken(
  authorizationHeader: string | null,
): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(authorizationHeader);
  return match?.[1] ?? null;
}

export function createCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
}

export function createSessionCookie(name: string, value: string): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ].join("; ");
}

export function deleteCookie(name: string): string {
  return [
    `${name}=`,
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ]
    .filter(Boolean)
    .join("; ");
}
