import { expect, type Page } from "@playwright/test";
import accountWorker from "../../workers/account/src/index.js";
import type { Env as AccountEnv } from "../../workers/account/src/types.js";
import appWorker from "../../workers/app/src/index.js";
import { testD1Database, unusedR2Bucket } from "./authFlowD1.js";
import { startHttpServer } from "./authFlowHttp.js";
import {
  type MockState,
  type MockUser,
  type TestServer,
  user,
} from "./authFlowTypes.js";

type WorkerHandler<Env> = NonNullable<ExportedHandler<Env>["fetch"]>;

export { user } from "./authFlowTypes.js";

export async function loginWithOtp(
  page: Page,
  servers: { app: TestServer; state: MockState },
  options: { rememberMe?: boolean } = {},
): Promise<void> {
  await startOtpLogin(page, servers);
  if (options.rememberMe === false) {
    await page
      .getByRole("checkbox", { name: "この端末でログイン状態を保持する" })
      .uncheck();
  }
  await page.getByLabel("認証コード").fill(servers.state.lastOtp ?? "");
  await page.getByRole("button", { name: "認証" }).click();
  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();
  await expect(page.getByText("@123456789")).toBeVisible();
}

export async function startOtpLogin(
  page: Page,
  servers: { app: TestServer; state: MockState },
): Promise<void> {
  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();
  await expect(page.getByRole("heading", { name: "OTP認証" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", {
      name: "この端末でログイン状態を保持する",
    }),
  ).toBeChecked();
  expect(servers.state.lastOtp).toMatch(/^[0-9]{6}$/);
}

export async function openAccountPage(
  page: Page,
  servers: { app: TestServer; state: MockState },
): Promise<void> {
  await loginWithOtp(page, servers);
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();
}

export async function createPersonalAccessTokenFromAccountPage(
  page: Page,
  servers: { app: TestServer; state: MockState },
): Promise<void> {
  await openAccountPage(page, servers);
  await page.getByLabel("名前").fill("local curl");
  await page.getByRole("button", { name: "発行" }).click();
  await expect(page.getByText("発行済みtoken").first()).toBeVisible();
}

export async function expireCookies(
  page: Page,
  names: string[],
): Promise<void> {
  await page.context().addCookies(
    names.map((name) => ({
      domain: "localhost",
      expires: 0,
      httpOnly: true,
      name,
      path: "/",
      sameSite: "Lax",
      secure: true,
      value: "",
    })),
  );
}

export async function startAuthFlowServers(
  options: { user?: MockUser } = {},
): Promise<
  AsyncDisposable & {
    account: TestServer;
    app: TestServer;
    state: MockState;
  }
> {
  const state: MockState = {
    authCodes: new Map(),
    users: new Map([[user.discord_id, options.user ?? user]]),
    otpChallenges: new Map(),
    personalAccessTokens: new Map(),
    rememberTokens: new Map(),
    lastOtp: null,
    otpSendCount: 0,
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
        state.otpSendCount += 1;
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

const executionContext = {
  passThroughOnException(): void {},
  props: undefined,
  waitUntil(): void {},
} satisfies ExecutionContext<unknown>;
