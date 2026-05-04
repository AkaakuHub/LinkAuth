import { createExecutionContext } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import { hmacSha256Base64Url, sha256Hex } from "../../shared/src/crypto.js";
import { createCsrfToken } from "../../shared/src/csrf.js";
import {
  appSessionCookieName,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
} from "../../shared/src/session.js";
import type { AccountConfig } from "../../workers/account/src/accountConfig.js";
import worker from "../../workers/account/src/index.js";
import {
  authStateCookieName,
  parseAuthState,
} from "../../workers/account/src/security/authState.js";
import {
  createOtpState,
  otpStateCookieName,
} from "../../workers/account/src/security/otpState.js";
import type { Env } from "../../workers/account/src/types.js";

const assets: R2Bucket = {
  async createMultipartUpload(): Promise<R2MultipartUpload> {
    throw new Error("R2 multipart upload is not used in account auth tests");
  },
  async delete(): Promise<void> {},
  async get(): Promise<R2ObjectBody | null> {
    return null;
  },
  async head(): Promise<R2Object | null> {
    return null;
  },
  async list(): Promise<R2Objects> {
    return {
      delimitedPrefixes: [],
      objects: [],
      truncated: false,
    };
  },
  async put(): Promise<R2Object> {
    throw new Error("R2 put is not used in account auth tests");
  },
  resumeMultipartUpload(): R2MultipartUpload {
    throw new Error("R2 multipart upload is not used in account auth tests");
  },
};

const env: Env = {
  ACCOUNT_URL: "https://auth.example.com",
  ASSETS: assets,
  AUTH_APPS: JSON.stringify([
    {
      app_id: "hub",
      callback_url: "https://app.example.com/_auth/callback",
      session_verify_secret: "app-session-secret",
    },
  ]),
  CSRF_HMAC_SECRET: "csrf-secret",
  CSRF_KID: "csrf-key",
  DISCORD_BOT_TOKEN: "discord-bot-token",
  DISCORD_CLIENT_ID: "discord-client-id",
  DISCORD_CLIENT_SECRET: "discord-client-secret",
  DISCORD_GUILD_IDS: "guild",
  DOMAIN_NAME: "example.com",
  INTERNAL_HMAC_KID: "internal-key",
  INTERNAL_HMAC_SECRET: "internal-secret",
  SESSION_HMAC_SECRET: "account-session-secret",
  SESSION_KID: "account-session-key",
  USER_API_URL: "https://user-api.example.com",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("Account Worker rejects authorize requests for unknown apps", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=unknown&return_to=https%3A%2F%2Fapp.example.com%2F_auth%2Fcallback",
  );

  expect(response.status).toBe(401);
});

test("Account Worker rejects authorize requests with a mismatched callback URL", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=hub&return_to=https%3A%2F%2Fapp.example.com%2Fother",
  );

  expect(response.status).toBe(401);
});

test("Account Worker redirects unauthenticated authorize requests to Discord", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=hub&return_to=https%3A%2F%2Fapp.example.com%2F_auth%2Fcallback",
  );
  const location = new URL(response.headers.get("location") ?? "");

  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://discord.com");
  expect(location.pathname).toBe("/api/v10/oauth2/authorize");
  expect(location.searchParams.get("client_id")).toBe("discord-client-id");
  expect(response.headers.get("set-cookie")).toContain(
    `${authStateCookieName}=`,
  );
  const state = await parseAuthState(
    location.searchParams.get("state"),
    testAccountConfig(),
  );
  expect(state).toEqual({
    app_id: "hub",
    return_to: "https://app.example.com/_auth/callback",
  });
});

test("Account Worker issues an auth code for an active session", async () => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body = JSON.parse(
        new TextDecoder().decode(init?.body as Uint8Array),
      ) as { code?: string };
      if (url.pathname === "/users/verify-current-membership") {
        return Response.json({ user: activeUser });
      }
      if (url.pathname === "/auth-code/create" && body.code) {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );
  const session = await createAccountSession();

  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=hub&return_to=https%3A%2F%2Fapp.example.com%2F_auth%2Fcallback",
    {
      headers: {
        cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      },
    },
  );
  const location = new URL(response.headers.get("location") ?? "");

  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://app.example.com");
  expect(location.pathname).toBe("/_auth/callback");
  expect(location.searchParams.get("code")).toBeTruthy();
});

test("Account Worker token endpoint rejects invalid JSON fields", async () => {
  const response = await fetchAccount("https://auth.example.com/token", {
    body: JSON.stringify({ app_id: "hub" }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_request" });
});

test("Account Worker token endpoint rejects malformed JSON", async () => {
  const response = await fetchAccount("https://auth.example.com/token", {
    body: "{",
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_request" });
});

test("Account Worker token endpoint maps consumed auth code failures to 401", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "invalid_auth_code" }, { status: 401 }),
  );

  const response = await fetchAccount("https://auth.example.com/token", {
    body: JSON.stringify({ app_id: "hub", code: "bad-code" }),
    headers: await tokenHeaders("hub", "bad-code"),
    method: "POST",
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_auth_code" });
});

test("Account Worker token endpoint rejects invalid app signatures", async () => {
  const response = await fetchAccount("https://auth.example.com/token", {
    body: JSON.stringify({ app_id: "hub", code: "auth-code" }),
    headers: {
      "content-type": "application/json",
      "x-app-token-signature": "invalid",
    },
    method: "POST",
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "invalid_app_signature" });
});

test("Account Worker token endpoint rejects unknown apps before User API", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    return Response.json({ error: "not_found" }, { status: 404 });
  });

  const response = await fetchAccount("https://auth.example.com/token", {
    body: JSON.stringify({ app_id: "unknown", code: "auth-code" }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "unknown_app" });
  expect(calls).toEqual([]);
});

test("Account Worker session verify rejects missing account sessions", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/session/verify",
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("Account Worker session verify rejects unknown app ids", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/session/verify?app_id=unknown",
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "unknown_app" });
});

test("Account Worker session verify accepts a valid app session cookie", async () => {
  const session = await createAppSession("hub");
  const response = await fetchAccount(
    "https://auth.example.com/session/verify?app_id=hub",
    {
      headers: {
        cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
      },
    },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
    },
  });
});

test("Account Worker session verify rejects app sessions with the wrong app_id", async () => {
  const session = await createAppSession("other");
  const response = await fetchAccount(
    "https://auth.example.com/session/verify?app_id=hub",
    {
      headers: {
        cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
      },
    },
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("Account Worker me rejects missing account sessions", async () => {
  const response = await fetchAccount("https://auth.example.com/me");

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("Account Worker me returns the active account user for a valid account session", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ user: activeUser }));
  const session = await createAccountSession();

  const response = await fetchAccount("https://auth.example.com/me", {
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ user: activeUser });
});

test("Account Worker me rejects valid sessions when the user is inactive", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "inactive_user" }, { status: 401 }),
  );
  const session = await createAccountSession();

  const response = await fetchAccount("https://auth.example.com/me", {
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("Account Worker profile update rejects missing CSRF tokens", async () => {
  const session = await createAccountSession();

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      display_name: "Akaaku",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://account.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
});

test("Account Worker profile update rejects origin mismatches", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    return Response.json({ ok: true });
  });
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("profile");

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      display_name: "Akaaku",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://evil.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("Account Worker profile update accepts a valid CSRF token", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      const body = decodeJsonBody(init);
      if (
        url.pathname === "/users/update-profile" &&
        body.discord_id === "123456789" &&
        body.display_name === "Akaaku"
      ) {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("profile");

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      display_name: "Akaaku",
      return_to: "https://app.example.com/",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://account.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "https://account.example.com/?return_to=https%3A%2F%2Fapp.example.com%2F",
  );
  expect(calls).toEqual(["/users/update-profile"]);
});

test("Account Worker avatar update rejects origin mismatches", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    return Response.json({ ok: true });
  });
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("avatar");

  const response = await fetchAccount("https://account.example.com/avatar", {
    body: new Uint8Array(),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://evil.example.com",
      "x-csrf-token": csrfToken,
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("Account Worker delete rejects origin mismatches", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    return Response.json({ ok: true });
  });
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("delete");

  const response = await fetchAccount("https://account.example.com/delete", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      return_to: "https://app.example.com/",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://evil.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("Account Worker logout rejects origin mismatches", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    return Response.json({ ok: true });
  });
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("logout");

  const response = await fetchAccount("https://account.example.com/logout", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      return_to: "https://app.example.com/",
    }),
    headers: {
      cookie: [
        `${sessionCookieName}=${encodeURIComponent(session)}`,
        `${rememberCookieName}=remember-id.random-token`,
      ].join("; "),
      origin: "https://evil.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(403);
  expect(calls).toEqual([]);
});

test("Account Worker logout deletes the remember token and clears account cookies", async () => {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    "fetch",
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(decodeJsonBody(init));
      return Response.json({ ok: true });
    },
  );
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("logout");

  const response = await fetchAccount("https://account.example.com/logout", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      return_to: "https://app.example.com/",
    }),
    headers: {
      cookie: [
        `${sessionCookieName}=${encodeURIComponent(session)}`,
        `${rememberCookieName}=remember-id.random-token`,
      ].join("; "),
      origin: "https://account.example.com",
    },
    method: "POST",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
  expect(calls).toEqual([
    expect.objectContaining({
      token_id: "remember-id",
    }),
  ]);
  expect(setCookie).toContain(`${sessionCookieName}=`);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  expect(setCookie).toContain("Max-Age=0");
});

test("Account Worker callback creates an OTP challenge and renders the OTP form", async () => {
  const state = await createCallbackState("hub");
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      if (url.pathname === "/api/v10/oauth2/token") {
        return Response.json({ access_token: "discord-access-token" });
      }
      if (url.pathname === "/api/v10/users/@me") {
        return Response.json({ id: "123456789" });
      }
      if (url.pathname === "/api/v10/users/@me/guilds/guild/member") {
        return Response.json({ ok: true });
      }
      if (url.pathname === "/users/verify-current-membership") {
        return Response.json({ user: activeUser });
      }
      if (url.pathname === "/otp-challenge/create") {
        const body = decodeJsonBody(init);
        expect(body.discord_id).toBe("123456789");
        expect(body.app_id).toBe("hub");
        expect(body.return_to).toBe("https://app.example.com/_auth/callback");
        expect(body.otp).toMatch(/^[0-9]{6}$/);
        expect(body.expires_at).toBeGreaterThanOrEqual(
          Math.floor(Date.now() / 1000) + 299,
        );
        return Response.json({ ok: true });
      }
      if (url.pathname === "/api/v10/users/@me/channels") {
        return Response.json({ id: "dm-channel" });
      }
      if (url.pathname === "/api/v10/channels/dm-channel/messages") {
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount(
    `https://auth.example.com/callback?code=discord-code&state=${encodeURIComponent(state)}`,
    {
      headers: {
        cookie: `${authStateCookieName}=${encodeURIComponent(state)}`,
      },
    },
  );
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain("OTP認証");
  expect(body).toContain('name="app_id" value="hub"');
  expect(body).toContain('name="remember_me" value="1" checked');
  expect(response.headers.get("set-cookie")).toContain(
    `${otpStateCookieName}=`,
  );
  expect(calls).toContain("/api/v10/oauth2/token");
  expect(calls).toContain("/api/v10/users/@me");
  expect(calls).toContain("/api/v10/users/@me/guilds/guild/member");
  expect(calls).toContain("/users/verify-current-membership");
  expect(calls).toContain("/otp-challenge/create");
  expect(calls).toContain("/api/v10/users/@me/channels");
  expect(calls).toContain("/api/v10/channels/dm-channel/messages");
});

test("Account Worker callback shows a delivery error when Discord DM sending throws", async () => {
  const state = await createCallbackState("hub");
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/api/v10/oauth2/token") {
        return Response.json({ access_token: "discord-access-token" });
      }
      if (url.pathname === "/api/v10/users/@me") {
        return Response.json({ id: "123456789" });
      }
      if (url.pathname === "/api/v10/users/@me/guilds/guild/member") {
        return Response.json({ ok: true });
      }
      if (url.pathname === "/users/verify-current-membership") {
        return Response.json({ user: activeUser });
      }
      if (url.pathname === "/otp-challenge/create") {
        expect(decodeJsonBody(init).discord_id).toBe("123456789");
        return Response.json({ ok: true });
      }
      if (url.pathname === "/api/v10/users/@me/channels") {
        throw new Error("discord unavailable");
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount(
    `https://auth.example.com/callback?code=discord-code&state=${encodeURIComponent(state)}`,
    {
      headers: {
        cookie: `${authStateCookieName}=${encodeURIComponent(state)}`,
      },
    },
  );
  const body = await response.text();

  expect(response.status).toBe(401);
  expect(body).toContain("認証コードを送信できませんでした");
  expect(body).toContain("対象サーバーからのDM受信設定");
  expect(response.headers.get("set-cookie")).not.toContain(
    `${otpStateCookieName}=`,
  );
});

test("Account Worker callback rejects app auth states without the browser state cookie", async () => {
  const state = await createCallbackState("hub");

  const response = await fetchAccount(
    `https://auth.example.com/callback?code=discord-code&state=${encodeURIComponent(state)}`,
  );

  expect(response.status).toBe(401);
});

test("Account Worker callback rejects mismatched browser state cookies", async () => {
  const state = await createCallbackState("hub");
  const otherState = await createCallbackState("hub");

  const response = await fetchAccount(
    `https://auth.example.com/callback?code=discord-code&state=${encodeURIComponent(state)}`,
    {
      headers: {
        cookie: `${authStateCookieName}=${encodeURIComponent(otherState)}`,
      },
    },
  );

  expect(response.status).toBe(401);
});

test("Account Worker callback rejects Discord users outside the configured guilds", async () => {
  const state = await createCallbackState("hub");
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.pathname);
    if (url.pathname === "/api/v10/oauth2/token") {
      return Response.json({ access_token: "discord-access-token" });
    }
    if (url.pathname === "/api/v10/users/@me") {
      return Response.json({ id: "123456789" });
    }
    if (url.pathname === "/api/v10/users/@me/guilds/guild/member") {
      return Response.json({ error: "unknown_member" }, { status: 404 });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  });

  const response = await fetchAccount(
    `https://auth.example.com/callback?code=discord-code&state=${encodeURIComponent(state)}`,
    {
      headers: {
        cookie: `${authStateCookieName}=${encodeURIComponent(state)}`,
      },
    },
  );
  const body = await response.text();

  expect(response.status).toBe(401);
  expect(body).toContain("利用資格がありません");
  expect(calls).toContain("/api/v10/users/@me/guilds/guild/member");
  expect(calls).not.toContain("/users/verify-current-membership");
  expect(calls).not.toContain("/otp-challenge/create");
});

test("Account Worker OTP success returns to authorize for app callbacks", async () => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/otp-challenge/consume") {
        const body = decodeJsonBody(init);
        expect(body.challenge_id).toBe("challenge-id");
        expect(body.otp).toBe("123456");
        return Response.json({
          app_id: "hub",
          discord_id: "123456789",
          return_to: "https://app.example.com/_auth/callback",
        });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      app_id: "hub",
      challenge_id: "challenge-id",
      otp: "123456",
      return_to: "https://app.example.com/_auth/callback",
    }),
    headers: await otpHeaders("challenge-id"),
    method: "POST",
  });
  const location = new URL(response.headers.get("location") ?? "");

  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://auth.example.com");
  expect(location.pathname).toBe("/authorize");
  expect(location.searchParams.get("app_id")).toBe("hub");
  expect(location.searchParams.get("return_to")).toBe(
    "https://app.example.com/_auth/callback",
  );
});

test("Account Worker OTP rejects requests without the browser challenge state", async () => {
  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      challenge_id: "challenge-id",
      otp: "123456",
    }),
    method: "POST",
  });

  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toContain(
    `${otpStateCookieName}=`,
  );
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("Account Worker OTP success does not use app_id for non-callback return_to values", async () => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/otp-challenge/consume") {
        const body = decodeJsonBody(init);
        expect(body.challenge_id).toBe("challenge-id");
        expect(body.otp).toBe("123456");
        return Response.json({
          app_id: "hub",
          discord_id: "123456789",
          return_to: "https://app.example.com/",
        });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      app_id: "hub",
      challenge_id: "challenge-id",
      otp: "123456",
      return_to: "https://app.example.com/",
    }),
    headers: await otpHeaders("challenge-id"),
    method: "POST",
  });

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
});

test("Account Worker OTP success ignores tampered app_id and return_to form fields", async () => {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/otp-challenge/consume") {
        const body = decodeJsonBody(init);
        expect(body.challenge_id).toBe("challenge-id");
        expect(body.otp).toBe("123456");
        return Response.json({
          app_id: "hub",
          discord_id: "123456789",
          return_to: "https://app.example.com/_auth/callback",
        });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      app_id: "unknown",
      challenge_id: "challenge-id",
      otp: "123456",
      return_to: "https://evil.example.com/callback",
    }),
    headers: await otpHeaders("challenge-id"),
    method: "POST",
  });
  const location = new URL(response.headers.get("location") ?? "");

  expect(response.status).toBe(302);
  expect(location.origin).toBe("https://auth.example.com");
  expect(location.pathname).toBe("/authorize");
  expect(location.searchParams.get("app_id")).toBe("hub");
  expect(location.searchParams.get("return_to")).toBe(
    "https://app.example.com/_auth/callback",
  );
});

test("Account Worker OTP success creates account and remember cookies when remember_me is on", async () => {
  const calls: string[] = [];
  const rememberCreateBodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      if (url.pathname === "/otp-challenge/consume") {
        const body = decodeJsonBody(init);
        expect(body.challenge_id).toBe("challenge-id");
        expect(body.otp).toBe("123456");
        return Response.json({
          discord_id: "123456789",
          return_to: "https://app.example.com/",
        });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      if (url.pathname === "/remember/create") {
        const body = decodeJsonBody(init);
        rememberCreateBodies.push(body);
        expect(body.discord_id).toBe("123456789");
        expect(typeof body.token_hash).toBe("string");
        return Response.json({ ok: true });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      challenge_id: "challenge-id",
      otp: "123456",
      remember_me: "1",
      return_to: "https://app.example.com/",
    }),
    headers: await otpHeaders("challenge-id"),
    method: "POST",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
  expect(setCookie).toContain(`${sessionCookieName}=`);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  expect(setCookie).toContain("Max-Age=15552000");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  const rememberValue = rememberCookieValue(setCookie);
  expect(rememberValue).not.toBeNull();
  const rememberParts = rememberValue?.split(".");
  expect(rememberParts).toHaveLength(2);
  const rememberCreateBody = rememberCreateBodies[0];
  expect(rememberCreateBody?.token_id).toBe(rememberParts?.[0]);
  expect(rememberCreateBody?.token_hash).toBe(
    await hashTokenForTest(rememberParts?.[1] ?? ""),
  );
  expect(rememberCreateBody).not.toHaveProperty("random_token");
  expect(rememberCreateBody?.expires_at).toBeGreaterThanOrEqual(
    Math.floor(Date.now() / 1000) + 15_552_000 - 1,
  );
  expect(calls).toContain("/otp-challenge/consume");
  expect(calls).toContain("/users/verify-active");
  expect(calls).toContain("/remember/create");
});

test("Account Worker restores an account session with a valid remember cookie", async () => {
  const oldRandomToken = "old-random-token";
  const rememberRotateBodies: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/remember/rotate") {
        const body = decodeJsonBody(init);
        rememberRotateBodies.push(body);
        expect(body.token_id).toBe("remember-id");
        expect(body.old_token_hash).toBe(
          await hashTokenForTest(oldRandomToken),
        );
        expect(typeof body.new_token_hash).toBe("string");
        return Response.json({ user: activeUser });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://account.example.com/", {
    headers: {
      cookie: `${rememberCookieName}=remember-id.${oldRandomToken}`,
    },
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain("アカウント設定");
  expect(body).toContain("data-avatar-csrf");
  expect(setCookie).toContain(`${sessionCookieName}=`);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  const rememberRotateBody = rememberRotateBodies[0];
  expect(rememberRotateBody?.expires_at).toBeGreaterThanOrEqual(
    Math.floor(Date.now() / 1000) + 15_552_000 - 1,
  );
});

test("Account Worker clears remember cookies that cannot restore a session", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "invalid_remember_token" }, { status: 401 }),
  );

  const response = await fetchAccount("https://account.example.com/", {
    headers: {
      cookie: `${rememberCookieName}=remember-id.invalid-token`,
    },
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(200);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  expect(setCookie).toContain("Max-Age=0");
});

test("Account Worker OTP success skips remember token creation when remember_me is off", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push(url.pathname);
      if (url.pathname === "/otp-challenge/consume") {
        const body = decodeJsonBody(init);
        expect(body.challenge_id).toBe("challenge-id");
        expect(body.otp).toBe("123456");
        return Response.json({
          discord_id: "123456789",
          return_to: "https://app.example.com/",
        });
      }
      if (url.pathname === "/users/verify-active") {
        return Response.json({ user: activeUser });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    },
  );

  const response = await fetchAccount("https://auth.example.com/otp", {
    body: new URLSearchParams({
      challenge_id: "challenge-id",
      otp: "123456",
      return_to: "https://app.example.com/",
    }),
    headers: await otpHeaders("challenge-id"),
    method: "POST",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
  expect(setCookie).toContain(`${sessionCookieName}=`);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  expect(setCookie).toContain("Max-Age=0");
  expect(calls).toContain("/otp-challenge/consume");
  expect(calls).toContain("/users/verify-active");
  expect(calls).not.toContain("/remember/create");
});

async function fetchAccount(
  url: string,
  init?: RequestInit,
): Promise<Response> {
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

async function createAccountSession(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signSessionCookie(
    {
      discord_id: "123456789",
      display_name: "Akaaku",
      exp: now + 86_400,
      iat: now,
      kid: env.SESSION_KID,
      role: "admin",
    },
    env.SESSION_HMAC_SECRET,
  );
}

async function createAppSession(appId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await signSessionCookie(
    {
      app_id: appId,
      discord_id: "123456789",
      display_name: "Akaaku",
      exp: now + 3_600,
      iat: now,
      kid: env.SESSION_KID,
      role: "admin",
    },
    "app-session-secret",
  );
}

async function createAccountCsrfToken(
  action: "profile" | "avatar" | "delete" | "logout",
): Promise<string> {
  return await createCsrfToken({
    action,
    discordId: "123456789",
    kid: env.CSRF_KID,
    now: Math.floor(Date.now() / 1000),
    origin: "https://account.example.com",
    secret: env.CSRF_HMAC_SECRET,
  });
}

async function tokenHeaders(
  appId: string,
  code: string,
): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    "x-app-token-signature": await hmacSha256Base64Url(
      "app-session-secret",
      `${appId}.${code}`,
    ),
  };
}

async function otpHeaders(
  challengeId: string,
): Promise<Record<string, string>> {
  const state = await createOtpState(challengeId, testAccountConfig());
  return {
    cookie: `${otpStateCookieName}=${encodeURIComponent(state)}`,
  };
}

async function createCallbackState(appId?: string): Promise<string> {
  const { createAuthState } = await import(
    "../../workers/account/src/security/authState.js"
  );
  const state = await createAuthState(
    "https://app.example.com/_auth/callback",
    testAccountConfig(),
    appId,
  );
  if (!state) {
    throw new Error("Callback state was not created");
  }
  return state;
}

function testAccountConfig(): AccountConfig {
  return {
    csrf: {
      kid: env.CSRF_KID,
      secret: env.CSRF_HMAC_SECRET,
    },
    navigation: {
      ACCOUNT_URL: env.ACCOUNT_URL,
      ALLOWED_RETURN_TO_ORIGINS: "https://app.example.com",
      AUTH_BASE_URL: env.ACCOUNT_URL,
      AUTH_CALLBACK_URL: `${env.ACCOUNT_URL}/callback`,
    },
  } as AccountConfig;
}

function decodeJsonBody(
  init: RequestInit | undefined,
): Record<string, unknown> {
  if (!init?.body) {
    return {};
  }
  const body =
    init.body instanceof Uint8Array
      ? new TextDecoder().decode(init.body)
      : String(init.body);
  return JSON.parse(body) as Record<string, unknown>;
}

function rememberCookieValue(setCookie: string): string | null {
  const match = setCookie.match(/__Host-org_remember=([^;,]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function hashTokenForTest(value: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(value));
}

const activeUser = {
  discord_id: "123456789",
  display_name: "Akaaku",
  role: "admin",
  status: "active",
};
