import { hmacSha256Base64Url, randomBase64Url } from "./crypto.js";
import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  timingSafeEqual,
} from "./encoding.js";
import {
  appSessionCookieName,
  createCookie,
  createSessionCookie,
  deleteCookie,
  getBearerToken,
  getSingleCookie,
  signAuthToken,
  verifyAuthToken,
} from "./session.js";

const appSessionMaxAgeSeconds = 1_800;
const persistentAppSessionMaxAgeSeconds = 15_552_000;

export type LinkAuthAppConfig = {
  appId: string;
  accountUrl: string;
  session: {
    kid: string;
    secret: string;
  };
};

export type LinkAuthAppEnv = {
  ACCOUNT_URL: string;
  APP_ID: string;
  APP_SESSION_HMAC_SECRET: string;
  SESSION_KID: string;
};

export function loadLinkAuthAppConfig(env: LinkAuthAppEnv): LinkAuthAppConfig {
  return {
    accountUrl: requiredBinding("ACCOUNT_URL", env.ACCOUNT_URL),
    appId: requiredBinding("APP_ID", env.APP_ID),
    session: {
      kid: requiredBinding("SESSION_KID", env.SESSION_KID),
      secret: requiredBinding(
        "APP_SESSION_HMAC_SECRET",
        env.APP_SESSION_HMAC_SECRET,
      ),
    },
  };
}

export type LinkAuthUser = {
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  status: "active";
  avatar_url: string | null;
  icon_source: "r2" | "none";
  icon_key: string | null;
};

export type LinkAuthSessionOnlyMatcher = (input: {
  request: Request;
  url: URL;
}) => boolean | Promise<boolean>;

export async function handleAppAuthRequest(input: {
  authFailedResponse: (url: URL) => Response | Promise<Response>;
  handleRequest: (input: {
    request: Request;
    url: URL;
    user: LinkAuthUser;
  }) => Response | Promise<Response>;
  config: LinkAuthAppConfig;
  localSessionOnly?: LinkAuthSessionOnlyMatcher;
  loginResponse: (request: Request) => Response | Promise<Response>;
  request: Request;
}): Promise<Response> {
  const url = new URL(input.request.url);
  if (url.pathname === "/_auth/callback" && input.request.method === "GET") {
    return await completeAppLogin({
      config: input.config,
      failedResponse: await input.authFailedResponse(url),
      request: input.request,
      url,
    });
  }
  if (url.pathname === "/_auth/logout" && input.request.method === "GET") {
    return clearAppSession({
      config: input.config,
      loginUrl: new URL("/login", url.origin).toString(),
    });
  }
  if (url.pathname === "/_auth/account" && input.request.method === "GET") {
    const accountUrl = new URL(input.config.accountUrl);
    accountUrl.searchParams.set("return_to", new URL("/", url).toString());
    return Response.redirect(accountUrl, 302);
  }

  const useLocalSession =
    input.localSessionOnly?.({ request: input.request, url }) ?? false;
  const user = await ((await useLocalSession)
    ? getAppSessionUser({
        config: input.config,
        request: input.request,
      })
    : getAppUser({
        config: input.config,
        request: input.request,
      }));
  if (!user) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (url.pathname === "/" && input.request.method === "GET") {
      return Response.redirect(new URL("/login", input.request.url), 302);
    }
    if (url.pathname === "/login" && input.request.method === "GET") {
      return await input.loginResponse(input.request);
    }
    if (url.pathname === "/login" && input.request.method === "POST") {
      const form = await input.request.formData();
      return await startAppLogin({
        config: input.config,
        request: input.request,
        returnTo: String(form.get("return_to") ?? ""),
      });
    }
    return new Response("not found", { status: 404 });
  }

  if (url.pathname === "/login" && input.request.method === "GET") {
    return Response.redirect(new URL("/", input.request.url), 302);
  }
  return await input.handleRequest({
    request: input.request,
    url,
    user,
  });
}

export function appAuthStateCookieName(appId: string): string {
  return `__Host-${appId}_auth_state`;
}

export function getAppSessionCookieName(appId: string): string {
  return appSessionCookieName(appId);
}

export async function startAppLogin(input: {
  config: LinkAuthAppConfig;
  request: Request;
  returnTo: string;
}): Promise<Response> {
  const returnTo = safeAppReturnTo(
    input.returnTo,
    new URL("/", input.request.url),
  );
  const state = await createAppAuthState({
    returnTo,
    secret: input.config.session.secret,
  });
  const callbackUrl = new URL("/_auth/callback", input.request.url);
  callbackUrl.searchParams.set("state", state);
  const authorizeUrl = new URL("/authorize", input.config.accountUrl);
  authorizeUrl.searchParams.set("app_id", input.config.appId);
  authorizeUrl.searchParams.set("return_to", callbackUrl.toString());
  const headers = new Headers({ location: authorizeUrl.toString() });
  headers.append(
    "set-cookie",
    createCookie(appAuthStateCookieName(input.config.appId), state, 600),
  );
  return new Response(null, { headers, status: 302 });
}

export async function completeAppLogin(input: {
  config: LinkAuthAppConfig;
  failedResponse: Response;
  request: Request;
  url: URL;
}): Promise<Response> {
  const code = input.url.searchParams.get("code");
  const state = input.url.searchParams.get("state");
  const appState = await verifyAppAuthState({
    expected: state,
    secret: input.config.session.secret,
    value: getSingleCookie(
      input.request.headers.get("cookie"),
      appAuthStateCookieName(input.config.appId),
    ),
  });
  if (!code || !appState) {
    return clearAppAuthState(input.failedResponse, input.config);
  }
  const body = await exchangeAuthCode(input.config, code);
  if (!body) {
    return clearAppAuthState(input.failedResponse, input.config);
  }
  const now = Math.floor(Date.now() / 1000);
  const maxAgeSeconds = body.session_persistent
    ? persistentAppSessionMaxAgeSeconds
    : appSessionMaxAgeSeconds;
  const session = await signAuthToken(
    {
      app_id: input.config.appId,
      discord_id: body.user.discord_id,
      display_name: body.user.display_name,
      exp: now + maxAgeSeconds,
      iat: now,
      icon_key: body.user.icon_key,
      icon_source: body.user.icon_source,
      kid: input.config.session.kid,
      persistent: body.session_persistent,
      role: body.user.role,
    },
    input.config.session.secret,
  );
  const headers = new Headers({
    location: safeAppReturnTo(appState.return_to, new URL("/", input.url)),
  });
  headers.append(
    "set-cookie",
    body.session_persistent
      ? createCookie(
          appSessionCookieName(input.config.appId),
          session,
          maxAgeSeconds,
        )
      : createSessionCookie(appSessionCookieName(input.config.appId), session),
  );
  headers.append(
    "set-cookie",
    deleteCookie(appAuthStateCookieName(input.config.appId)),
  );
  return new Response(null, { status: 302, headers });
}

export async function getAppUser(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): Promise<LinkAuthUser | null> {
  const sessionToken = await getRemoteSessionToken(input.request, input.config);
  if (!sessionToken) {
    return null;
  }
  return await fetchCurrentUser(input.config, input.request, sessionToken);
}

export function getAppSessionToken(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): string | null {
  return getLocalSessionToken(input.request, input.config);
}

export async function getAppSessionUser(input: {
  config: LinkAuthAppConfig;
  request: Request;
}): Promise<LinkAuthUser | null> {
  const sessionToken = getLocalSessionToken(input.request, input.config);
  if (!sessionToken) {
    return null;
  }
  const payload = await verifyAuthToken(
    sessionToken,
    { [input.config.session.kid]: input.config.session.secret },
    Math.floor(Date.now() / 1000),
  );
  if (!payload || payload.app_id !== input.config.appId) {
    return null;
  }
  return linkAuthUserFromSessionPayload(payload, input.config.accountUrl);
}

export function clearAppSession(input: {
  config: Pick<LinkAuthAppConfig, "appId">;
  loginUrl: string;
}): Response {
  const headers = new Headers({ location: input.loginUrl });
  headers.append(
    "set-cookie",
    deleteCookie(appSessionCookieName(input.config.appId)),
  );
  headers.append(
    "set-cookie",
    deleteCookie(appAuthStateCookieName(input.config.appId)),
  );
  return new Response(null, { headers, status: 302 });
}

export async function createAppAuthState(input: {
  returnTo: string;
  secret: string;
}): Promise<string> {
  const payload = base64UrlEncodeText(
    JSON.stringify({
      exp: Date.now() + 600_000,
      nonce: randomBase64Url(16),
      return_to: input.returnTo,
    }),
  );
  const signature = await hmacSha256Base64Url(input.secret, payload);
  return `${payload}.${signature}`;
}

export async function verifyAppAuthState(input: {
  expected: string | null;
  secret: string;
  value: string | null;
}): Promise<{ return_to: string } | null> {
  if (!input.value || input.value !== input.expected) {
    return null;
  }
  const parts = input.value.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const expectedSignature = await hmacSha256Base64Url(input.secret, parts[0]);
  if (!timingSafeEqual(parts[1], expectedSignature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(base64UrlDecodeText(parts[0])) as {
      exp?: unknown;
      return_to?: unknown;
    };
    if (
      typeof parsed.exp !== "number" ||
      parsed.exp <= Date.now() ||
      typeof parsed.return_to !== "string"
    ) {
      return null;
    }
    return { return_to: parsed.return_to };
  } catch {
    return null;
  }
}

function getLocalSessionToken(
  request: Request,
  config: LinkAuthAppConfig,
): string | null {
  const cookieToken = getSingleCookie(
    request.headers.get("cookie"),
    appSessionCookieName(config.appId),
  );
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  if (!cookieToken || (bearerToken && bearerToken !== cookieToken)) {
    return null;
  }
  return cookieToken;
}

async function getRemoteSessionToken(
  request: Request,
  config: LinkAuthAppConfig,
): Promise<string | null> {
  const cookieToken = getSingleCookie(
    request.headers.get("cookie"),
    appSessionCookieName(config.appId),
  );
  const bearerToken = getBearerToken(request.headers.get("authorization"));
  if (cookieToken && bearerToken && cookieToken !== bearerToken) {
    return null;
  }
  if (bearerToken && !cookieToken) {
    return bearerToken;
  }
  const payload = cookieToken
    ? await verifyAuthToken(
        cookieToken,
        { [config.session.kid]: config.session.secret },
        Math.floor(Date.now() / 1000),
      )
    : null;
  if (!cookieToken || !payload || payload.app_id !== config.appId) {
    return null;
  }
  return cookieToken;
}

function linkAuthUserFromSessionPayload(
  payload: {
    discord_id: string;
    display_name: string;
    role: "user" | "admin";
    icon_source: "r2" | "none";
    icon_key: string | null;
  },
  accountUrl: string,
): LinkAuthUser | null {
  const icon = linkAuthUserIcon(payload, accountUrl);
  if (!icon) {
    return null;
  }
  return {
    discord_id: payload.discord_id,
    display_name: payload.display_name,
    role: payload.role,
    status: "active",
    ...icon,
  };
}

async function exchangeAuthCode(
  config: LinkAuthAppConfig,
  code: string,
): Promise<{ session_persistent: boolean; user: TokenUser } | null> {
  const tokenUrl = new URL("/token", config.accountUrl);
  const rawBody = JSON.stringify({ app_id: config.appId, code });
  let response: Response;
  try {
    response = await fetch(tokenUrl, {
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "x-app-token-signature": await hmacSha256Base64Url(
          config.session.secret,
          `${config.appId}.${code}`,
        ),
      },
      method: "POST",
    });
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  try {
    const body = (await response.json()) as unknown;
    return parseTokenResponse(body);
  } catch {
    return null;
  }
}

async function fetchCurrentUser(
  config: LinkAuthAppConfig,
  request: Request,
  sessionToken: string,
): Promise<LinkAuthUser | null> {
  const verifyUrl = new URL("/session/verify", config.accountUrl);
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
    return parseCurrentUser(body.user, config.accountUrl);
  } catch {
    return null;
  }
}

type TokenUser = {
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  icon_source: "r2" | "none";
  icon_key: string | null;
};

function parseTokenResponse(
  value: unknown,
): { session_persistent: boolean; user: TokenUser } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as { session_persistent?: unknown; user?: unknown };
  const user = parseTokenUser(body.user);
  if (!user || typeof body.session_persistent !== "boolean") {
    return null;
  }
  return { session_persistent: body.session_persistent, user };
}

function parseTokenUser(value: unknown): TokenUser | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const user = value as Record<string, unknown>;
  if (
    typeof user.discord_id !== "string" ||
    typeof user.display_name !== "string" ||
    (user.role !== "user" && user.role !== "admin")
  ) {
    return null;
  }
  const icon = tokenUserIcon(user);
  if (!icon) {
    return null;
  }
  return {
    discord_id: user.discord_id,
    display_name: user.display_name,
    role: user.role,
    ...icon,
  };
}

function parseCurrentUser(
  value: unknown,
  accountUrl: string,
): LinkAuthUser | null {
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
  const icon = linkAuthUserIcon(user, accountUrl);
  if (!icon) {
    return null;
  }
  return {
    discord_id: user.discord_id,
    display_name: user.display_name,
    role: user.role,
    status: user.status,
    ...icon,
  };
}

function tokenUserIcon(user: { icon_key?: unknown; icon_source?: unknown }): {
  icon_key: string | null;
  icon_source: "r2" | "none";
} | null {
  if (user.icon_source === "none" && user.icon_key === null) {
    return { icon_key: null, icon_source: "none" };
  }
  if (user.icon_source === "r2" && typeof user.icon_key === "string") {
    return { icon_key: user.icon_key, icon_source: "r2" };
  }
  return null;
}

function linkAuthUserIcon(
  user: { icon_key?: unknown; icon_source?: unknown },
  accountUrl: string,
): {
  avatar_url: string | null;
  icon_key: string | null;
  icon_source: "r2" | "none";
} | null {
  const icon = tokenUserIcon(user);
  if (!icon) {
    return null;
  }
  const avatarUrl =
    icon.icon_source === "r2" && icon.icon_key
      ? new URL(
          `/assets/${icon.icon_key.split("/").map(encodeURIComponent).join("/")}`,
          accountUrl,
        ).toString()
      : null;
  return {
    avatar_url: avatarUrl,
    ...icon,
  };
}

function clearAppAuthState(
  response: Response,
  config: Pick<LinkAuthAppConfig, "appId">,
): Response {
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

function requiredBinding(name: string, value: string): string {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
