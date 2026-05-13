import {
  appSessionCookieName,
  createCookie,
  deleteCookie,
  getBearerToken,
  getSingleCookie,
  hmacSha256Base64Url,
  signAuthToken,
  verifyAuthToken,
} from "link-auth";
import { type AppConfig, withAppConfig } from "./appConfig.js";
import {
  appAuthStateCookieName,
  createAppAuthState,
  verifyAppAuthState,
} from "./authState.js";
import {
  authFailedPageBody,
  loginPageBody,
  page,
  appHomePage as renderAppHomePage,
} from "./samplePage.js";
import type { SampleUser } from "./sampleUser.js";

export default withAppConfig(handleAppRequest);

async function handleAppRequest(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/_auth/callback" && request.method === "GET") {
    return authCallback(request, url, config);
  }
  if (url.pathname === "/_auth/logout" && request.method === "GET") {
    return clearAppSession(url, config);
  }

  const sessionCookie = appSessionCookieName(config.appId);
  const session = getAppSessionToken(request, sessionCookie);
  const payload = session
    ? await verifyAuthToken(
        session,
        { [config.session.kid]: config.session.secret },
        Math.floor(Date.now() / 1000),
      )
    : null;
  if (!session || !payload || payload.app_id !== config.appId) {
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
  const currentUser = await fetchCurrentUser(request, config, session);
  if (!currentUser) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.redirect(new URL("/login", request.url), 302);
  }
  if (url.pathname === "/api/me" && request.method === "GET") {
    return Response.json({ user: currentUser });
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
    renderAppHomePage({
      accountUrl: accountUrl.toString(),
      assetBaseUrl: config.accountUrl,
      user: currentUser,
    }),
  );
}

function loginPage(request: Request): Response {
  return page(
    "App Login",
    loginPageBody({ returnTo: appReturnToUrl(request) }),
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
  const userIcon = tokenUserIcon(user);
  const session = await signAuthToken(
    {
      discord_id: user.discord_id,
      app_id: config.appId,
      role: user.role,
      display_name: user.display_name,
      ...userIcon,
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

function tokenUserIcon(user: { icon_source?: unknown; icon_key?: unknown }): {
  icon_source?: "discord" | "r2" | "none";
  icon_key?: string;
} {
  return {
    ...(user.icon_source === "discord" ||
    user.icon_source === "r2" ||
    user.icon_source === "none"
      ? { icon_source: user.icon_source }
      : {}),
    ...(typeof user.icon_key === "string" ? { icon_key: user.icon_key } : {}),
  };
}

async function parseTokenResponse(response: Response): Promise<{
  user?: {
    discord_id?: unknown;
    display_name?: unknown;
    icon_source?: unknown;
    icon_key?: unknown;
    role?: unknown;
  };
} | null> {
  try {
    return (await response.json()) as {
      user?: {
        discord_id?: unknown;
        display_name?: unknown;
        icon_source?: unknown;
        icon_key?: unknown;
        role?: unknown;
      };
    };
  } catch {
    return null;
  }
}

async function fetchCurrentUser(
  request: Request,
  config: AppConfig,
  sessionToken: string,
): Promise<SampleUser | null> {
  const verifyUrl = new URL("/session/verify", config.navigation.AUTH_BASE_URL);
  verifyUrl.searchParams.set("app_id", config.appId);
  let response: Response;
  try {
    response = await fetch(verifyUrl, {
      headers: {
        authorization: `Bearer ${sessionToken}`,
        cookie: request.headers.get("cookie") ?? "",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  try {
    const body = (await response.json()) as { user?: unknown };
    return parseCurrentUser(body.user);
  } catch {
    return null;
  }
}

function getAppSessionToken(
  request: Request,
  cookieName: string,
): string | null {
  const cookieToken = getSingleCookie(
    request.headers.get("cookie"),
    cookieName,
  );
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  if (cookieToken && bearerToken && cookieToken !== bearerToken) {
    return null;
  }
  return bearerToken ?? cookieToken;
}

function parseCurrentUser(value: unknown): SampleUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const user = value as Record<string, unknown>;
  if (
    typeof user.discord_id !== "string" ||
    typeof user.display_name !== "string" ||
    (user.role !== "user" && user.role !== "admin") ||
    user.status !== "active"
  ) {
    return null;
  }
  return {
    discord_id: user.discord_id,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    ...tokenUserIcon(user),
  };
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

function clearAppSession(url: URL, config: AppConfig): Response {
  const headers = new Headers({
    location: new URL("/login", url.origin).toString(),
  });
  headers.append(
    "set-cookie",
    deleteCookie(appSessionCookieName(config.appId)),
  );
  headers.append(
    "set-cookie",
    deleteCookie(appAuthStateCookieName(config.appId)),
  );
  return new Response(null, { headers, status: 302 });
}

function appAuthFailedPage(url: URL): Response {
  return page(
    "App認証に失敗しました",
    authFailedPageBody({ loginUrl: new URL("/login", url.origin).toString() }),
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
