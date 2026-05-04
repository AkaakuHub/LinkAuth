import { randomBase64Url } from "../../../../shared/src/crypto.js";
import {
  createCookie,
  deleteCookie,
  getSingleCookie,
  rememberCookieName,
  sessionCookieName,
  verifySessionCookie,
} from "../../../../shared/src/session.js";
import {
  callUserApi,
  hashToken,
  UserApiError,
} from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";
import {
  createAccountSessionCookie,
  nowSeconds,
  rememberMaxAgeSeconds,
} from "../services/accountSessionCookie.js";

export async function requireSession(
  request: Request,
  config: AccountConfig,
): Promise<{ discord_id: string; setCookies: string[] } | null> {
  const value = getSingleCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );
  const session = value
    ? await verifySessionCookie(
        value,
        { [config.session.kid]: config.session.secret },
        nowSeconds(),
      )
    : null;
  if (session) {
    return { ...session, setCookies: [] };
  }
  return await restoreRememberSession(request, config);
}

export function appendSessionCookies(
  response: Response,
  session: { setCookies: string[] },
): Response {
  if (session.setCookies.length === 0) {
    return response;
  }
  const headers = new Headers(response.headers);
  for (const cookie of session.setCookies) {
    headers.append("set-cookie", cookie);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function appendRememberCookieDeletion(
  request: Request,
  response: Response,
): Response {
  if (!getSingleCookie(request.headers.get("cookie"), rememberCookieName)) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.append("set-cookie", deleteCookie(rememberCookieName));
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

async function restoreRememberSession(
  request: Request,
  config: AccountConfig,
): Promise<{ discord_id: string; setCookies: string[] } | null> {
  const remember = parseRememberCookie(
    getSingleCookie(request.headers.get("cookie"), rememberCookieName),
  );
  if (!remember) {
    return null;
  }
  const randomToken = randomBase64Url(32);
  const now = nowSeconds();
  try {
    const result = await callUserApi<{
      user: {
        discord_id: string;
        display_name: string;
        role: "user" | "admin";
      };
    }>(config.userApi, "/remember/rotate", {
      token_id: remember.tokenId,
      old_token_hash: await hashToken(remember.randomToken),
      new_token_hash: await hashToken(randomToken),
      expires_at: now + rememberMaxAgeSeconds,
    });
    return {
      discord_id: result.user.discord_id,
      setCookies: [
        await createAccountSessionCookie(result.user, config),
        createRememberCookie(remember.tokenId, randomToken),
      ],
    };
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

function parseRememberCookie(
  value: string | null,
): { tokenId: string; randomToken: string } | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { tokenId: parts[0], randomToken: parts[1] };
}

function createRememberCookie(tokenId: string, randomToken: string): string {
  return createCookie(
    rememberCookieName,
    `${tokenId}.${randomToken}`,
    rememberMaxAgeSeconds,
  );
}
