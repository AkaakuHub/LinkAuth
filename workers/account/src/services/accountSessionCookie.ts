import { randomBase64Url } from "../../../../shared/src/crypto.js";
import {
  createCookie,
  deleteCookie,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
} from "../../../../shared/src/session.js";
import { callUserApi, hashToken, type User } from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";
import { noStoreHeaders } from "../views/accountLandingPage.js";

export async function createAccountSessionResponse(
  user: User,
  input: {
    config: AccountConfig;
    rememberMe: boolean;
    returnTo: string;
  },
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const session = await signSessionCookie(
    {
      discord_id: user.discord_id,
      role: user.role,
      display_name: user.display_name,
      iat: now,
      exp: now + 86_400,
      kid: input.config.session.kid,
    },
    input.config.session.secret,
  );

  const headers = new Headers({ location: input.returnTo });
  headers.append(
    "set-cookie",
    createCookie(sessionCookieName, session, 86_400, input.config.domainName),
  );
  if (input.rememberMe) {
    const tokenId = randomBase64Url(16);
    const randomToken = randomBase64Url(32);
    const rememberValue = `${tokenId}.${randomToken}`;
    await callUserApi(input.config.userApi, "/remember/create", {
      discord_id: user.discord_id,
      token_id: tokenId,
      token_hash: await hashToken(randomToken),
      expires_at: now + 15_552_000,
    });
    headers.append(
      "set-cookie",
      createCookie(
        rememberCookieName,
        rememberValue,
        15_552_000,
        input.config.domainName,
      ),
    );
  } else {
    headers.append(
      "set-cookie",
      deleteCookie(rememberCookieName, input.config.domainName),
    );
  }
  return new Response(null, { status: 302, headers });
}

export function clearAccountCookiesAndRedirect(
  config: AccountConfig,
  redirectUrl: string,
): Response {
  const headers = noStoreHeaders();
  headers.set("location", redirectUrl);
  headers.append(
    "set-cookie",
    deleteCookie(sessionCookieName, config.domainName),
  );
  headers.append(
    "set-cookie",
    deleteCookie(rememberCookieName, config.domainName),
  );
  return new Response(null, { status: 302, headers });
}
