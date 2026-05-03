import { createExecutionContext } from "cloudflare:test";
import { afterEach, expect, test, vi } from "vitest";
import {
  appSessionCookieName,
  signSessionCookie,
} from "../../shared/src/session.js";
import worker from "../../workers/app/src/index.js";

const env = {
  ACCOUNT_URL: "https://auth.example.com",
  APP_ID: "hub",
  APP_SESSION_HMAC_SECRET: "app-session-secret",
  DOMAIN_NAME: "example.com",
  SESSION_KID: "app-session-key",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test("App Worker rejects API requests without a valid app session", async () => {
  const response = await fetchApp("https://app.example.com/api/me");

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
  expect(location.searchParams.get("return_to")).toBe(
    "https://app.example.com/_auth/callback?return_to=https%3A%2F%2Fapp.example.com%2Fdashboard",
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
  expect(location.searchParams.get("return_to")).toBe(
    "https://app.example.com/_auth/callback?return_to=https%3A%2F%2Fapp.example.com%2F",
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
  expect(location.searchParams.get("return_to")).toBe(
    "https://app.example.com/_auth/callback?return_to=https%3A%2F%2Fapp.example.com%2F",
  );
});

test("App Worker rejects callback requests without an auth code", async () => {
  const response = await fetchApp("https://app.example.com/_auth/callback");

  expect(response.status).toBe(401);
});

test("App Worker rejects callback requests when token exchange fails", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({ error: "invalid_auth_code" }, { status: 401 }),
  );

  const response = await fetchApp(
    "https://app.example.com/_auth/callback?code=bad-code",
  );

  expect(response.status).toBe(401);
});

test("App Worker exchanges a code and creates an app session cookie", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      user: {
        discord_id: "123456789",
        display_name: "Akaaku",
        role: "admin",
      },
    }),
  );

  const response = await fetchApp(
    "https://app.example.com/_auth/callback?code=auth-code&return_to=https%3A%2F%2Fapp.example.com%2Fdashboard%23secret",
  );

  const setCookie = response.headers.get("set-cookie") ?? "";
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    "https://app.example.com/dashboard",
  );
  expect(setCookie).toContain(`${appSessionCookieName("hub")}=`);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  expect(setCookie).toContain("SameSite=Lax");
});

test("App Worker callback falls back to the app root for cross-origin return_to values", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      user: {
        discord_id: "123456789",
        display_name: "Akaaku",
        role: "admin",
      },
    }),
  );

  const response = await fetchApp(
    "https://app.example.com/_auth/callback?code=auth-code&return_to=https%3A%2F%2Fevil.example.com%2Fdashboard",
  );

  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("https://app.example.com/");
});

test("App Worker returns the current user with a valid app session", async () => {
  const session = await createAppSession("hub");
  const response = await fetchApp("https://app.example.com/api/me", {
    headers: {
      cookie: `${appSessionCookieName("hub")}=${encodeURIComponent(session)}`,
    },
  });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    user: {
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
    },
  });
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
    env.APP_SESSION_HMAC_SECRET,
  );
}
