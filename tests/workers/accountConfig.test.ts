import { expect, test } from "vitest";
import { loadAccountConfig } from "../../workers/account/src/accountConfig.js";
import type { Env } from "../../workers/account/src/types.js";

const baseEnv = {
  ACCOUNT_URL: "https://auth.example.com",
  ASSETS: {} as R2Bucket,
  DB: {} as D1Database,
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
  OTP_HMAC_SECRET: "otp-secret",
  SESSION_HMAC_SECRET: "session-secret",
  SESSION_KID: "session-key",
} satisfies Env;

test("Account config derives allowed return_to origins from app callback URLs", () => {
  const config = loadAccountConfig(baseEnv);

  expect(config.navigation.ALLOWED_RETURN_TO_ORIGINS).toBe(
    "https://app.example.com",
  );
  expect(config.apps[0]?.sessionVerifySecret).toBe("app-session-secret");
  expect(config.environment).toBe("production");
});

test("Account config accepts the generated local environment flag", () => {
  const config = loadAccountConfig({
    ...baseEnv,
    LINK_AUTH_ENV: "local",
  });

  expect(config.environment).toBe("local");
});

test("Account config rejects invalid environment flags", () => {
  expect(() =>
    loadAccountConfig({
      ...baseEnv,
      LINK_AUTH_ENV: "staging",
    }),
  ).toThrow("LINK_AUTH_ENV must be local or production");
});

test("Account config can override the Discord API base for local E2E mocks", () => {
  const config = loadAccountConfig({
    ...baseEnv,
    DISCORD_API_BASE: "http://localhost:8787/discord",
  });

  expect(config.discord.apiBase).toBe("http://localhost:8787/discord");
});

test("Account config rejects AUTH_APPS when it is not an array", () => {
  expect(() =>
    loadAccountConfig({
      ...baseEnv,
      AUTH_APPS: JSON.stringify({ app_id: "hub" }),
    }),
  ).toThrow("AUTH_APPS must be an array");
});

test("Account config rejects invalid app definitions", () => {
  expect(() =>
    loadAccountConfig({
      ...baseEnv,
      AUTH_APPS: JSON.stringify([
        {
          app_id: "hub",
        },
      ]),
    }),
  ).toThrow("AUTH_APPS item is invalid");
});

test("Account config rejects non-string session verify secrets", () => {
  expect(() =>
    loadAccountConfig({
      ...baseEnv,
      AUTH_APPS: JSON.stringify([
        {
          app_id: "hub",
          callback_url: "https://app.example.com/_auth/callback",
          session_verify_secret: 123,
        },
      ]),
    }),
  ).toThrow("AUTH_APPS item is invalid");
});
