import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
  appSessionCookieName,
  rememberCookieName,
  sessionCookieName,
} from "../../src/session.js";
import accountWorker from "../../workers/account/src/index.js";
import type { Env as AccountEnv } from "../../workers/account/src/types.js";
import appWorker from "../../workers/app/src/index.js";

type WorkerHandler<Env> = NonNullable<ExportedHandler<Env>["fetch"]>;

type TestServer = {
  origin: string;
  close(): Promise<void>;
};

type MockState = {
  authCodes: Map<string, Record<string, unknown>>;
  users: Map<string, typeof user>;
  otpChallenges: Map<string, Record<string, unknown>>;
  lastOtp: string | null;
  rememberCreateCount: number;
};

const user = {
  discord_id: "123456789",
  display_name: "Akaaku",
  role: "admin",
  status: "active",
} as const;

const localhostCertificate = {
  key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCcixo8YHpBFw6p
cONWmugDL7ntXmTocXYjZcf0+X+3dNVCJJb3218245t+01B9fbhyZK1vpExuTFKr
ZCnD9pJQFASXplRnTa1RpBsKCamwTXw4B+wq8Ad27bnx2b8JyJEcrMhL+EntouWN
f8i6AbnLp2LOhkavNQthbIgN96uwY5FC4yHAgJqP4LqlF+JrEI9s0JzIaaVnDdYb
/76fU+K4ABVartQXCAUMA/T0LO7F1mDoLwV1VM8mB3qGef48crRFPckE9yZM5a/3
gb15f3mF42Hxi3ekv5rEBvKyX+2b1+E65+boh/opkamWU8GZvsQ2gX1bnxql7iM0
tPlqDyG3AgMBAAECggEABANDo4ywJoTAuwzzkyOiOKjOeXl/UYL6WOylozrzsii5
S60p9vEgsd8XKV8K3EYOzAnDz6nuGJIuR9kkGLM4QFYRJQK6UDW1li+ETtzqT9zt
jqRAK/UgPMy70CIKXW1sziIh1ETw5G57imAD4nE2aX+blJy/fCk2k/+gZAYXURug
IFhre9PNNURhIOlRoSWSI4oTfFiCRiHMLsBhk52cZ37R24+PXn2V+6FTemHl4NdM
mBpnBCNw+afv/xGu7BKZBARMBy+O+7sW6BfgM/qr2TAAdDxjogHE/TidofvZCHJV
zp2ciXk53w2HJSqINouiqvYMdNNWSYKecDxbAYBLoQKBgQDQiovs19ZGi1F1bgAR
rEr4FJoCl8P7vgmOuCvSlXbVKjR4OLdDmA4m1C/MlLD1SdawxbSKag4qqZY74thR
FGZb2RIe9SzE05xqpx3iLNEHd6eVeh8c2mLGeXN4mI8fMF/RUdfManxGcR0aSiyF
qmSZZkGJPGmIMHfQmHGnyx/XRwKBgQDAKzOVUp627IlZAgxXAdqheZR8gk8e1lYU
jXyeD+KyeTKy2Rby4pAX9R38Xmn/gMkMq6K12r0JzuM/KsQuBdWgESX3I/EPpJ/h
pLqL0iDTA0H5xQnlsowGWN73Xp77f8v6t+B/9a/nautkEP7yREyd/5GRrDK0VG02
2C6jXdZ6EQKBgHj4tby5Y+peLO3C1rVpzb9lLAXvBdhF4ANzYLBy1ZFIP1GyDNVg
Im1xzxyM8K4JnEnFFjro1Lj40VaB+9vkyo/jNvjQXpz66BSSRuqJ9uOvDH7QbbXu
FThvAYXmcbe09xBUuqsw5lByk2BJwNP1CRBXWhMDAXDoNMjDdcLROPJHAoGBAKKC
Zkb67ZmIAsawwrq5qKgxZu68TCip3XXYCPCqQm3nrIYurAeOrYh1E3yeY0ldIaiD
ZUAg0QiAWxDKG8lHydZpag/L50nxT/vEELW5Z2TLNnoAtVP4YA3mDfhnnk7VTiyi
X0oW/UDY3GNtNAyw0ZIz1Gi6lM6HLyzYOOiSrJPhAoGALvvoo/eLC3y+rQT5DoIj
XXbtBq3D7crcm86qWIx691noFnPqO7jH8kP1hen2mKZ+wJref3Rm0EDdVIj8s1AC
rvtdtOq1JarfWcRbpSPeHl2J3s23bdiFPwmrqKJil4ybDELLjq+KxkL/4LBOeHH7
UFEkUzbtWainl4LvsCox7dg=
-----END PRIVATE KEY-----`,
  cert: `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUHJ2PDLRKAaBqU1B99KNWNWx1d+wwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUxNDA4MTU0N1oXDTM2MDUx
MTA4MTU0N1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAnIsaPGB6QRcOqXDjVproAy+57V5k6HF2I2XH9Pl/t3TV
QiSW99tfNuObftNQfX24cmStb6RMbkxSq2Qpw/aSUBQEl6ZUZ02tUaQbCgmpsE18
OAfsKvAHdu258dm/CciRHKzIS/hJ7aLljX/IugG5y6dizoZGrzULYWyIDfersGOR
QuMhwICaj+C6pRfiaxCPbNCcyGmlZw3WG/++n1PiuAAVWq7UFwgFDAP09CzuxdZg
6C8FdVTPJgd6hnn+PHK0RT3JBPcmTOWv94G9eX95heNh8Yt3pL+axAbysl/tm9fh
Oufm6If6KZGpllPBmb7ENoF9W58ape4jNLT5ag8htwIDAQABo28wbTAdBgNVHQ4E
FgQUPgTp6UsxQ8oiZFtT708hD1tqiggwHwYDVR0jBBgwFoAUPgTp6UsxQ8oiZFtT
708hD1tqiggwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAFBp+MH+TssxwrvQGI0XyF0fFOxhwre4
ES3i/akqH6SkMgoGiR5sP/8W4QJFZvRoLp+AHagSDycBvYy+xndhh/bqLFV45aIa
HvMuDRZpGofTr3MlFl/TBlXiPQ4sFAENyW3YmK0jyRUFybMfjpWLJpvUfKNbeCSN
sDPz98nXRCj9f4Oh73VGq7MC753aG3U5+zpHFeCvY3wSz8ymISXfaY+9MRIM1oku
7y26Hn7W23dxwMm2EzPWX3b08WTSyEkI8VBUKbSA9vaoyz/gU28955mUZIO8s5qQ
4FNn0V37Orh1fxDAN2MPPld0Jp1bYYdXnyztodHLCibhzFsLLUKYt+c=
-----END CERTIFICATE-----`,
};

test("App login completes through Discord OTP and creates a remember cookie by default", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();

  await expect(page.getByRole("heading", { name: "OTP認証" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "この端末でログイン状態を保持する",
    }),
  ).toBeChecked();
  expect(servers.state.lastOtp).toMatch(/^[0-9]{6}$/);

  await page.getByLabel("認証コード").fill(servers.state.lastOtp ?? "");
  await page.getByRole("button", { name: "認証" }).click();

  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();
  await expect(page.getByText("@123456789")).toBeVisible();

  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === appSessionCookieName("hub")),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === sessionCookieName)).toBe(
    true,
  );
  expect(cookies.some((cookie) => cookie.name === rememberCookieName)).toBe(
    true,
  );
  expect(servers.state.rememberCreateCount).toBe(1);
});

test("App login completes without a remember cookie when remember_me is off", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();
  await page
    .getByRole("checkbox", { name: "この端末でログイン状態を保持する" })
    .uncheck();
  await page.getByLabel("認証コード").fill(servers.state.lastOtp ?? "");
  await page.getByRole("button", { name: "認証" }).click();

  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();

  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === appSessionCookieName("hub")),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === sessionCookieName)).toBe(
    true,
  );
  expect(cookies.some((cookie) => cookie.name === rememberCookieName)).toBe(
    false,
  );
  expect(servers.state.rememberCreateCount).toBe(0);
});

test("App session is cleared after logging out from the account page", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();
  await expect(page.getByRole("heading", { name: "OTP認証" })).toBeVisible();
  await page.getByLabel("認証コード").fill(servers.state.lastOtp ?? "");
  await page.getByRole("button", { name: "認証" }).click();
  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();

  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();
  await page.getByRole("button", { name: "ログアウト" }).click();

  await expect(page).toHaveURL(`${servers.app.origin}/login`);
  await expect(
    page.getByRole("heading", { name: "appにログイン" }),
  ).toBeVisible();
  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === appSessionCookieName("hub")),
  ).toBe(false);
  expect(cookies.some((cookie) => cookie.name === sessionCookieName)).toBe(
    false,
  );
  expect(cookies.some((cookie) => cookie.name === rememberCookieName)).toBe(
    false,
  );

  await page.goto(servers.app.origin);
  await expect(page).toHaveURL(`${servers.app.origin}/login`);
  await expect(
    page.getByRole("heading", { name: "appにログイン" }),
  ).toBeVisible();
});

async function startAuthFlowServers(): Promise<
  AsyncDisposable & {
    account: TestServer;
    app: TestServer;
    state: MockState;
  }
> {
  const state: MockState = {
    authCodes: new Map(),
    users: new Map([[user.discord_id, user]]),
    otpChallenges: new Map(),
    lastOtp: null,
    rememberCreateCount: 0,
  };
  const mock = await startMockServer(state);
  let accountOrigin = "";
  const app = await startWorkerServer(appWorker.fetch, () => ({
    ACCOUNT_URL: accountOrigin,
    APP_ID: "hub",
    APP_SESSION_HMAC_SECRET: "app-session-secret",
    DOMAIN_NAME: "localhost",
    SESSION_KID: "session-key",
  }));
  const account = await startWorkerServer<AccountEnv>(accountWorker.fetch, () =>
    accountEnv({
      accountOrigin,
      appOrigin: app.origin,
      mockOrigin: mock.origin,
      state,
    }),
  );
  accountOrigin = account.origin;
  const originalFetch = globalThis.fetch;
  const originalTlsRejectUnauthorized =
    process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (
      url.origin === "https://discord.com" &&
      url.pathname.startsWith("/api/v10")
    ) {
      throw new Error("Unexpected real Discord API fetch in auth flow E2E");
    }
    return await originalFetch(input, init);
  };

  return {
    account,
    app,
    state,
    async [Symbol.asyncDispose]() {
      globalThis.fetch = originalFetch;
      if (originalTlsRejectUnauthorized === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED =
          originalTlsRejectUnauthorized;
      }
      await app.close();
      await account.close();
      await mock.close();
    },
  };
}

function accountEnv(input: {
  accountOrigin: string;
  appOrigin: string;
  mockOrigin: string;
  state: MockState;
}): AccountEnv {
  return {
    ACCOUNT_URL: input.accountOrigin,
    ASSETS: unusedR2Bucket(),
    AUTH_APPS: JSON.stringify([
      {
        app_id: "hub",
        callback_url: `${input.appOrigin}/_auth/callback`,
        session_verify_secret: "app-session-secret",
      },
    ]),
    CSRF_HMAC_SECRET: "csrf-secret",
    CSRF_KID: "csrf-key",
    DB: testD1Database(input.state),
    DISCORD_API_BASE: `${input.mockOrigin}/discord`,
    DISCORD_BOT_TOKEN: "discord-bot-token",
    DISCORD_CLIENT_ID: "discord-client-id",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
    DISCORD_PUBLIC_KEY:
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    DISCORD_GUILD_IDS: "guild",
    DOMAIN_NAME: "localhost",
    OTP_HMAC_SECRET: "otp-secret",
    SESSION_HMAC_SECRET: "account-session-secret",
    SESSION_KID: "session-key",
  };
}

async function startMockServer(state: MockState): Promise<TestServer> {
  return await startHttpServer(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/discord/oauth2/authorize") {
      const stateValue = url.searchParams.get("state");
      if (!stateValue) {
        return Response.json({ error: "missing_state" }, { status: 400 });
      }
      const redirectUri = url.searchParams.get("redirect_uri");
      if (!redirectUri) {
        return Response.json(
          { error: "missing_redirect_uri" },
          { status: 400 },
        );
      }
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set("code", "discord-code");
      callbackUrl.searchParams.set("state", stateValue);
      return new Response(null, {
        headers: { location: callbackUrl.toString() },
        status: 302,
      });
    }
    if (url.pathname === "/discord/oauth2/token") {
      return Response.json({ access_token: "discord-access-token" });
    }
    if (url.pathname === "/discord/users/@me") {
      return Response.json({ id: user.discord_id });
    }
    if (url.pathname === "/discord/users/@me/guilds/guild/member") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/discord/guilds/guild/members/123456789") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/discord/users/@me/channels") {
      return Response.json({ id: "dm-channel" });
    }
    if (url.pathname === "/discord/channels/dm-channel/messages") {
      const body = (await request.json()) as { content?: unknown };
      const match =
        typeof body.content === "string"
          ? body.content.match(/認証コード: ([0-9]{6})/)
          : null;
      if (match?.[1]) {
        state.lastOtp = match[1];
      }
      return Response.json({ ok: true });
    }
    return Response.json({ error: "not_found" }, { status: 404 });
  });
}

async function startWorkerServer<Env>(
  fetchHandler: WorkerHandler<Env> | undefined,
  env: () => Env,
): Promise<TestServer> {
  if (!fetchHandler) {
    throw new Error("Worker fetch handler is not defined");
  }
  return await startHttpServer(async (request) => {
    return await fetchHandler(
      request as Request<unknown, IncomingRequestCfProperties<unknown>>,
      env(),
      executionContext,
    );
  });
}

async function startHttpServer(
  handler: (request: Request) => Promise<Response>,
): Promise<TestServer> {
  const server = createServer(
    localhostCertificate,
    async (incoming, outgoing) => {
      try {
        await sendResponse(
          outgoing,
          await handler(await nodeRequest(incoming)),
        );
      } catch (error) {
        outgoing.statusCode = 500;
        outgoing.end(error instanceof Error ? error.message : "internal error");
      }
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `https://localhost:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function nodeRequest(incoming: IncomingMessage): Promise<Request> {
  const { port } = incoming.socket.localAddress
    ? (incoming.socket.address() as AddressInfo)
    : { port: 0 };
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const method = incoming.method ?? "GET";
  const init: RequestInit = {
    headers,
    method,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(`https://localhost:${port}${incoming.url ?? "/"}`, init);
}

async function sendResponse(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      outgoing.setHeader(key, value);
    }
  });
  const setCookie = getSetCookie(response.headers);
  if (setCookie.length > 0) {
    outgoing.setHeader("set-cookie", setCookie);
  }
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function getSetCookie(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values = withGetSetCookie.getSetCookie?.();
  if (values) {
    return values;
  }
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

const executionContext = {
  passThroughOnException(): void {},
  props: undefined,
  waitUntil(): void {},
} satisfies ExecutionContext<unknown>;

function unusedR2Bucket(): R2Bucket {
  return {
    async createMultipartUpload(): Promise<R2MultipartUpload> {
      throw new Error("R2 multipart upload is not used in auth flow E2E");
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
      throw new Error("R2 put is not used in auth flow E2E");
    },
    resumeMultipartUpload(): R2MultipartUpload {
      throw new Error("R2 multipart upload is not used in auth flow E2E");
    },
  };
}

function testD1Database(state: MockState): D1Database {
  return {
    batch<T = unknown>(): Promise<D1Result<T>[]> {
      throw new Error("D1 batch is not used in auth flow E2E");
    },
    dump(): Promise<ArrayBuffer> {
      throw new Error("D1 dump is not used in auth flow E2E");
    },
    exec(): Promise<D1ExecResult> {
      throw new Error("D1 exec is not used in auth flow E2E");
    },
    prepare(query: string): D1PreparedStatement {
      return testD1Statement(state, query);
    },
    withSession(): D1DatabaseSession {
      return {
        batch<T = unknown>(): Promise<D1Result<T>[]> {
          throw new Error("D1 session batch is not used in auth flow E2E");
        },
        getBookmark(): D1SessionBookmark | null {
          return null;
        },
        prepare(query: string): D1PreparedStatement {
          return testD1Statement(state, query);
        },
      };
    },
  };
}

function testD1Statement(state: MockState, query: string): D1PreparedStatement {
  let values: unknown[] = [];
  return {
    bind(...bindings: unknown[]): D1PreparedStatement {
      values = bindings;
      return this;
    },
    first<T = unknown>(): Promise<T | null> {
      return Promise.resolve(selectD1Row(state, query, values) as T | null);
    },
    raw(): Promise<unknown[]> {
      throw new Error("D1 raw is not used in auth flow E2E");
    },
    run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      return Promise.resolve(
        runD1Statement(state, query, values) as D1Result<T>,
      );
    },
    all<T = unknown>(): Promise<D1Result<T>> {
      return Promise.resolve({
        meta: {
          changed_db: false,
          changes: 0,
          duration: 0,
          last_row_id: 0,
          rows_read: 0,
          rows_written: 0,
          served_by: "test",
          size_after: 0,
        },
        results: [],
        success: true,
      });
    },
  } as D1PreparedStatement;
}

function selectD1Row(
  state: MockState,
  query: string,
  values: unknown[],
): Record<string, unknown> | null {
  if (query.startsWith("SELECT * FROM users WHERE discord_id = ?")) {
    return state.users.get(String(values[0])) ?? null;
  }
  if (query.startsWith("SELECT * FROM auth_codes WHERE code = ?")) {
    return state.authCodes.get(String(values[0])) ?? null;
  }
  if (query.startsWith("SELECT * FROM otp_challenges WHERE challenge_id = ?")) {
    return state.otpChallenges.get(String(values[0])) ?? null;
  }
  if (query.startsWith("DELETE FROM otp_challenges")) {
    const challengeId = String(values[0]);
    const row = state.otpChallenges.get(challengeId) ?? null;
    state.otpChallenges.delete(challengeId);
    return row;
  }
  if (query.startsWith("SELECT discord_id, token_hash, expires_at")) {
    return null;
  }
  return null;
}

function runD1Statement(
  state: MockState,
  query: string,
  values: unknown[],
): D1Result {
  let changes = 0;
  if (query.includes("INSERT OR IGNORE INTO auth_codes")) {
    state.authCodes.set(String(values[0]), {
      app_id: values[1],
      discord_id: String(values[2]),
      display_name: String(values[3]),
      role: values[4] === "admin" ? "admin" : "user",
      icon_source: values[5],
      icon_key: values[6],
      expires_at: values[8],
    });
    changes = 1;
  } else if (query.startsWith("DELETE FROM auth_codes")) {
    changes = state.authCodes.delete(String(values[0])) ? 1 : 0;
  } else if (query.includes("INSERT INTO otp_rate_limits")) {
    changes = 1;
  } else if (query.includes("INSERT OR IGNORE INTO otp_challenges")) {
    state.otpChallenges.set(String(values[0]), {
      challenge_id: values[0],
      discord_id: values[1],
      app_id: values[2],
      return_to: values[3],
      otp_hash: values[4],
      expires_at: values[6],
    });
    changes = 1;
  } else if (query.startsWith("DELETE FROM otp_challenges")) {
    changes = state.otpChallenges.delete(String(values[0])) ? 1 : 0;
  } else if (query.includes("INSERT OR IGNORE INTO remember_tokens")) {
    state.rememberCreateCount += 1;
    changes = 1;
  }
  return {
    meta: {
      changed_db: true,
      changes,
      duration: 0,
      last_row_id: 0,
      rows_read: 0,
      rows_written: changes,
      served_by: "test",
      size_after: 0,
    },
    results: [],
    success: true,
  };
}
