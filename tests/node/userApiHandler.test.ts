import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { expect, test } from "vitest";
import { handleUserApiRequest } from "../../lambdas/user-api/src/index.js";
import { createInternalHeaders } from "../../shared/src/internalSignature.js";
import {
  createUserApiContext,
  parseJsonResponse,
} from "./userApiTestHelpers.js";

const internalHmac = {
  kid: "internal-key",
  secret: "internal-secret",
};

test("User API handler rejects requests with an invalid internal signature", async () => {
  const { context } = createUserApiContext();
  const event = await createEvent("/users/get", { discord_id: "123456789" });
  event.headers["X-Internal-Signature"] = "invalid-signature";

  const response = await handleUserApiRequest(event, context, internalHmac);

  expect(response.statusCode).toBe(401);
  expect(parseJsonResponse(response)).toEqual({ error: "invalid_signature" });
});

test("User API handler returns not_found for signed unknown paths", async () => {
  const { context } = createUserApiContext();
  const event = await createEvent("/unknown", {});

  const response = await handleUserApiRequest(event, context, internalHmac);

  expect(response.statusCode).toBe(404);
  expect(parseJsonResponse(response)).toEqual({ error: "not_found" });
});

test("User API handler rejects signed nonce replay", async () => {
  const { context } = createUserApiContext();
  const event = await createEvent("/unknown", {});

  const firstResponse = await handleUserApiRequest(
    event,
    context,
    internalHmac,
  );
  const secondResponse = await handleUserApiRequest(
    event,
    context,
    internalHmac,
  );

  expect(firstResponse.statusCode).toBe(404);
  expect(secondResponse.statusCode).toBe(401);
  expect(parseJsonResponse(secondResponse)).toEqual({
    error: "invalid_signature",
  });
});

test("User API handler returns active users through the signed boundary", async () => {
  const { context } = createUserApiContext([
    {
      pk: "USER#123456789",
      sk: "PROFILE",
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
      status: "active",
    },
  ]);
  const event = await createEvent("/users/get", { discord_id: "123456789" });

  const response = await handleUserApiRequest(event, context, internalHmac);

  expect(response.statusCode).toBe(200);
  expect(parseJsonResponse(response)).toEqual({
    user: {
      pk: "USER#123456789",
      sk: "PROFILE",
      discord_id: "123456789",
      display_name: "Akaaku",
      role: "admin",
      status: "active",
    },
  });
});

async function createEvent(
  path: string,
  body: Record<string, unknown>,
): Promise<APIGatewayProxyEventV2> {
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  const headers = await createInternalHeaders({
    body: rawBody,
    kid: internalHmac.kid,
    method: "POST",
    nonce: "nonce",
    path,
    query: new URLSearchParams(),
    secret: internalHmac.secret,
    timestamp: new Date().toISOString(),
  });
  return {
    body: JSON.stringify(body),
    headers,
    isBase64Encoded: false,
    rawPath: path,
    rawQueryString: "",
    requestContext: {
      accountId: "account",
      apiId: "api",
      domainName: "user-api.example.com",
      domainPrefix: "user-api",
      http: {
        method: "POST",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "vitest",
      },
      requestId: "request",
      routeKey: "POST /{proxy+}",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: Date.now(),
    },
    routeKey: "POST /{proxy+}",
    version: "2.0",
  };
}
