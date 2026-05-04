import { randomBase64Url, sha256Hex } from "../../shared/src/crypto.js";
import { createInternalHeaders } from "../../shared/src/internalSignature.js";

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

export class UserApiError extends Error {
  readonly status: number;
  readonly path: string;
  readonly reason: string;

  constructor(path: string, status: number, reason: string) {
    super(`user-api ${path} failed: ${status}: ${reason}`);
    this.name = "UserApiError";
    this.path = path;
    this.status = status;
    this.reason = reason;
  }
}

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
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
      },
      body: rawBody,
    });
  } catch {
    throw new UserApiError(path, 503, "fetch_failed");
  }
  if (!response.ok) {
    throw new UserApiError(
      path,
      response.status,
      await responseError(response),
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new UserApiError(path, 502, "invalid_json");
  }
}

export async function hashToken(value: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(value));
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : "unknown_error";
  } catch {
    return "unreadable_error";
  }
}
