import { expect, test } from "@playwright/test";
import {
  appSessionCookieName,
  rememberCookieName,
  sessionCookieName,
} from "../../src/session.js";
import {
  createPersonalAccessTokenFromAccountPage,
  expireCookies,
  loginWithOtp,
  openAccountPage,
  startAuthFlowServers,
  startOtpLogin,
  user,
} from "./authFlowSupport.js";

test("App login completes through Discord OTP and creates a remember cookie by default", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await loginWithOtp(page, servers);

  const cookies = await page.context().cookies();
  const appSessionCookie = cookies.find(
    (cookie) => cookie.name === appSessionCookieName("hub"),
  );
  const accountSessionCookie = cookies.find(
    (cookie) => cookie.name === sessionCookieName,
  );
  expect(
    cookies.some((cookie) => cookie.name === appSessionCookieName("hub")),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === sessionCookieName)).toBe(
    true,
  );
  expect(cookies.some((cookie) => cookie.name === rememberCookieName)).toBe(
    true,
  );
  expectCookieMaxAge(appSessionCookie, 15_552_000);
  expectCookieMaxAge(accountSessionCookie, 86_400);
  expectCookieMaxAge(
    cookies.find((cookie) => cookie.name === rememberCookieName),
    15_552_000,
  );
  expect(servers.state.rememberCreateCount).toBe(1);
});

test("App login completes without a remember cookie when remember_me is off", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await loginWithOtp(page, servers, { rememberMe: false });

  const cookies = await page.context().cookies();
  const appSessionCookie = cookies.find(
    (cookie) => cookie.name === appSessionCookieName("hub"),
  );
  const accountSessionCookie = cookies.find(
    (cookie) => cookie.name === sessionCookieName,
  );
  expect(
    cookies.some((cookie) => cookie.name === appSessionCookieName("hub")),
  ).toBe(true);
  expect(cookies.some((cookie) => cookie.name === sessionCookieName)).toBe(
    true,
  );
  expect(cookies.some((cookie) => cookie.name === rememberCookieName)).toBe(
    false,
  );
  expect(appSessionCookie?.expires).toBe(-1);
  expect(accountSessionCookie?.expires).toBe(-1);
  expect(servers.state.rememberCreateCount).toBe(0);
});

function expectCookieMaxAge(
  cookie: { expires: number } | undefined,
  seconds: number,
): void {
  expect(cookie).toBeDefined();
  if (!cookie) {
    throw new Error("cookie was not set");
  }
  const now = Math.floor(Date.now() / 1000);
  expect(cookie.expires).toBeGreaterThanOrEqual(now + seconds - 30);
  expect(cookie.expires).toBeLessThanOrEqual(now + seconds + 30);
}

test("App session is cleared after logging out from the account page", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await loginWithOtp(page, servers);

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

test("App login rejects an invalid OTP without creating sessions", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await startOtpLogin(page, servers);
  const invalidOtp = servers.state.lastOtp === "000000" ? "000001" : "000000";
  await page.getByLabel("認証コード").fill(invalidOtp);
  await page.getByRole("button", { name: "認証" }).click();

  await expect(
    page.getByRole("heading", { name: "認証に失敗しました" }),
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
});

test("Remember cookie restores login without another OTP challenge", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await loginWithOtp(page, servers);
  expect(servers.state.otpSendCount).toBe(1);
  await expireCookies(page, [appSessionCookieName("hub"), sessionCookieName]);

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();

  await expect(page.getByRole("heading", { name: "Akaaku" })).toBeVisible();
  await expect(page.getByText("@123456789")).toBeVisible();
  expect(servers.state.otpSendCount).toBe(1);

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
});

test("Account page creates a personal access token", async ({ page }) => {
  await using servers = await startAuthFlowServers();

  await openAccountPage(page, servers);
  await page.getByLabel("名前").fill("local curl");
  await page.getByRole("button", { name: "発行" }).click();

  await expect(page.getByText("発行済みtoken").first()).toBeVisible();
  await expect(
    page.locator("code").filter({ hasText: "lka_pat_" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "コピー" })).toBeVisible();
  expect(servers.state.personalAccessTokens.size).toBe(1);
});

test("Account page revokes a personal access token", async ({ page }) => {
  await using servers = await startAuthFlowServers();

  await createPersonalAccessTokenFromAccountPage(page, servers);
  await page.getByRole("button", { name: "失効" }).click();

  await expect(page.getByText("revoked")).toBeVisible();
  const [token] = servers.state.personalAccessTokens.values();
  expect(token?.revoked_at).toEqual(expect.any(String));
});

test("Account profile update rejects tampered CSRF tokens", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await openAccountPage(page, servers);
  await page.getByRole("button", { name: "編集" }).click();
  await page.getByLabel("表示名").fill("Changed Akaaku");
  await page
    .locator('[data-profile-form] input[name="csrf_token"]')
    .evaluate((input) => {
      if (input instanceof HTMLInputElement) {
        input.value = "tampered";
      }
    });
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.getByText("forbidden")).toBeVisible();
  expect(servers.state.users.get(user.discord_id)?.display_name).toBe("Akaaku");
});

test("Inactive users cannot complete app login", async ({ page }) => {
  await using servers = await startAuthFlowServers({
    user: {
      ...user,
      disabled_reason: "manual",
      status: "disabled",
    },
  });

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();

  await expect(
    page.getByRole("heading", { name: "利用資格がありません" }),
  ).toBeVisible();
  expect(servers.state.otpSendCount).toBe(0);
});

test("Account deletion clears auth cookies and prevents reuse", async ({
  page,
}) => {
  await using servers = await startAuthFlowServers();

  await openAccountPage(page, servers);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "削除" }).click();

  await expect(page).toHaveURL(`${servers.app.origin}/login`);
  await expect(
    page.getByRole("heading", { name: "appにログイン" }),
  ).toBeVisible();
  expect(servers.state.users.get(user.discord_id)?.status).toBe("deleted");
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

  await page.goto(`${servers.app.origin}/login`);
  await page.getByRole("button", { name: "認証して続行" }).click();
  await expect(
    page.getByRole("heading", { name: "利用資格がありません" }),
  ).toBeVisible();
});
