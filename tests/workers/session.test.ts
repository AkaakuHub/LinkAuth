import {
  base64UrlDecodeText,
  base64UrlEncodeText,
  createCookie,
  createSessionCookie,
  getBearerToken,
  getSingleCookie,
  type SessionPayload,
  signAuthToken,
  verifyAuthToken,
} from "link-auth";
import { expect, test } from "vitest";

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

test("Auth token verifies a signed payload before expiration", async () => {
  const token = await signAuthToken(payload, secret);

  expect(await verifyAuthToken(token, { "session-key": secret }, now)).toEqual(
    payload,
  );
});

test("Auth token rejects tampered signatures", async () => {
  const token = await signAuthToken(payload, secret);
  const tamperedToken = `${token.slice(0, -1)}x`;

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects unknown key ids", async () => {
  const token = await signAuthToken({ ...payload, kid: "unknown-key" }, secret);

  expect(
    await verifyAuthToken(token, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects unsupported header algorithms", async () => {
  const token = await signAuthToken(payload, secret);
  const tamperedToken = tamperTokenHeader(token, { alg: "none" });

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects unsupported header types", async () => {
  const token = await signAuthToken(payload, secret);
  const tamperedToken = tamperTokenHeader(token, { typ: "api" });

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects mismatched payload key ids", async () => {
  const token = await signAuthToken(payload, secret);
  const tamperedToken = tamperTokenPayload(token, { kid: "other-key" });

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects invalid roles", async () => {
  const token = await signAuthToken(payload, secret);
  const tamperedToken = tamperTokenPayload(token, { role: "owner" });

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects invalid persistent values", async () => {
  const token = await signAuthToken({ ...payload, persistent: false }, secret);
  const tamperedToken = tamperTokenPayload(token, { persistent: "false" });

  expect(
    await verifyAuthToken(tamperedToken, { "session-key": secret }, now),
  ).toBeNull();
});

test("Auth token rejects expired payloads", async () => {
  const token = await signAuthToken(payload, secret);

  expect(
    await verifyAuthToken(token, { "session-key": secret }, payload.exp),
  ).toBeNull();
});

test("Auth token rejects malformed values without throwing", async () => {
  expect(
    await verifyAuthToken(
      "not-json.not-json.not-json",
      { "session-key": secret },
      now,
    ),
  ).toBeNull();
});

test("Session cookie rejects duplicate cookie values", () => {
  expect(getSingleCookie("sid=first; sid=second", "sid")).toBeNull();
});

test("Session cookie rejects malformed percent encoding", () => {
  expect(getSingleCookie("sid=%", "sid")).toBeNull();
});

test("Bearer token is extracted from an Authorization header", () => {
  expect(getBearerToken("Bearer aaa.bbb.ccc")).toBe("aaa.bbb.ccc");
  expect(
    getBearerToken(
      "Bearer lka_pat_abcdefghijklmnopqrstuvwx.abcdefghijklmnopqrstuvwxyzABCDEFGHI",
    ),
  ).toBe(
    "lka_pat_abcdefghijklmnopqrstuvwx.abcdefghijklmnopqrstuvwxyzABCDEFGHI",
  );
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

test("Session cookie without Max-Age is scoped to the browser session", () => {
  expect(createSessionCookie("sid", "value")).toBe(
    "sid=value; Path=/; HttpOnly; Secure; SameSite=Lax",
  );
});

function tamperTokenHeader(
  token: string,
  values: Record<string, unknown>,
): string {
  return tamperTokenPart(token, 0, values);
}

function tamperTokenPayload(
  token: string,
  values: Record<string, unknown>,
): string {
  return tamperTokenPart(token, 1, values);
}

function tamperTokenPart(
  token: string,
  index: 0 | 1,
  values: Record<string, unknown>,
): string {
  const parts = token.split(".");
  const part = parts[index];
  if (parts.length !== 3 || !part) {
    throw new Error("Auth token is malformed");
  }
  const parsed = JSON.parse(base64UrlDecodeText(part)) as Record<
    string,
    unknown
  >;
  const tampered = base64UrlEncodeText(
    JSON.stringify({ ...parsed, ...values }),
  );
  return parts
    .map((value, partIndex) => (partIndex === index ? tampered : value))
    .join(".");
}
