import { randomBase64Url } from "../../../shared/src/crypto.js";
import {
  createCookie,
  deleteCookie,
  getSingleCookie,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { normalizeReturnTo } from "../../shared/navigation.js";
import {
  callUserApi,
  hashToken,
  type User,
  UserApiError,
} from "../../shared/userApi.js";
import { accountClientScript } from "./accountClientGenerated.js";
import { type AccountConfig, withAccountConfig } from "./accountConfig.js";
import { inactiveAccountPage } from "./accountErrorPage.js";
import { accountLandingPage, noStoreHeaders } from "./accountLandingPage.js";
import { createAuthState, parseAuthState } from "./authState.js";
import { verifyFormCsrf, verifyHeaderCsrf } from "./csrf.js";
import {
  fetchDiscordOAuthUser,
  redirectToDiscordAuthorize,
} from "./discordOauth.js";
import { accountPage } from "./page.js";
import { requireSession } from "./session.js";
import { isWebp512 } from "./webp.js";

export default withAccountConfig(handleAccountRequest);

async function handleAccountRequest(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/account-client.js" && request.method === "GET") {
    return new Response(accountClientScript, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  }
  if (url.pathname.startsWith("/assets/")) {
    return asset(url, config);
  }
  if (url.pathname === "/login") {
    return login(url, config);
  }
  if (url.pathname === "/callback") {
    return callback(url, config);
  }
  if (url.pathname === "/me") {
    return me(request, config);
  }

  if (url.pathname === "/" && request.method === "GET") {
    const session = await requireSession(request, config);
    if (!session) {
      return accountLandingPage(config);
    }
    const active = await verifyActiveUser(session.discord_id, config);
    if (!active) {
      return inactiveAccountPage(config);
    }
    return accountPage(
      active.user,
      url,
      config,
      accountReturnTo(url.searchParams.get("return_to"), config),
    );
  }

  const session = await requireSession(request, config);
  if (!session) {
    return accountLandingPage(config);
  }
  if (url.pathname === "/profile" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "profile",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    const form = await request.formData();
    const returnTo = accountReturnTo(
      String(form.get("return_to") ?? ""),
      config,
    );
    await callUserApi(config.userApi, "/users/update-profile", {
      discord_id: session.discord_id,
      display_name: String(form.get("display_name") ?? ""),
      request_id: crypto.randomUUID(),
    });
    return redirectToAccountRoot(url, returnTo);
  }
  if (url.pathname === "/avatar" && request.method === "POST") {
    if (
      !(await verifyHeaderCsrf(
        request,
        url,
        config,
        session.discord_id,
        "avatar",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    if (request.headers.get("content-type") !== "image/webp") {
      return new Response("invalid content-type", { status: 400 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > 10 * 1024 * 1024 || !isWebp512(body)) {
      return new Response("invalid image", { status: 400 });
    }
    const iconKey = `icons/${session.discord_id}/avatar.webp`;
    await config.assets.put(iconKey, body, {
      httpMetadata: { contentType: "image/webp" },
    });
    await callUserApi(config.userApi, "/users/update-avatar", {
      discord_id: session.discord_id,
      icon_source: "r2",
      icon_key: iconKey,
      request_id: crypto.randomUUID(),
    });
    return Response.json({ ok: true });
  }
  if (url.pathname === "/delete" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "delete",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    const form = await request.formData();
    const returnTo = accountReturnTo(
      String(form.get("return_to") ?? ""),
      config,
    );
    await callUserApi(config.userApi, "/users/delete", {
      discord_id: session.discord_id,
      request_id: crypto.randomUUID(),
    });
    return clearCookiesAndRedirect(config, returnTo);
  }
  if (url.pathname === "/logout" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "logout",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    const remember = getSingleCookie(
      request.headers.get("cookie"),
      rememberCookieName,
    );
    const form = await request.formData();
    const returnTo = accountReturnTo(
      String(form.get("return_to") ?? ""),
      config,
    );
    const tokenId = remember?.split(".")[0];
    if (tokenId) {
      await callUserApi(config.userApi, "/remember/delete", {
        discord_id: session.discord_id,
        token_id: tokenId,
        request_id: crypto.randomUUID(),
      });
    }
    return clearCookiesAndRedirect(config, returnTo);
  }
  return new Response("not found", { status: 404 });
}

function accountReturnTo(value: string | null, config: AccountConfig): string {
  return (
    normalizeReturnTo(value, config.navigation) ?? config.navigation.ACCOUNT_URL
  );
}

function redirectToAccountRoot(requestUrl: URL, returnTo: string): Response {
  const url = new URL("/", requestUrl.origin);
  url.searchParams.set("return_to", returnTo);
  return Response.redirect(url, 303);
}

async function login(url: URL, config: AccountConfig): Promise<Response> {
  const state = await createAuthState(
    url.searchParams.get("return_to"),
    config,
  );
  if (!state) {
    return accountLandingPage(config);
  }
  return redirectToDiscordAuthorize(state, config);
}

async function callback(url: URL, config: AccountConfig): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = await parseAuthState(url.searchParams.get("state"), config);
  if (!code || !state) {
    return new Response("invalid callback", { status: 400 });
  }

  const discordUser = await fetchDiscordOAuthUser(code, config);
  if (!discordUser) {
    return new Response("oauth failed", { status: 401 });
  }
  const active = await verifyActiveUser(discordUser.id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }

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
  return new Response(null, { status: 302, headers });
}

async function me(request: Request, config: AccountConfig): Promise<Response> {
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
      const active = await verifyActiveUser(payload.discord_id, config);
      if (active) {
        return Response.json({ user: active.user });
      }
    }
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

async function verifyActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  try {
    return await callUserApi<{ user: User }>(
      config.userApi,
      "/users/verify-active",
      { discord_id: discordId },
    );
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
}

async function asset(url: URL, config: AccountConfig): Promise<Response> {
  const key = url.pathname.replace(/^\/assets\//, "");
  const object = await config.assets.get(key);
  if (!object) {
    return new Response("not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "content-type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
    },
  });
}

function clearCookiesAndRedirect(
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
