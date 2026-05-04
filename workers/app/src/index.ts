import { hmacSha256Base64Url } from "../../../shared/src/crypto.js";
import {
  appSessionCookieName,
  createCookie,
  deleteCookie,
  getSingleCookie,
  signSessionCookie,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { attr, escapeHtml, page } from "../../shared/html.js";
import { icon } from "../../shared/icons.js";
import { card, linkButton } from "../../shared/ui.js";
import { type AppConfig, withAppConfig } from "./appConfig.js";
import {
  appAuthStateCookieName,
  createAppAuthState,
  verifyAppAuthState,
} from "./authState.js";

export default withAppConfig(handleAppRequest);

async function handleAppRequest(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/_auth/callback" && request.method === "GET") {
    return authCallback(request, url, config);
  }

  const sessionCookie = appSessionCookieName(config.appId);
  const session = getSingleCookie(request.headers.get("cookie"), sessionCookie);
  const payload = session
    ? await verifySessionCookie(
        session,
        { [config.session.kid]: config.session.secret },
        Math.floor(Date.now() / 1000),
      )
    : null;
  if (!payload || payload.app_id !== config.appId) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return Response.redirect(new URL("/login", request.url), 302);
    }
    if (url.pathname === "/login" && request.method === "GET") {
      return loginPage(request);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      return startLogin(request, config);
    }
    return new Response("not found", { status: 404 });
  }
  if (url.pathname === "/api/me" && request.method === "GET") {
    return Response.json({
      user: {
        discord_id: payload.discord_id,
        display_name: payload.display_name,
        role: payload.role,
      },
    });
  }
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (url.pathname === "/login" && request.method === "GET") {
    return Response.redirect(new URL("/", request.url), 302);
  }
  if (url.pathname !== "/" || request.method !== "GET") {
    return new Response("not found", { status: 404 });
  }
  const accountUrl = new URL(config.accountUrl);
  accountUrl.searchParams.set(
    "return_to",
    new URL("/", request.url).toString(),
  );
  return page(
    "App",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-3"><p class="inline-flex items-center gap-2 text-sm font-semibold text-primary">${icon("apps")}App</p><div class="grid gap-1"><h1 class="text-3xl font-semibold leading-tight text-ink">appセッションが有効です</h1><p class="text-sm text-muted">${escapeHtml(payload.display_name)}としてこのappを利用できます。</p></div></div>${linkButton(
        {
          href: accountUrl.toString(),
          variant: "secondary",
          children: `${icon("settings")}アカウント管理`,
        },
      )}`,
    })}</div>`,
  );
}

function loginPage(request: Request): Response {
  return page(
    "App Login",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-3"><p class="inline-flex items-center gap-2 text-sm font-semibold text-primary">${icon("apps")}App</p><div class="grid gap-1"><h1 class="text-3xl font-semibold leading-tight text-ink">appにログイン</h1><p class="text-sm leading-7 text-muted">認証基盤で本人確認して、このapp用のセッションを発行します。</p></div></div><form action="/login" method="post"><input type="hidden" name="return_to"${attr("value", appReturnToUrl(request))}><button class="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" type="submit">${icon("login-2")}認証して続行</button></form>`,
    })}</div>`,
  );
}

async function startLogin(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const form = await request.formData();
  const returnTo = safeAppReturnTo(
    String(form.get("return_to") ?? ""),
    new URL("/", request.url),
  );
  const state = await createAppAuthState({
    returnTo,
    secret: config.session.secret,
  });
  const callbackUrl = new URL("/_auth/callback", request.url);
  callbackUrl.searchParams.set("state", state);
  const authorizeUrl = new URL("/authorize", config.navigation.AUTH_BASE_URL);
  authorizeUrl.searchParams.set("app_id", config.appId);
  authorizeUrl.searchParams.set("return_to", callbackUrl.toString());
  const headers = new Headers({ location: authorizeUrl.toString() });
  headers.append(
    "set-cookie",
    createCookie(appAuthStateCookieName(config.appId), state, 600),
  );
  return new Response(null, { headers, status: 302 });
}

async function authCallback(
  request: Request,
  url: URL,
  config: AppConfig,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = getSingleCookie(
    request.headers.get("cookie"),
    appAuthStateCookieName(config.appId),
  );
  const appState = await verifyAppAuthState({
    expected: state,
    secret: config.session.secret,
    value: cookieState,
  });
  if (!code || !appState) {
    return clearAppAuthState(appAuthFailedPage(url), config);
  }
  const tokenUrl = new URL("/token", config.navigation.AUTH_BASE_URL);
  const rawBody = JSON.stringify({ app_id: config.appId, code });
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-app-token-signature": await hmacSha256Base64Url(
          config.session.secret,
          `${config.appId}.${code}`,
        ),
      },
      body: rawBody,
    });
  } catch {
    return clearAppAuthState(appAuthFailedPage(url), config);
  }
  if (!response.ok) {
    return clearAppAuthState(appAuthFailedPage(url), config);
  }
  const body = await parseTokenResponse(response);
  if (!body) {
    return clearAppAuthState(appAuthFailedPage(url), config);
  }
  const user = body.user;
  if (
    !user ||
    typeof user.discord_id !== "string" ||
    typeof user.display_name !== "string" ||
    (user.role !== "user" && user.role !== "admin")
  ) {
    return clearAppAuthState(appAuthFailedPage(url), config);
  }
  const now = Math.floor(Date.now() / 1000);
  const session = await signSessionCookie(
    {
      discord_id: user.discord_id,
      app_id: config.appId,
      role: user.role,
      display_name: user.display_name,
      iat: now,
      exp: now + 3_600,
      kid: config.session.kid,
    },
    config.session.secret,
  );
  const headers = new Headers({
    location: safeAppReturnTo(appState.return_to, new URL("/", url.origin)),
  });
  headers.append(
    "set-cookie",
    createCookie(appSessionCookieName(config.appId), session, 3_600),
  );
  headers.append(
    "set-cookie",
    deleteCookie(appAuthStateCookieName(config.appId)),
  );
  return new Response(null, { status: 302, headers });
}

async function parseTokenResponse(response: Response): Promise<{
  user?: {
    discord_id?: unknown;
    display_name?: unknown;
    role?: unknown;
  };
} | null> {
  try {
    return (await response.json()) as {
      user?: {
        discord_id?: unknown;
        display_name?: unknown;
        role?: unknown;
      };
    };
  } catch {
    return null;
  }
}

function clearAppAuthState(response: Response, config: AppConfig): Response {
  const headers = new Headers(response.headers);
  headers.append(
    "set-cookie",
    deleteCookie(appAuthStateCookieName(config.appId)),
  );
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function appAuthFailedPage(url: URL): Response {
  return page(
    "App認証に失敗しました",
    `<div class="grid flex-1 place-items-center">${card({
      className: "grid w-full max-w-lg gap-5",
      children: `<div class="grid gap-2"><p class="inline-flex items-center gap-2 text-sm font-semibold text-danger">${icon("alert-triangle")}認証できません</p><h1 class="text-3xl font-semibold leading-tight text-ink">app認証に失敗しました</h1><p class="text-sm leading-7 text-muted">認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。</p></div>${linkButton(
        {
          href: new URL("/login", url.origin).toString(),
          variant: "secondary",
          children: `${icon("home")}ログイン画面へ戻る`,
        },
      )}`,
    })}</div>`,
    401,
  );
}

function appReturnToUrl(request: Request): string {
  return new URL("/", request.url).toString();
}

function safeAppReturnTo(value: string, defaultUrl: URL): string {
  try {
    const returnTo = new URL(value);
    if (
      returnTo.origin !== defaultUrl.origin ||
      returnTo.username ||
      returnTo.password
    ) {
      return defaultUrl.toString();
    }
    returnTo.hash = "";
    return returnTo.toString();
  } catch {
    return defaultUrl.toString();
  }
}
