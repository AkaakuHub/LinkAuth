import { randomBase64Url } from "../../../shared/src/crypto.js";
import {
  appSessionCookieName,
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
  fetchDiscordGuildMember,
  fetchDiscordOAuthResult,
  redirectToDiscordAuthorize,
} from "./discordOauth.js";
import { otpPage } from "./otpPage.js";
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
  if (url.pathname === "/authorize") {
    return authorize(request, url, config);
  }
  if (url.pathname === "/token" && request.method === "POST") {
    return token(request, config);
  }
  if (url.pathname === "/otp" && request.method === "POST") {
    return otp(request, config);
  }
  if (url.pathname === "/session/verify") {
    return sessionVerify(request, url, config);
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

async function authorize(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const appId = url.searchParams.get("app_id");
  const app = appId ? findApp(config, appId) : null;
  const returnTo = normalizeReturnTo(
    url.searchParams.get("return_to"),
    config.navigation,
  );
  if (!app || !returnTo || !sameUrl(returnTo, app.callbackUrl)) {
    return new Response("invalid authorize request", { status: 400 });
  }
  const session = await requireSession(request, config);
  if (!session) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("return_to", url.toString());
    return Response.redirect(loginUrl, 302);
  }
  const active = await verifyActiveUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }
  const code = randomBase64Url(32);
  await callUserApi(config.userApi, "/auth-code/create", {
    app_id: appId,
    code,
    user: {
      discord_id: active.user.discord_id,
      display_name: active.user.display_name,
      role: active.user.role,
    },
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const callbackUrl = new URL(returnTo);
  callbackUrl.searchParams.set("code", code);
  return Response.redirect(callbackUrl, 302);
}

async function token(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const appId = body.app_id;
  const code = body.code;
  if (typeof appId !== "string" || typeof code !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return Response.json(
      await callUserApi(config.userApi, "/auth-code/consume", {
        app_id: appId,
        code,
      }),
    );
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return Response.json({ error: "invalid_auth_code" }, { status: 401 });
    }
    throw error;
  }
}

async function callback(url: URL, config: AccountConfig): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = await parseAuthState(url.searchParams.get("state"), config);
  if (!code || !state) {
    return new Response("invalid callback", { status: 400 });
  }

  const discordResult = await fetchDiscordOAuthResult(code, config);
  if (!discordResult) {
    return new Response("oauth failed", { status: 401 });
  }
  const guildMember = await fetchDiscordGuildMember(
    discordResult.accessToken,
    config,
  );
  if (!guildMember) {
    return inactiveAccountPage(config);
  }
  const active = await getActiveUser(discordResult.user.id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }

  const challengeId = randomBase64Url(24);
  const otpCode = randomOtpCode();
  await callUserApi(config.userApi, "/otp-challenge/create", {
    challenge_id: challengeId,
    discord_id: active.user.discord_id,
    otp: otpCode,
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const otpResult = await sendOtp(active.user.discord_id, otpCode, config);
  if (!otpResult.ok) {
    return new Response(`otp send failed: ${otpResult.reason}`, {
      status: 502,
    });
  }
  return otpPage(challengeId, state.return_to);
}

async function otp(request: Request, config: AccountConfig): Promise<Response> {
  const form = await request.formData();
  const challengeId = String(form.get("challenge_id") ?? "");
  const otpCode = String(form.get("otp") ?? "");
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  try {
    const result = await callUserApi<{ discord_id: string }>(
      config.userApi,
      "/otp-challenge/consume",
      {
        challenge_id: challengeId,
        otp: otpCode,
      },
    );
    const active = await verifyActiveUser(result.discord_id, config);
    if (!active) {
      return inactiveAccountPage(config);
    }
    return await createAccountSessionResponse(active.user, returnTo, config);
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return new Response("invalid otp", { status: 401 });
    }
    throw error;
  }
}

async function sessionVerify(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const appId = url.searchParams.get("app_id");
  if (appId) {
    const app = findApp(config, appId);
    if (!app?.sessionVerifySecret) {
      return Response.json({ error: "unknown_app" }, { status: 403 });
    }
    const session = getSingleCookie(
      request.headers.get("cookie"),
      appSessionCookieName(app.appId),
    );
    const payload = session
      ? await verifySessionCookie(
          session,
          { [config.session.kid]: app.sessionVerifySecret },
          Math.floor(Date.now() / 1000),
        )
      : null;
    if (!payload || payload.app_id !== app.appId) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json({
      user: {
        discord_id: payload.discord_id,
        display_name: payload.display_name,
        role: payload.role,
      },
    });
  }
  const session = await requireSession(request, config);
  return session
    ? Response.json({ ok: true })
    : Response.json({ error: "unauthorized" }, { status: 401 });
}

async function createAccountSessionResponse(
  user: User,
  returnTo: string,
  config: AccountConfig,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  return await createSignedAccountSessionResponse(user, returnTo, config, now);
}

async function createSignedAccountSessionResponse(
  user: User,
  returnTo: string,
  config: AccountConfig,
  now: number,
): Promise<Response> {
  const session = await signSessionCookie(
    {
      discord_id: user.discord_id,
      role: user.role,
      display_name: user.display_name,
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
    discord_id: user.discord_id,
    token_id: tokenId,
    token_hash: await hashToken(randomToken),
    expires_at: now + 15_552_000,
  });

  const headers = new Headers({ location: returnTo });
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

async function sendOtp(
  discordId: string,
  otpCode: string,
  config: AccountConfig,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const channelResponse = await fetch(
    `${config.discord.apiBase}/users/@me/channels`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${config.discord.botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ recipient_id: discordId }),
    },
  );
  if (!channelResponse.ok) {
    return {
      ok: false,
      reason: await discordError("create_dm", channelResponse),
    };
  }
  const channel = (await channelResponse.json()) as { id?: unknown };
  if (typeof channel.id !== "string") {
    return { ok: false, reason: "create_dm returned no channel id" };
  }
  const messageResponse = await fetch(
    `${config.discord.apiBase}/channels/${channel.id}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${config.discord.botToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ content: `認証コード: ${otpCode}` }),
    },
  );
  if (!messageResponse.ok) {
    return {
      ok: false,
      reason: await discordError("send_dm", messageResponse),
    };
  }
  return { ok: true };
}

async function discordError(
  action: string,
  response: Response,
): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { code?: unknown; message?: unknown };
    if (parsed.code === 50278) {
      return `${action} ${response.status}: DISCORD_BOT_TOKENのBotが対象Discordサーバーに参加していません`;
    }
    if (typeof parsed.message === "string") {
      return `${action} ${response.status}: ${parsed.message}`;
    }
  } catch {
    return `${action} ${response.status}: ${body}`;
  }
  return `${action} ${response.status}: ${body}`;
}

function randomOtpCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const value =
    ((bytes[0] ?? 0) << 24) |
    ((bytes[1] ?? 0) << 16) |
    ((bytes[2] ?? 0) << 8) |
    (bytes[3] ?? 0);
  return String(Math.abs(value) % 1_000_000).padStart(6, "0");
}

function findApp(config: AccountConfig, appId: string) {
  return config.apps.find((app) => app.appId === appId) ?? null;
}

function sameUrl(left: string, right: string): boolean {
  try {
    const leftUrl = new URL(left);
    const rightUrl = new URL(right);
    return (
      leftUrl.origin === rightUrl.origin &&
      leftUrl.pathname === rightUrl.pathname
    );
  } catch {
    return false;
  }
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

async function getActiveUser(
  discordId: string,
  config: AccountConfig,
): Promise<{ user: User } | null> {
  try {
    return await callUserApi<{ user: User }>(config.userApi, "/users/get", {
      discord_id: discordId,
    });
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
