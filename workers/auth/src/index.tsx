import { IconBrandDiscord } from "@tabler/icons-react";
import { randomBase64Url } from "../../../shared/src/crypto.js";
import {
  createCookie,
  getSingleCookie,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { page } from "../../shared/html.js";
import { Card, LinkButton } from "../../shared/ui.js";
import { callUserApi, hashToken, type User } from "../../shared/user-api.js";
import { type AuthConfig, withAuthConfig } from "./auth-config.js";
import {
  fetchDiscordOAuthUser,
  redirectToDiscordAuthorize,
} from "./discord-oauth.js";
import { createAuthState, parseAuthState } from "./state.js";

export default withAuthConfig(handleAuthRequest);

async function handleAuthRequest(
  request: Request,
  config: AuthConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/login") {
    return login(url, config);
  }
  if (url.pathname === "/callback") {
    return callback(url, config);
  }
  if (url.pathname === "/me") {
    return me(request, config);
  }
  return page(
    "Auth",
    <div className="grid flex-1 place-items-center">
      <Card className="w-full max-w-lg">
        <p className="text-sm font-semibold text-primary">Auth</p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink">
          Discordで本人確認
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          Discordサーバー参加状態を確認して、アカウントページへ進みます。
        </p>
        <LinkButton className="mt-6" href="/login">
          <IconBrandDiscord aria-hidden size={20} />
          Discordでログイン
        </LinkButton>
      </Card>
    </div>,
  );
}

async function login(url: URL, config: AuthConfig): Promise<Response> {
  const state = await createAuthState(
    url.searchParams.get("return_to"),
    config,
  );
  return redirectToDiscordAuthorize(state, config);
}

async function callback(url: URL, config: AuthConfig): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = await parseAuthState(url.searchParams.get("state"), config);
  if (!code || !state) {
    return new Response("invalid callback", { status: 400 });
  }

  const discordUser = await fetchDiscordOAuthUser(code, config);
  if (!discordUser) {
    return new Response("oauth failed", { status: 401 });
  }
  const active = await callUserApi<{ user: User }>(
    config.userApi,
    "/users/verify-active",
    { discord_id: discordUser.id },
  );

  const now = Math.floor(Date.now() / 1000);
  const session = await signSessionCookie(
    {
      discord_id: active.user.discord_id,
      role: active.user.role,
      display_name: active.user.display_name,
      iat: now,
      exp: now + 86_400,
      kid: config.session.kid,
    },
    config.session.secret,
  );

  const tokenId = randomBase64Url(16);
  const randomToken = randomBase64Url(32);
  const rememberValue = `${tokenId}.${randomToken}`;
  await callUserApi(config.userApi, "/remember/create", {
    discord_id: active.user.discord_id,
    token_id: tokenId,
    token_hash: await hashToken(randomToken),
    expires_at: now + 15_552_000,
  });

  const headers = new Headers({ location: state.return_to });
  headers.append(
    "set-cookie",
    createCookie(sessionCookieName, session, 86_400, config.domainName),
  );
  headers.append(
    "set-cookie",
    createCookie(
      rememberCookieName,
      rememberValue,
      15_552_000,
      config.domainName,
    ),
  );
  return new Response(null, {
    status: 302,
    headers,
  });
}

async function me(request: Request, config: AuthConfig): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const session = getSingleCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );
  if (session) {
    const payload = await verifySessionCookie(
      session,
      { [config.session.kid]: config.session.secret },
      now,
    );
    if (payload) {
      const active = await callUserApi<{ user: User }>(
        config.userApi,
        "/users/verify-active",
        { discord_id: payload.discord_id },
      );
      return Response.json({ user: active.user });
    }
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
