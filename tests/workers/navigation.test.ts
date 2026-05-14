import { expect, test } from "vitest";
import { normalizeReturnTo } from "../../workers/account/src/domain/navigation.js";

const config = {
  ACCOUNT_URL: "https://auth.example.com/",
  ALLOWED_RETURN_TO_ORIGINS:
    "https://app.example.com,https://admin.example.com",
  AUTH_CALLBACK_URL: "https://auth.example.com/callback",
};

test("Return URL allows configured origins and strips fragments", () => {
  expect(
    normalizeReturnTo("https://app.example.com/callback?x=1#secret", config),
  ).toBe("https://app.example.com/callback?x=1");
});

test("Return URL rejects credentials in the URL", () => {
  expect(
    normalizeReturnTo("https://user:pass@app.example.com/callback", config),
  ).toBeNull();
});

test("Return URL rejects unconfigured origins", () => {
  expect(
    normalizeReturnTo("https://evil.example.com/callback", config),
  ).toBeNull();
});
