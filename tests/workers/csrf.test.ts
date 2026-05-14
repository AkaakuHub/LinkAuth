import { expect, test } from "vitest";
import { createCsrfToken, verifyCsrfToken } from "../../src/csrf.js";

const baseInput = {
  discordId: "123456789",
  origin: "https://auth.example.com",
  action: "profile",
  kid: "csrf-key",
  secret: "csrf-secret",
  now: 1_800_000_000,
} as const;

test("CSRF token verifies for the same user, origin, action, key, and time window", async () => {
  const token = await createCsrfToken(baseInput);

  expect(await verifyCsrfToken({ ...baseInput, token })).toBe(true);
});

test("CSRF token rejects origin mismatch", async () => {
  const token = await createCsrfToken(baseInput);

  expect(
    await verifyCsrfToken({
      ...baseInput,
      token,
      origin: "https://evil.example.com",
    }),
  ).toBe(false);
});

test("CSRF token rejects action mismatch", async () => {
  const token = await createCsrfToken(baseInput);

  expect(
    await verifyCsrfToken({
      ...baseInput,
      token,
      action: "delete",
    }),
  ).toBe(false);
});

test("CSRF token rejects user mismatch", async () => {
  const token = await createCsrfToken(baseInput);

  expect(
    await verifyCsrfToken({
      ...baseInput,
      token,
      discordId: "987654321",
    }),
  ).toBe(false);
});

test("CSRF token rejects key id mismatch", async () => {
  const token = await createCsrfToken(baseInput);

  expect(
    await verifyCsrfToken({
      ...baseInput,
      token,
      kid: "other-key",
    }),
  ).toBe(false);
});

test("CSRF token rejects expired tokens", async () => {
  const token = await createCsrfToken(baseInput);

  expect(
    await verifyCsrfToken({
      ...baseInput,
      token,
      now: baseInput.now + 7_201,
    }),
  ).toBe(false);
});

test("CSRF token rejects malformed tokens without throwing", async () => {
  expect(
    await verifyCsrfToken({
      ...baseInput,
      token: "not-json.not-json.not-json",
    }),
  ).toBe(false);
});
