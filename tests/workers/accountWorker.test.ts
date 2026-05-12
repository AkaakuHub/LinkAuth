import { env as cloudflareEnv, createExecutionContext } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { hmacSha256Base64Url, sha256Hex } from "../../shared/src/crypto.js";
import { createCsrfToken } from "../../shared/src/csrf.js";
import {
  appSessionCookieName,
  rememberCookieName,
  sessionCookieName,
  signSessionCookie,
} from "../../shared/src/session.js";
import { loadAccountConfig } from "../../workers/account/src/accountConfig.js";
import { createOtpChallenge } from "../../workers/account/src/data/otpChallenges.js";
import { createRememberToken } from "../../workers/account/src/data/rememberTokens.js";
import {
  d1DropSchemaStatements,
  d1SchemaStatements,
} from "../../workers/account/src/data/schema.js";
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
  DISCORD_PUBLIC_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  DISCORD_GUILD_IDS: "guild",
  DOMAIN_NAME: "example.com",
  DB: cloudflareEnv.DB,
  OTP_HMAC_SECRET: "otp-secret",
  SESSION_HMAC_SECRET: "account-session-secret",
  SESSION_KID: "account-session-key",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await resetDatabase();
  await seedActiveUser();
});

test("Account Worker rejects authorize requests for unknown apps", async () => {
  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=unknown&return_to=https%3A%2F%2Fapp.example.com%2F_auth%2Fcallback",
  );

  expect(response.status).toBe(401);
});

test("Account Worker HTML responses include browser security headers", async () => {
  const response = await fetchAccount("https://auth.example.com/");

  expect(response.headers.get("content-security-policy")).toBe(
    "default-src 'none'; base-uri 'none'; connect-src 'self'; form-action 'self' https: http://localhost:*; frame-ancestors 'none'; img-src 'self' data: blob: https: http://localhost:*; script-src 'self'; style-src 'self' 'unsafe-inline'",
  );
  expect(response.headers.get("referrer-policy")).toBe("same-origin");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
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
  stubDiscordGuildMember();
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

test("Account Worker inactive authorize errors return to the app callback", async () => {
  await replaceActiveUser({
    disabledReason: "manual",
    status: "disabled",
  });
  const session = await createAccountSession();

  const response = await fetchAccount(
    "https://auth.example.com/authorize?app_id=hub&return_to=https%3A%2F%2Fapp.example.com%2F_auth%2Fcallback%3Fstate%3Dapp-state",
    {
      headers: {
        cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      },
    },
  );
  const body = await response.text();

  expect(response.status).toBe(401);
  expect(body).toContain("利用資格がありません");
  expect(body).toContain(
    'href="https://app.example.com/_auth/callback?state=app-state"',
  );
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

test("Account Worker token endpoint rejects unknown apps before data access", async () => {
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
  await replaceActiveUser({
    displayName: "Current Akaaku",
    iconKey: "icons/123456789/avatar.webp",
    iconSource: "r2",
  });
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
      display_name: "Current Akaaku",
      icon_key: "icons/123456789/avatar.webp",
      icon_source: "r2",
      role: "admin",
      status: "active",
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
  await replaceActiveUser({
    disabledReason: "manual",
    status: "disabled",
  });
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
  await expectUserDisplayName("Akaaku");
});

test("Account Worker profile update normalizes display names", async () => {
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("profile");

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      display_name: "  Current Akaaku  ",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://account.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(303);
  await expectUserDisplayName("Current Akaaku");
});

test("Account Worker profile update rejects invalid display names", async () => {
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("profile");

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      display_name: "",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://account.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(400);
  await expectUserDisplayName("Akaaku");
});

test("Account Worker profile update rejects inactive users", async () => {
  await replaceActiveUser({
    disabledReason: "manual",
    status: "disabled",
  });
  const session = await createAccountSession();
  const csrfToken = await createAccountCsrfToken("profile");

  const response = await fetchAccount("https://account.example.com/profile", {
    body: new URLSearchParams({
      csrf_token: csrfToken,
      display_name: "Current Akaaku",
    }),
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
      origin: "https://account.example.com",
    },
    method: "POST",
  });

  expect(response.status).toBe(401);
  await expectUserDisplayName("Akaaku");
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
  await createRememberToken(testAccountConfig(), {
    discordId: activeUser.discord_id,
    expiresAt: Math.floor(Date.now() / 1000) + 15_552_000,
    tokenHash: await hashTokenForTest("random-token"),
    tokenId: "remember-id",
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
      origin: "https://account.example.com",
    },
    method: "POST",
  });
  const setCookie = response.headers.get("set-cookie") ?? "";

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
  await expectRememberTokenDeleted("remember-id");
  expect(setCookie).toContain(`${sessionCookieName}=`);
  expect(setCookie).toContain(`${rememberCookieName}=`);
  expect(setCookie).toContain("Max-Age=0");
});

test("Account Worker callback creates an OTP challenge and renders the OTP form", async () => {
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
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/v10/guilds/guild/members/123456789") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/v10/users/@me/channels") {
      return Response.json({ id: "dm-channel" });
    }
    if (url.pathname === "/api/v10/channels/dm-channel/messages") {
      return Response.json({ ok: true });
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
  expect(calls).toContain("/api/v10/users/@me/channels");
  expect(calls).toContain("/api/v10/channels/dm-channel/messages");
  await expectOtpChallengeCount(1);
});

test("Account Worker callback shows a delivery error when Discord DM sending throws", async () => {
  const state = await createCallbackState("hub");
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
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
    if (url.pathname === "/api/v10/guilds/guild/members/123456789") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/v10/users/@me/channels") {
      throw new Error("discord unavailable");
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
  const state = await createCallbackState(
    "hub",
    "https://app.example.com/_auth/callback?state=app-state",
  );
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
  expect(body).toContain(
    'href="https://app.example.com/_auth/callback?state=app-state"',
  );
  expect(calls).toContain("/api/v10/users/@me/guilds/guild/member");
  await expectOtpChallengeCount(0);
});

test("Account Worker OTP success returns to authorize for app callbacks", async () => {
  await seedOtpChallenge({
    appId: "hub",
    returnTo: "https://app.example.com/_auth/callback",
  });

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
  await seedOtpChallenge({
    appId: "hub",
    returnTo: "https://app.example.com/",
  });

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
  await seedOtpChallenge({
    appId: "hub",
    returnTo: "https://app.example.com/_auth/callback",
  });

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
  await seedOtpChallenge({
    returnTo: "https://app.example.com/",
  });

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
  await expectRememberToken(
    rememberParts?.[0] ?? "",
    await hashTokenForTest(rememberParts?.[1] ?? ""),
  );
});

test("Account Worker restores an account session with a valid remember cookie", async () => {
  const oldRandomToken = "old-random-token";
  await createRememberToken(testAccountConfig(), {
    discordId: activeUser.discord_id,
    expiresAt: Math.floor(Date.now() / 1000) + 15_552_000,
    tokenHash: await hashTokenForTest(oldRandomToken),
    tokenId: "remember-id",
  });
  stubDiscordGuildMember();

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
  await expectRememberTokenRotated("remember-id", oldRandomToken);
});

test("Account Worker account page renders the current icon", async () => {
  await replaceActiveUser({
    iconKey: "icons/123456789/avatar.webp",
    iconSource: "r2",
  });
  const session = await createAccountSession();

  const response = await fetchAccount("https://account.example.com/", {
    headers: {
      cookie: `${sessionCookieName}=${encodeURIComponent(session)}`,
    },
  });
  const body = await response.text();

  expect(response.status).toBe(200);
  expect(body).toContain('src="/assets/icons/123456789/avatar.webp"');
  expect(body).toContain("data-avatar-input");
  expect(body).toContain("data-avatar-cropper-dialog");
  expect(body).not.toContain("Discord ID");
  expect(body).not.toContain("権限");
  expect(body).not.toContain("状態");
});

test("Account Worker clears remember cookies that cannot restore a session", async () => {
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
  await seedOtpChallenge({
    returnTo: "https://app.example.com/",
  });

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
  await expectRememberTokenCount(0);
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

async function createCallbackState(
  appId?: string,
  returnTo = "https://app.example.com/_auth/callback",
): Promise<string> {
  const { createAuthState } = await import(
    "../../workers/account/src/security/authState.js"
  );
  const state = await createAuthState(returnTo, testAccountConfig(), appId);
  if (!state) {
    throw new Error("Callback state was not created");
  }
  return state;
}

function testAccountConfig() {
  return loadAccountConfig(env);
}

function rememberCookieValue(setCookie: string): string | null {
  const match = setCookie.match(/__Host-org_remember=([^;,]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function hashTokenForTest(value: string): Promise<string> {
  return await sha256Hex(new TextEncoder().encode(value));
}

function stubDiscordGuildMember(): void {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === "/api/v10/guilds/guild/members/123456789") {
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  });
}

async function expectUserDisplayName(displayName: string): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT display_name FROM users WHERE discord_id = ?",
  )
    .bind(activeUser.discord_id)
    .first<{ display_name: string }>();
  expect(row?.display_name).toBe(displayName);
}

async function expectOtpChallengeCount(count: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM otp_challenges",
  ).first<{ count: number }>();
  expect(row?.count).toBe(count);
}

async function expectRememberToken(
  tokenId: string,
  tokenHash: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT discord_id, token_hash, expires_at FROM remember_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ discord_id: string; token_hash: string; expires_at: number }>();
  expect(row?.discord_id).toBe(activeUser.discord_id);
  expect(row?.token_hash).toBe(tokenHash);
  expect(row?.expires_at).toBeGreaterThanOrEqual(
    Math.floor(Date.now() / 1000) + 15_552_000 - 1,
  );
}

async function expectRememberTokenRotated(
  tokenId: string,
  oldRandomToken: string,
): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT token_hash, expires_at FROM remember_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ token_hash: string; expires_at: number }>();
  expect(row?.token_hash).not.toBe(await hashTokenForTest(oldRandomToken));
  expect(row?.expires_at).toBeGreaterThanOrEqual(
    Math.floor(Date.now() / 1000) + 15_552_000 - 1,
  );
}

async function expectRememberTokenDeleted(tokenId: string): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT token_id FROM remember_tokens WHERE token_id = ?",
  )
    .bind(tokenId)
    .first<{ token_id: string }>();
  expect(row).toBeNull();
}

async function expectRememberTokenCount(count: number): Promise<void> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM remember_tokens",
  ).first<{ count: number }>();
  expect(row?.count).toBe(count);
}

const activeUser = {
  discord_id: "123456789",
  display_name: "Akaaku",
  role: "admin",
  status: "active",
};

async function resetDatabase(): Promise<void> {
  for (const statement of d1DropSchemaStatements) {
    await env.DB.prepare(statement).run();
  }
  for (const statement of d1SchemaStatements) {
    await env.DB.prepare(statement).run();
  }
}

async function seedActiveUser(
  input: {
    displayName?: string;
    iconKey?: string;
    iconSource?: "discord" | "r2" | "none";
    status?: "active" | "disabled" | "deleted";
    disabledReason?: string | null;
  } = {},
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (
        discord_id, display_name, role, status, guild_id, guild_member_status,
        guild_checked_at, disabled_reason, icon_source, icon_key, created_at,
        updated_at
      ) VALUES (?, ?, 'admin', ?, 'guild', 'active', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      activeUser.discord_id,
      input.displayName ?? activeUser.display_name,
      input.status ?? "active",
      now,
      input.disabledReason ?? null,
      input.iconSource ?? null,
      input.iconKey ?? null,
      now,
      now,
    )
    .run();
}

async function replaceActiveUser(
  input: Parameters<typeof seedActiveUser>[0],
): Promise<void> {
  await env.DB.prepare("DELETE FROM users WHERE discord_id = ?")
    .bind("123456789")
    .run();
  await seedActiveUser(input);
}

async function seedOtpChallenge(input: {
  appId?: string;
  challengeId?: string;
  otp?: string;
  returnTo?: string;
}): Promise<void> {
  await createOtpChallenge(testAccountConfig(), {
    challengeId: input.challengeId ?? "challenge-id",
    discordId: activeUser.discord_id,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    otp: input.otp ?? "123456",
    returnTo: input.returnTo ?? "https://app.example.com/",
    ...(input.appId ? { appId: input.appId } : {}),
  });
}
