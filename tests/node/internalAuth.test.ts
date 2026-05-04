import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { expect, test } from "vitest";
import { verifyInternalSignature } from "../../lambdas/user-api/src/internalAuth.js";
import { createInternalHeaders } from "../../shared/src/internalSignature.js";
import { createUserApiContext } from "./userApiTestHelpers.js";

const config = {
  kid: "internal-key",
  secret: "internal-secret",
};
const body = Buffer.from(JSON.stringify({ ok: true }), "utf8");
const timestamp = new Date().toISOString();

test("Internal signature accepts a correctly signed request", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "b=2&a=1",
    body,
    timestamp,
  });

  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    true,
  );
});

test("Internal signature rejects body tampering", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "",
    body,
    timestamp,
  });

  expect(
    await verifyInternalSignature(
      event,
      Buffer.from('{"ok":false}'),
      config,
      context,
    ),
  ).toBe(false);
});

test("Internal signature rejects path tampering", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "",
    body,
    timestamp,
  });
  event.rawPath = "/remember/delete";

  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    false,
  );
});

test("Internal signature rejects query tampering", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "a=1",
    body,
    timestamp,
  });
  event.rawQueryString = "a=2";

  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    false,
  );
});

test("Internal signature rejects an old timestamp", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "",
    body,
    timestamp: new Date(Date.now() - 300_001).toISOString(),
  });

  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    false,
  );
});

test("Internal signature rejects nonce replay", async () => {
  const { context } = createUserApiContext();
  const event = await signedEvent({
    method: "POST",
    path: "/users/active",
    query: "",
    body,
    timestamp,
  });

  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    true,
  );
  expect(await verifyInternalSignature(event, body, config, context)).toBe(
    false,
  );
});

async function signedEvent(input: {
  method: string;
  path: string;
  query: string;
  body: Buffer;
  timestamp: string;
}): Promise<APIGatewayProxyEventV2> {
  const nonce = "nonce";
  const headers = await createInternalHeaders({
    body: input.body,
    kid: config.kid,
    method: input.method,
    nonce,
    path: input.path,
    query: new URLSearchParams(input.query),
    secret: config.secret,
    timestamp: input.timestamp,
  });
  return {
    version: "2.0",
    routeKey: `${input.method} ${input.path}`,
    headers,
    isBase64Encoded: false,
    rawPath: input.path,
    rawQueryString: input.query,
    requestContext: {
      accountId: "account",
      apiId: "api",
      domainName: "api.example.com",
      domainPrefix: "api",
      http: {
        method: input.method,
        path: input.path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "node-test",
      },
      requestId: "request",
      routeKey: `${input.method} ${input.path}`,
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: Date.now(),
    },
  };
}
