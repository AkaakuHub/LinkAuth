import { expect, test } from "vitest";
import type { AccountConfig } from "../../workers/account/src/accountConfig.js";
import {
  createAuthState,
  parseAuthState,
} from "../../workers/account/src/security/authState.js";

const config = {
  csrf: {
    kid: "csrf-key",
    secret: "csrf-secret",
  },
  navigation: {
    ACCOUNT_URL: "https://auth.example.com",
    ALLOWED_RETURN_TO_ORIGINS: "https://app.example.com",
    AUTH_BASE_URL: "https://auth.example.com",
    AUTH_CALLBACK_URL: "https://auth.example.com/callback",
  },
} as AccountConfig;

test("Auth state keeps an allowed return_to after signature verification", async () => {
  const state = await createAuthState(
    "https://app.example.com/callback",
    config,
  );

  const parsed = await parseAuthState(state, config);

  expect(parsed).toEqual({
    return_to: "https://app.example.com/callback",
  });
});

test("Auth state keeps the app id after signature verification", async () => {
  const state = await createAuthState(
    "https://app.example.com/callback",
    config,
    "hub",
  );

  const parsed = await parseAuthState(state, config);

  expect(parsed).toEqual({
    app_id: "hub",
    return_to: "https://app.example.com/callback",
  });
});

test("Auth state rejects tampered signatures", async () => {
  const state = await createAuthState(
    "https://app.example.com/callback",
    config,
  );
  expect(state).toBeTruthy();
  if (!state) {
    throw new Error("Auth state was not created");
  }

  const tamperedState = `${state.slice(0, -1)}x`;

  expect(await parseAuthState(tamperedState, config)).toBeNull();
});

test("Auth state rejects disallowed return_to values", async () => {
  expect(
    await createAuthState("https://evil.example.com/callback", config),
  ).toBeNull();
});
