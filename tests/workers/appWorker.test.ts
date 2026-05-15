import { createExecutionContext } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import {
  appAuthStateCookieName,
  createAppAuthState,
  verifyAppAuthState,
} from "../../src/appAuth.js";
import {
  getLinkAuthSessionCookieName,
  getLinkAuthSessionToken,
  getLinkAuthSessionUser,
  handleAppAuthRequest,
  loadLinkAuthAppConfig,
} from "../../src/index.js";
import {
  appSessionCookieName,
  signAuthToken,
  verifyAuthToken,
} from "../../src/session.js";
import worker from "../../workers/app/src/index.js";

const env = {
  ACCOUNT_URL: "https://auth.example.com",
  APP_ID: "hub",
  APP_SESSION_HMAC_SECRET: "app-session-secret",
  DOMAIN_NAME: "example.com",
  SESSION_KID: "app-session-key",
};
const personalAccessToken =
  "lka_pat_abcdefghijklmnopqrstuvwx.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("App Worker rejects API requests without a valid app session", async () => {
  const response = await fetchApp("https://app.example.com/api/me");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker rejects malformed session cookie values", async () => {
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=%`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker redirects the home page to login without a session", async () => {
  const response = await fetchApp("https://app.example.com/");

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/login",
  );
});

test("App Worker starts login by redirecting to the account authorize endpoint", async () => {
  const response = await fetchApp("https://app.example.com/login", {
    body: new URLSearchParams({
      return_to: "https://app.example.com/dashboard#secret",
    }),
    method: "POST",
  });

  const location = new URL(response.headers.get("location") ?? "");
  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://auth.example.com");
  expect(location.pathname).toBe("/authorize");
  expect(location.searchParams.get("app_id")).toBe("hub");
  const callbackUrl = new URL(location.searchParams.get("return_to") ?? "");
  expect(callbackUrl.origin).toBe("https://app.example.com");
  expect(callbackUrl.pathname).toBe("/_auth/callback");
  expect(callbackUrl.searchParams.get("state")).toBeTruthy();
  expect(callbackUrl.searchParams.get("return_to")).toBeNull();
  await expectAppStateReturnTo(
    callbackUrl.searchParams.get("state"),
    "https://app.example.com/dashboard",
  );
  expect(response.headers.get("set-cookie")).toContain(
    `${appAuthStateCookieName("hub")}=`,
  );
});

test("App Worker login falls back to the app root for cross-origin return_to values", async () => {
  const response = await fetchApp("https://app.example.com/login", {
    body: new URLSearchParams({
      return_to: "https://evil.example.com/dashboard",
    }),
    method: "POST",
  });

  const location = new URL(response.headers.get("location") ?? "");
  const callbackUrl = new URL(location.searchParams.get("return_to") ?? "");
  await expectAppStateReturnTo(
    callbackUrl.searchParams.get("state"),
    "https://app.example.com/",
  );
});

test("App Worker login falls back to the app root for credentialed return_to values", async () => {
  const response = await fetchApp("https://app.example.com/login", {
    body: new URLSearchParams({
      return_to: "https://user:pass@app.example.com/dashboard",
    }),
    method: "POST",
  });

  const location = new URL(response.headers.get("location") ?? "");
  const callbackUrl = new URL(location.searchParams.get("return_to") ?? "");
  await expectAppStateReturnTo(
    callbackUrl.searchParams.get("state"),
    "https://app.example.com/",
  );
});

test("App Worker rejects callback requests without a valid state", async () => {
  const response = await fetchApp(
    "https://app.example.com/_auth/callback?code=auth-code",
  );

  expect(response.status).toBe(401);
});

test("App Worker rejects callback requests when token exchange fails", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "invalid_auth_code" }, { status: 401 }),
  );

  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });
  const response = await fetchApp(appCallbackUrl("bad-code", state), {
    headers: {
      cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
    },
  });

  expect(response.status).toBe(401);
});

test("App Worker rejects callback requests when token exchange throws", async () => {
  vi.stubGlobal("fetch", async () => {
    throw new Error("account unavailable");
  });

  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });
  const response = await fetchApp(appCallbackUrl("auth-code", state), {
    headers: {
      cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
    },
  });

  expect(response.status).toBe(401);
});

test("App Worker rejects callback requests when token response is invalid JSON", async () => {
  vi.stubGlobal("fetch", async () => new Response("invalid json"));

  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });
  const response = await fetchApp(appCallbackUrl("auth-code", state), {
    headers: {
      cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
    },
  });

  expect(response.status).toBe(401);
});

test("App Worker exchanges a code and creates an app session cookie", async () => {
  vi.stubGlobal(
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "x-app-token-signature": expect.any(String),
      });
      return Response.json({
        session_persistent: true,
        user: {
          discord_id: "123456789",
          display_name: "Akaaku",
          icon_key: null,
          icon_source: "none",
          role: "admin",
        },
      });
    },
  );
  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });

  const response = await fetchApp(appCallbackUrl("auth-code", state), {
    headers: {
      cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
    },
  });

  const setCookie = response.headers.get("set-cookie") ?? "";
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/dashboard",
  );
  expect(setCookie).toContain(`${appSessionCookieName("hub")}=`);
  expect(setCookie).toContain(`${appAuthStateCookieName("hub")}=`);
  const sessionPayload = await appSessionPayload(setCookie);
  expect(sessionPayload).not.toBeNull();
  if (!sessionPayload) {
    throw new Error("app session cookie was not valid");
  }
  expect(sessionPayload.exp).toBe(sessionPayload.iat + 15_552_000);
  expect(setCookieHeader(setCookie, appSessionCookieName("hub"))).toContain(
    "Max-Age=15552000",
  );
  expect(setCookie).toContain("Max-Age=0");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Lax");
});

test("App Worker creates a browser session cookie when remember_me is off", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      session_persistent: false,
      user: {
        discord_id: "123456789",
        display_name: "Akaaku",
        icon_key: null,
        icon_source: "none",
        role: "admin",
      },
    }),
  );
  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });

  const response = await fetchApp(appCallbackUrl("auth-code", state), {
    headers: {
      cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
    },
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  const sessionPayload = await appSessionPayload(setCookie);
  expect(sessionPayload).not.toBeNull();
  if (!sessionPayload) {
    throw new Error("app session cookie was not valid");
  }
  expect(sessionPayload.exp).toBe(sessionPayload.iat + 1_800);
  expect(setCookieHeader(setCookie, appSessionCookieName("hub"))).not.toContain(
    "Max-Age",
  );
  expect(setCookieHeader(setCookie, appAuthStateCookieName("hub"))).toContain(
    "Max-Age=0",
  );
});

test("App Worker rejects callback requests without an auth code", async () => {
  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });
  const response = await fetchApp(
    `https://app.example.com/_auth/callback?state=${encodeURIComponent(state)}`,
    {
      headers: {
        cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
      },
    },
  );

  expect(response.status).toBe(401);
});

test("App Worker callback falls back to the app root for cross-origin return_to values", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      session_persistent: true,
      user: {
        discord_id: "123456789",
        display_name: "Akaaku",
        icon_key: null,
        icon_source: "none",
        role: "admin",
      },
    }),
  );
  const state = await createAppAuthState({
    returnTo: "https://app.example.com/",
    secret: env.APP_SESSION_HMAC_SECRET,
  });

  const response = await fetchApp(
    `https://app.example.com/_auth/callback?code=auth-code&state=${encodeURIComponent(state)}&return_to=https%3A%2F%2Fevil.example.com%2Fdashboard`,
    {
      headers: {
        cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
      },
    },
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
});

test("App Worker callback ignores tampered return_to query values", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      session_persistent: true,
      user: {
        discord_id: "123456789",
        display_name: "Akaaku",
        icon_key: null,
        icon_source: "none",
        role: "admin",
      },
    }),
  );
  const state = await createAppAuthState({
    returnTo: "https://app.example.com/dashboard",
    secret: env.APP_SESSION_HMAC_SECRET,
  });

  const response = await fetchApp(
    `https://app.example.com/_auth/callback?code=auth-code&state=${encodeURIComponent(state)}&return_to=https%3A%2F%2Fapp.example.com%2Fsettings`,
    {
      headers: {
        cookie: `${appAuthStateCookieName("hub")}=${encodeURIComponent(state)}`,
      },
    },
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/dashboard",
  );
});

test("App Worker logout clears the app session cookie", async () => {
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/_auth/logout", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/login",
  );
  expect(setCookie).toContain(`${appSessionCookieName("hub")}=`);
  expect(setCookie).toContain("Max-Age=0");
  expect(setCookie).toContain(`${appAuthStateCookieName("hub")}=`);
});

test("App Worker returns the current user with a valid app session", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ user: currentUser }));
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    user: {
      avatar_url: "https://auth.example.com/assets/icons/123456789/avatar.webp",
      discord_id: "123456789",
      display_name: "Current Akaaku",
    },
  });
});

test("App Worker rejects a valid app session sent as bearer token", async () => {
  const session = await createAppSession("hub");
  vi.stubGlobal(
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: `Bearer ${session}`,
      });
      return Response.json({ error: "unauthorized" }, { status: 401 });
    },
  );
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      authorization: `Bearer ${session}`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker returns the current user with a personal access bearer token", async () => {
  vi.stubGlobal(
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: `Bearer ${personalAccessToken}`,
      });
      return Response.json({ user: currentUser });
    },
  );
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      authorization: `Bearer ${personalAccessToken}`,
    },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    user: {
      avatar_url: "https://auth.example.com/assets/icons/123456789/avatar.webp",
      discord_id: "123456789",
      display_name: "Current Akaaku",
    },
  });
});

test("App Worker rejects a personal access bearer token when account verification fails", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      authorization: `Bearer ${personalAccessToken}`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker rejects conflicting cookie and bearer session tokens", async () => {
  const session = await createAppSession("hub");
  const otherSession = await createAppSession("other");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      authorization: `Bearer ${session}`,
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(otherSession)}`,
    },
  });

  expect(response.status).toBe(401);
});

test("App Worker rejects account session verify failures", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker redirects when account session verify rejects the user", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/login",
  );
});

test("App Worker rejects non-active users from account session verify", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      user: {
        ...currentUser,
        status: "disabled",
      },
    }),
  );
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("App Worker renders a profile page with the current icon", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ user: currentUser }));
  const session = await createAppSession("hub");

  const response = await fetchApp("https://app.example.com/", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain("Current Akaaku");
  expect(body).toContain(
    'src="https://auth.example.com/assets/icons/123456789/avatar.webp"',
  );
  expect(body).toContain('href="https://app.example.com/_auth/account"');
  expect(body).toContain("設定");
  expect(body).not.toContain("ロール");
  expect(body).not.toContain("セッション");
  expect(body).not.toContain(">app<");
});

test("App Worker redirects the settings route to the account page", async () => {
  const response = await fetchApp("https://app.example.com/_auth/account");

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://auth.example.com/?return_to=https%3A%2F%2Fapp.example.com%2F",
  );
});

test("App Worker does not render the profile page when account verification fails", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  const session = await createAppSession("hub");

  const response = await fetchApp("https://app.example.com/", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });
  const body = await response.text();

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/login",
  );
  expect(body).not.toContain("Current Akaaku");
  expect(body).not.toContain("設定");
});

test("App Worker rejects a session issued for another app", async () => {
  const session = await createAppSession("other");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(401);
});

test("LinkAuth local session user verifies an app session without account fetch", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push(input instanceof Request ? input.url : String(input));
    return Response.json({ error: "unexpected" }, { status: 500 });
  });
  const session = await createAppSession("hub", {
    displayName: "Local Akaaku",
    iconKey: `icons/123456789/avatar-${"a".repeat(64)}.webp`,
  });
  const config = loadLinkAuthAppConfig(env);
  const request = new Request("https://app.example.com/assets/card.webp", {
    headers: {
      cookie: `${getLinkAuthSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(getLinkAuthSessionCookieName("hub")).toBe("__Host-hub_session");
  expect(getLinkAuthSessionToken({ config, request })).toBe(session);
  await expect(getLinkAuthSessionUser({ config, request })).resolves.toEqual({
    avatar_url: `https://auth.example.com/assets/icons/123456789/avatar-${"a".repeat(64)}.webp`,
    discord_id: "123456789",
    display_name: "Local Akaaku",
    icon_key: `icons/123456789/avatar-${"a".repeat(64)}.webp`,
    icon_source: "r2",
    role: "admin",
    status: "active",
  });
  expect(calls).toEqual([]);
});

test("LinkAuth local session user rejects bearer-only tokens", async () => {
  const session = await createAppSession("hub");
  const config = loadLinkAuthAppConfig(env);
  const request = new Request("https://app.example.com/assets/card.webp", {
    headers: {
      authorization: `Bearer ${session}`,
    },
  });

  expect(getLinkAuthSessionToken({ config, request })).toBeNull();
  await expect(getLinkAuthSessionUser({ config, request })).resolves.toBeNull();
});

test("LinkAuth local session user rejects conflicting bearer and cookie tokens", async () => {
  const session = await createAppSession("hub");
  const otherSession = await createAppSession("other");
  const config = loadLinkAuthAppConfig(env);
  const request = new Request("https://app.example.com/assets/card.webp", {
    headers: {
      authorization: `Bearer ${otherSession}`,
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(getLinkAuthSessionToken({ config, request })).toBeNull();
  await expect(getLinkAuthSessionUser({ config, request })).resolves.toBeNull();
});

test("LinkAuth handler uses local session only for matched requests", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push(input instanceof Request ? input.url : String(input));
    return Response.json({ user: currentUser });
  });
  const session = await createAppSession("hub");
  const config = loadLinkAuthAppConfig(env);
  const assetRequest = new Request("https://app.example.com/cards/1.webp", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  const assetResponse = await handleAppAuthRequest({
    authFailedResponse: () => new Response("failed", { status: 401 }),
    config,
    handleRequest: ({ user }) => Response.json({ user }),
    localSessionOnly: ({ url }) => url.pathname.startsWith("/cards/"),
    loginResponse: () => new Response("login"),
    request: assetRequest,
  });

  expect(assetResponse.status).toBe(200);
  expect(calls).toEqual([]);
  await expect(assetResponse.json()).resolves.toMatchObject({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      status: "active",
    },
  });

  const apiRequest = new Request("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });
  const apiResponse = await handleAppAuthRequest({
    authFailedResponse: () => new Response("failed", { status: 401 }),
    config,
    handleRequest: ({ user }) => Response.json({ user }),
    localSessionOnly: ({ url }) => url.pathname.startsWith("/cards/"),
    loginResponse: () => new Response("login"),
    request: apiRequest,
  });

  expect(apiResponse.status).toBe(200);
  expect(calls).toEqual(["https://auth.example.com/session/verify?app_id=hub"]);
});

async function fetchApp(url: string, init?: RequestInit): Promise<Response> {
  const fetchHandler = worker.fetch;
  if (!fetchHandler) {
    throw new Error("Worker fetch handler is not defined");
  }
  return await fetchHandler(
    new Request(url, init) as Request<
      unknown,
      IncomingRequestCfProperties<unknown>
    >,
    env,
    createExecutionContext(),
  );
}

async function createAppSession(
  appId: string,
  options: { displayName?: string; iconKey?: string | null } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signAuthToken(
    {
      app_id: appId,
      discord_id: "123456789",
      display_name: options.displayName ?? "Akaaku",
      exp: now + 3_600,
      icon_key: options.iconKey ?? null,
      icon_source: options.iconKey ? "r2" : "none",
      iat: now,
      kid: env.SESSION_KID,
      role: "admin",
    },
    env.APP_SESSION_HMAC_SECRET,
  );
}

function appCallbackUrl(code: string, state: string): string {
  const url = new URL("https://app.example.com/_auth/callback");
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return url.toString();
}

async function expectAppStateReturnTo(
  state: string | null,
  returnTo: string,
): Promise<void> {
  expect(state).toBeTruthy();
  const parsed = await verifyAppAuthState({
    expected: state,
    secret: env.APP_SESSION_HMAC_SECRET,
    value: state,
  });
  expect(parsed).toEqual({ return_to: returnTo });
}

function setCookieHeader(setCookie: string, name: string): string {
  const header = setCookie
    .split(/,\s*/)
    .find((value) => value.startsWith(`${name}=`));
  if (!header) {
    throw new Error(`${name} cookie was not set`);
  }
  return header;
}

async function appSessionPayload(setCookie: string) {
  const value = cookieValue(setCookie, appSessionCookieName("hub"));
  return value
    ? await verifyAuthToken(
        value,
        { [env.SESSION_KID]: env.APP_SESSION_HMAC_SECRET },
        0,
      )
    : null;
}

function cookieValue(setCookie: string, name: string): string | null {
  const header = setCookieHeader(setCookie, name);
  const value = header.slice(name.length + 1).split(";")[0];
  return value ? decodeURIComponent(value) : null;
}

const currentUser = {
  discord_id: "123456789",
  display_name: "Current Akaaku",
  icon_key: "icons/123456789/avatar.webp",
  icon_source: "r2",
  role: "admin",
  status: "active",
} as const;
