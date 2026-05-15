import { randomBase64Url } from "../../../../src/crypto.js";
import {
  createCookie,
  createSessionCookie,
  deleteCookie,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
} from "../../../../src/session.js";
import type { AccountConfig } from "../accountConfig.js";
import { createRememberToken } from "../data/rememberTokens.js";
import { hashToken, type User } from "../domain/user.js";
import { noStoreHeaders } from "../views/pages/accountLandingPage.js";

export const accountSessionMaxAgeSeconds = 1_800;
export const persistentAccountSessionMaxAgeSeconds = 86_400;
export const rememberMaxAgeSeconds = 15_552_000;

export async function createAccountSessionResponse(
  user: User,
  input: {
    config: AccountConfig;
    rememberMe: boolean;
    returnTo: string;
  },
): Promise<Response> {
  const now = nowSeconds();
  const headers = new Headers({ location: input.returnTo });
  headers.append(
    "set-cookie",
    await createAccountSessionCookie(user, input.config, {
      persistent: input.rememberMe,
    }),
  );
  if (input.rememberMe) {
    headers.append(
      "set-cookie",
      await createRememberCookie(user, input.config, now),
    );
  } else {
    headers.append("set-cookie", deleteCookie(rememberCookieName));
  }
  return new Response(null, { status: 302, headers });
}

export async function createAccountSessionCookie(
  user: Pick<
    User,
    "discord_id" | "display_name" | "icon_key" | "icon_source" | "role"
  >,
  config: AccountConfig,
  options: { persistent: boolean } = { persistent: true },
): Promise<string> {
  const now = nowSeconds();
  const maxAgeSeconds = options.persistent
    ? persistentAccountSessionMaxAgeSeconds
    : accountSessionMaxAgeSeconds;
  const session = await signSessionCookie(
    {
      discord_id: user.discord_id,
      role: user.role,
      display_name: user.display_name,
      icon_key: user.icon_key,
      icon_source: user.icon_source,
      persistent: options.persistent,
      iat: now,
      exp: now + maxAgeSeconds,
      kid: config.session.kid,
    },
    config.session.secret,
  );
  if (options.persistent) {
    return createCookie(sessionCookieName, session, maxAgeSeconds);
  }
  return createSessionCookie(sessionCookieName, session);
}

export async function createRememberCookie(
  user: Pick<User, "discord_id">,
  config: AccountConfig,
  now: number,
): Promise<string> {
  return await createRememberCookieWithToken({
    config,
    now,
    tokenId: randomBase64Url(16),
    user,
  });
}

async function createRememberCookieWithToken(input: {
  config: AccountConfig;
  now: number;
  tokenId: string;
  user: Pick<User, "discord_id">;
}): Promise<string> {
  const randomToken = randomBase64Url(32);
  await createRememberToken(input.config, {
    discordId: input.user.discord_id,
    tokenId: input.tokenId,
    tokenHash: await hashToken(randomToken),
    expiresAt: input.now + rememberMaxAgeSeconds,
  });
  return createCookie(
    rememberCookieName,
    `${input.tokenId}.${randomToken}`,
    rememberMaxAgeSeconds,
  );
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function clearAccountCookiesAndRedirect(redirectUrl: string): Response {
  const headers = noStoreHeaders();
  headers.set("location", redirectUrl);
  headers.append("set-cookie", deleteCookie(sessionCookieName));
  headers.append("set-cookie", deleteCookie(rememberCookieName));
  return new Response(null, { status: 302, headers });
}
