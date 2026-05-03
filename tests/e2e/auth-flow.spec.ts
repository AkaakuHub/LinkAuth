import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import {
  appSessionCookieName,
  rememberCookieName,
  sessionCookieName,
} from "../../shared/src/session.js";
import accountWorker from "../../workers/account/src/index.js";
import type { Env as AccountEnv } from "../../workers/account/src/types.js";
import appWorker from "../../workers/app/src/index.js";

type WorkerHandler<Env> = NonNullable<ExportedHandler<Env>["fetch"]>;

type TestServer = {
  origin: string;
  close(): Promise<void>;
};

type MockState = {
  authCodes: Map<
    string,
    { discord_id: string; display_name: string; role: "user" | "admin" }
  >;
  lastOtp: string | null;
  rememberCreateCount: number;
};

const user = {
  discord_id: "123456789",
  display_name: "Akaaku",
  role: "admin",
} as const;

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

  await expect(
    page.getByRole("heading", { name: "appセッションが有効です" }),
  ).toBeVisible();
  await expect(
    page.getByText("Akaakuとしてこのappを利用できます。"),
  ).toBeVisible();

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

  await expect(
    page.getByRole("heading", { name: "appセッションが有効です" }),
  ).toBeVisible();

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

async function startAuthFlowServers(): Promise<
  AsyncDisposable & {
    account: TestServer;
    app: TestServer;
    state: MockState;
  }
> {
  const state: MockState = {
    authCodes: new Map(),
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
      userApiOrigin: mock.origin,
    }),
  );
  accountOrigin = account.origin;
  const originalFetch = globalThis.fetch;
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
      await app.close();
      await account.close();
      await mock.close();
    },
  };
}

function accountEnv(input: {
  accountOrigin: string;
  appOrigin: string;
  userApiOrigin: string;
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
    DISCORD_API_BASE: `${input.userApiOrigin}/discord`,
    DISCORD_BOT_TOKEN: "discord-bot-token",
    DISCORD_CLIENT_ID: "discord-client-id",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
    DISCORD_GUILD_IDS: "guild",
    DOMAIN_NAME: "localhost",
    INTERNAL_HMAC_KID: "internal-key",
    INTERNAL_HMAC_SECRET: "internal-secret",
    SESSION_HMAC_SECRET: "account-session-secret",
    SESSION_KID: "session-key",
    USER_API_URL: input.userApiOrigin,
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
    if (url.pathname === "/users/verify-current-membership") {
      return Response.json({ user });
    }
    if (url.pathname === "/users/verify-active") {
      return Response.json({ user });
    }
    if (url.pathname === "/otp-challenge/create") {
      const body = (await request.json()) as {
        challenge_id?: unknown;
        discord_id?: unknown;
        otp?: unknown;
      };
      if (
        typeof body.challenge_id !== "string" ||
        body.discord_id !== user.discord_id ||
        typeof body.otp !== "string"
      ) {
        return Response.json(
          { error: "invalid_otp_challenge" },
          { status: 400 },
        );
      }
      state.lastOtp = body.otp;
      return Response.json({ ok: true });
    }
    if (url.pathname === "/otp-challenge/consume") {
      const body = (await request.json()) as { otp?: unknown };
      return body.otp === state.lastOtp
        ? Response.json({ discord_id: user.discord_id })
        : Response.json({ error: "invalid_otp" }, { status: 401 });
    }
    if (url.pathname === "/remember/create") {
      state.rememberCreateCount += 1;
      return Response.json({ ok: true });
    }
    if (url.pathname === "/auth-code/create") {
      const body = (await request.json()) as {
        app_id?: unknown;
        code?: unknown;
        user?: unknown;
      };
      if (body.app_id !== "hub" || typeof body.code !== "string") {
        return Response.json({ error: "invalid_auth_code" }, { status: 400 });
      }
      state.authCodes.set(body.code, user);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/auth-code/consume") {
      const body = (await request.json()) as {
        app_id?: unknown;
        code?: unknown;
      };
      const authUser =
        body.app_id === "hub" && typeof body.code === "string"
          ? state.authCodes.get(body.code)
          : undefined;
      if (!authUser || typeof body.code !== "string") {
        return Response.json({ error: "invalid_auth_code" }, { status: 401 });
      }
      state.authCodes.delete(body.code);
      return Response.json({ user: authUser });
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
  const server = createServer(async (incoming, outgoing) => {
    try {
      await sendResponse(outgoing, await handler(await nodeRequest(incoming)));
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.end(error instanceof Error ? error.message : "internal error");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://localhost:${port}`,
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
  return new Request(`http://localhost:${port}${incoming.url ?? "/"}`, init);
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
