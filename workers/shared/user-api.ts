import { randomBase64Url, sha256Hex } from "../../shared/src/crypto.js";
import { createInternalHeaders } from "../../shared/src/internal-signature.js";

export type User = {
  discord_id: string;
  discord_username?: string;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "disabled" | "deleted";
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
  created_at?: string;
};

export type UserApiConfig = {
  USER_API_URL: string;
  INTERNAL_HMAC_KID: string;
  INTERNAL_HMAC_SECRET: string;
};

export async function callUserApi<T>(
  config: UserApiConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = new URL(path, config.USER_API_URL);
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  const headers = await createInternalHeaders({
    method: "POST",
    path: url.pathname,
    query: url.searchParams,
    body: rawBody,
    kid: config.INTERNAL_HMAC_KID,
    secret: config.INTERNAL_HMAC_SECRET,
    nonce: randomBase64Url(16),
    timestamp: new Date().toISOString(),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
    },
    body: rawBody,
  });
  if (!response.ok) {
    throw new Error(`user-api ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function hashToken(value: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(value));
}
