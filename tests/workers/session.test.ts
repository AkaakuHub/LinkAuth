import { expect, test } from "vitest";
import {
  createCookie,
  getBearerToken,
  getSingleCookie,
  type SessionPayload,
  signAuthToken,
  signSessionCookie,
  verifyAuthToken,
  verifySessionCookie,
} from "../../shared/src/session.js";

const secret = "session-secret";
const now = 1_800_000_000;
const payload = {
  discord_id: "123456789",
  role: "admin",
  display_name: "Akaaku",
  iat: now,
  exp: now + 86_400,
  kid: "session-key",
} satisfies SessionPayload;

test("Session cookie verifies a signed payload before expiration", async () => {
  const cookie = await signSessionCookie(payload, secret);

  expect(
    await verifySessionCookie(cookie, { "session-key": secret }, now),
  ).toEqual(payload);
});

test("Auth token verifies the same payload before expiration", async () => {
  const token = await signAuthToken(payload, secret);

  expect(await verifyAuthToken(token, { "session-key": secret }, now)).toEqual(
    payload,
  );
});

test("Session cookie rejects tampered signatures", async () => {
  const cookie = await signSessionCookie(payload, secret);
  const tamperedCookie = `${cookie.slice(0, -1)}x`;

  expect(
    await verifySessionCookie(tamperedCookie, { "session-key": secret }, now),
  ).toBeNull();
});

test("Session cookie rejects expired payloads", async () => {
  const cookie = await signSessionCookie(payload, secret);

  expect(
    await verifySessionCookie(cookie, { "session-key": secret }, payload.exp),
  ).toBeNull();
});

test("Session cookie rejects malformed values without throwing", async () => {
  expect(
    await verifySessionCookie(
      "not-json.not-json.not-json",
      { "session-key": secret },
      now,
    ),
  ).toBeNull();
});

test("Session cookie rejects duplicate cookie values", () => {
  expect(getSingleCookie("sid=first; sid=second", "sid")).toBeNull();
});

test("Bearer token is extracted from an Authorization header", () => {
  expect(getBearerToken("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
});

test("Bearer token rejects malformed Authorization headers", () => {
  expect(getBearerToken("Bearer aaa.bbb.ccc extra")).toBeNull();
  expect(getBearerToken("Basic aaa.bbb.ccc")).toBeNull();
});

test("Session cookie is Secure, HttpOnly, and SameSite=Lax", () => {
  expect(createCookie("sid", "value", 60)).toBe(
    "sid=value; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
});
