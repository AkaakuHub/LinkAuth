import { expect, test } from "vitest";
import { matchesCallbackUrl } from "../../workers/account/src/domain/appRegistry.js";

const callbackUrl = "https://app.example.com/_auth/callback";

test("Callback URL matching allows query strings on the configured callback", () => {
  expect(
    matchesCallbackUrl(
      "https://app.example.com/_auth/callback?return_to=https%3A%2F%2Fapp.example.com%2F",
      callbackUrl,
    ),
  ).toBe(true);
});

test("Callback URL matching rejects path mismatch", () => {
  expect(matchesCallbackUrl("https://app.example.com/other", callbackUrl)).toBe(
    false,
  );
});

test("Callback URL matching rejects origin mismatch", () => {
  expect(
    matchesCallbackUrl("https://evil.example.com/_auth/callback", callbackUrl),
  ).toBe(false);
});

test("Callback URL matching rejects malformed URLs", () => {
  expect(matchesCallbackUrl("not a url", callbackUrl)).toBe(false);
});
